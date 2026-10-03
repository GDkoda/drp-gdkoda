import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, rpc, useRefresh, categoryLabel, bonusLabel } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/mestre")({
  head: () => ({ meta: [{ title: "Painel do Mestre — Mesa 3D&T" }, { name: "description", content: "Gerencie jogadores, loja e tesouros." }] }),
  component: Mestre,
});

function Mestre() {
  const { data: me } = useMe();
  if (me && !me.isMaster) return <p>Apenas o Mestre pode ver esta página.</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl text-gold">Painel do Mestre</h1>
      <Tabs defaultValue="players">
        <TabsList className="w-full">
          <TabsTrigger value="players" className="flex-1">Jogadores</TabsTrigger>
          <TabsTrigger value="shop" className="flex-1">Loja</TabsTrigger>
          <TabsTrigger value="log" className="flex-1">Registro</TabsTrigger>
        </TabsList>
        <TabsContent value="players"><Players /></TabsContent>
        <TabsContent value="shop"><ShopAdmin /></TabsContent>
        <TabsContent value="log"><Log /></TabsContent>
      </Tabs>
    </div>
  );
}

function usePlayers() {
  return useQuery({
    queryKey: ["players-full"],
    queryFn: async () => (await supabase.from("profiles").select("*").order("display_name")).data ?? [],
  });
}

function Players() {
  const refresh = useRefresh();
  const { data: players } = usePlayers();
  const { data: shop } = useQuery({ queryKey: ["shop-all"], queryFn: async () => (await supabase.from("shop_items").select("*").order("name")).data ?? [] });
  const [mass, setMass] = useState({ coins: 0, xp: 0 });
  const [deltas, setDeltas] = useState<Record<string, number>>({});

  async function distribute() {
    if (!players) return;
    for (const p of players) {
      if (mass.coins) await rpc("master_adjust_coins", { _user: p.id, _delta: mass.coins, _note: "Tesouro em massa" });
    }
    if (mass.xp) {
      const { data: chars } = await supabase.from("characters").select("id, xp");
      for (const c of chars ?? []) await supabase.from("characters").update({ xp: c.xp + mass.xp }).eq("id", c.id);
    }
    toast.success("Tesouro distribuído!");
    refresh();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-lg">Distribuir tesouro para todos</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="text-sm">Moedas <Input type="number" className="w-28" value={mass.coins} onChange={(e) => setMass({ ...mass, coins: +e.target.value })} /></label>
          <label className="text-sm">XP (todas as fichas) <Input type="number" className="w-28" value={mass.xp} onChange={(e) => setMass({ ...mass, xp: +e.target.value })} /></label>
          <Button className="self-end" onClick={distribute}>Distribuir</Button>
        </div>
      </section>
      {players?.map((p) => (
        <div key={p.id} className="rounded-lg border bg-card p-4">
          <div className="flex justify-between">
            <h3>{p.display_name} <span className="text-sm text-muted-foreground">@{p.username}</span></h3>
            <span className="text-gold">{p.coins} moedas</span>
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input type="number" placeholder="+/- moedas" className="sm:w-32" value={deltas[p.id] ?? ""} onChange={(e) => setDeltas({ ...deltas, [p.id]: +e.target.value })} />
            <Button size="sm" variant="secondary" onClick={async () => { await rpc("master_adjust_coins", { _user: p.id, _delta: deltas[p.id] ?? 0, _note: "Ajuste manual" }, "Saldo ajustado"); refresh(); }}>Ajustar</Button>
            <Select onValueChange={async (v) => { await rpc("master_give_item", { _user: p.id, _item: v }, "Item entregue"); refresh(); }}>
              <SelectTrigger className="sm:w-56"><SelectValue placeholder="Dar item…" /></SelectTrigger>
              <SelectContent>{shop?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      ))}
    </div>
  );
}

const empty = { name: "", description: "", category: "arma", price: 10, bonus: "" };

function ShopAdmin() {
  const refresh = useRefresh();
  const { data: shop } = useQuery({ queryKey: ["shop-all"], queryFn: async () => (await supabase.from("shop_items").select("*").order("name")).data ?? [] });
  const [form, setForm] = useState(empty);

  // bonus input format: "f:1, a:2, pv:5"
  const parseBonus = (s: string) => Object.fromEntries(s.split(",").map((x) => x.split(":").map((y) => y.trim())).filter(([k, v]) => k && v).map(([k, v]) => [k.toLowerCase(), Number(v)]));

  async function add() {
    const { error } = await supabase.from("shop_items").insert({ name: form.name, description: form.description, category: form.category, price: form.price, bonus: parseBonus(form.bonus) });
    if (error) return toast.error(error.message);
    setForm(empty); refresh();
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="text-lg">Novo item</h2>
        <Input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(categoryLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" className="sm:w-28" value={form.price} onChange={(e) => setForm({ ...form, price: +e.target.value })} />
          <Input placeholder="Bônus ex: f:1, a:1, pv:5" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} />
        </div>
        <Button disabled={!form.name} onClick={add}>Adicionar à loja</Button>
      </section>
      {shop?.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
          <div className="flex-1">
            <span className={s.active ? "" : "line-through opacity-60"}>{s.name}</span>
            <span className="ml-2 text-sm text-muted-foreground">{categoryLabel[s.category]} · {s.price} · {bonusLabel(s.bonus)}</span>
          </div>
          <Input type="number" className="w-24" defaultValue={s.price} onBlur={async (e) => { await supabase.from("shop_items").update({ price: +e.target.value }).eq("id", s.id); refresh(); }} />
          <Button size="sm" variant="secondary" onClick={async () => { await supabase.from("shop_items").update({ active: !s.active }).eq("id", s.id); refresh(); }}>{s.active ? "Ocultar" : "Mostrar"}</Button>
          <Button size="sm" variant="destructive" onClick={async () => { if (confirm("Remover?")) { await supabase.from("shop_items").delete().eq("id", s.id); refresh(); } }}>Remover</Button>
        </div>
      ))}
    </div>
  );
}

function Log() {
  const { data: players } = usePlayers();
  const { data: txs } = useQuery({ queryKey: ["alltx"], queryFn: async () => (await supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(200)).data ?? [] });
  const n = (id: string | null) => (id ? players?.find((p) => p.id === id)?.display_name ?? "?" : "—");
  return (
    <ul className="divide-y rounded-lg border bg-card text-sm">
      {txs?.map((t) => (
        <li key={t.id} className="flex flex-wrap justify-between gap-2 p-3">
          <span>{new Date(t.created_at).toLocaleString("pt-BR")} · <b>{t.kind}</b> {t.item_name ?? ""} · {n(t.from_user)} → {n(t.to_user)} {t.note ? `(${t.note})` : ""}</span>
          <span className="text-gold">{t.coins || ""}</span>
        </li>
      ))}
    </ul>
  );
}
