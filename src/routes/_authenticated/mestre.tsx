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
import { useServerFn } from "@tanstack/react-start";
import { deleteAccount } from "@/lib/admin.functions";

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
        <TabsList className="flex h-auto w-full flex-wrap">
          <TabsTrigger value="players" className="flex-1">Jogadores</TabsTrigger>
          <TabsTrigger value="shop" className="flex-1">Loja</TabsTrigger>
          <TabsTrigger value="rules" className="flex-1">Regras</TabsTrigger>
          <TabsTrigger value="monsters" className="flex-1">Monstros</TabsTrigger>
          <TabsTrigger value="puzzles" className="flex-1">Enigmas</TabsTrigger>
          <TabsTrigger value="log" className="flex-1">Registro</TabsTrigger>
        </TabsList>
        <TabsContent value="players"><Players /></TabsContent>
        <TabsContent value="shop"><ShopAdmin /></TabsContent>
        <TabsContent value="rules"><Rules /></TabsContent>
        <TabsContent value="monsters"><Monsters /></TabsContent>
        <TabsContent value="puzzles"><Puzzles /></TabsContent>
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
  const [vdeltas, setVdeltas] = useState<Record<string, number>>({});
  const del = useServerFn(deleteAccount);

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
            <span className="text-gold">{p.coins} moedas · {p.vigor} vigor</span>
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input type="number" placeholder="+/- moedas" className="sm:w-32" value={deltas[p.id] ?? ""} onChange={(e) => setDeltas({ ...deltas, [p.id]: +e.target.value })} />
            <Button size="sm" variant="secondary" onClick={async () => { await rpc("master_adjust_coins", { _user: p.id, _delta: deltas[p.id] ?? 0, _note: "Ajuste manual" }, "Saldo ajustado"); refresh(); }}>Ajustar</Button>
            <Select onValueChange={async (v) => { await rpc("master_give_item", { _user: p.id, _item: v }, "Item entregue"); refresh(); }}>
              <SelectTrigger className="sm:w-56"><SelectValue placeholder="Dar item…" /></SelectTrigger>
              <SelectContent>{shop?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input type="number" placeholder="+/- vigor" className="sm:w-32" value={vdeltas[p.id] ?? ""} onChange={(e) => setVdeltas({ ...vdeltas, [p.id]: +e.target.value })} />
            <Button size="sm" variant="secondary" onClick={async () => { await rpc("master_adjust_vigor", { _user: p.id, _delta: vdeltas[p.id] ?? 0 }, "Vigor ajustado"); refresh(); }}>Ajustar vigor</Button>
            <Button size="sm" variant="destructive" className="sm:ml-auto" onClick={async () => {
              if (prompt(`Para excluir PERMANENTEMENTE a conta de ${p.display_name}, digite o nome de usuário (${p.username}):`) !== p.username) return;
              try { await del({ data: { userId: p.id } }); toast.success("Conta excluída"); refresh(); } catch (e) { toast.error((e as Error).message); }
            }}>Excluir conta</Button>
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
  const parseBonus = (s: string) => Object.fromEntries(s.split(",").map((x) => x.split(":").map((y) => y.trim())).filter(([k, v]) => k && v).map(([k, v]) => [String(k).toLowerCase(), Number(v)]));

  async function add() {
    const { error } = await supabase.from("shop_items").insert({ name: form.name, description: form.description, category: form.category, price: form.price, bonus: parseBonus(form.bonus) });
    if (error) { toast.error(error.message); return; }
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

const ruleFields: [string, string][] = [
  ["vigor_daily", "Vigor diário"],
  ["combat_win_base", "Combate: vitória (base)"],
  ["combat_win_per_level", "Combate: vitória (+ por nível do monstro)"],
  ["combat_loss", "Combate: derrota (consolo)"],
  ["puzzle_reward", "Enigma: recompensa padrão"],
  ["checkin_per_day", "Check-in: moedas por dia de sequência"],
  ["dice_max_bet", "Dados: aposta máxima"],
];

function Rules() {
  const refresh = useRefresh();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: async () => (await (supabase as any).from("game_settings").select("*").eq("id", 1).single()).data });
  const [form, setForm] = useState<Record<string, number> | null>(null);
  const v = form ?? data;
  if (!v) return null;
  async function save() {
    const { id, updated_at, ...rest } = v as any;
    const { error } = await (supabase as any).from("game_settings").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) { toast.error(error.message); return; }
    toast.success("Regras salvas"); setForm(null); refresh();
  }
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-lg">Moedas e vigor</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {ruleFields.map(([k, l]) => (
          <label key={k} className="text-sm">{l}
            <Input type="number" value={v[k]} onChange={(e) => setForm({ ...v, [k]: +e.target.value })} />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Monstros e enigmas com recompensa própria ignoram os valores padrão.</p>
      <Button onClick={save}>Salvar regras</Button>
    </section>
  );
}

const emptyMonster = { name: "", f: 1, h: 1, a: 1, pdf: 0, pv: 5, reward: "" as number | "" };

function Monsters() {
  const refresh = useRefresh();
  const { data } = useQuery({ queryKey: ["monsters"], queryFn: async () => (await (supabase as any).from("monsters").select("*").order("name")).data ?? [] });
  const [form, setForm] = useState(emptyMonster);
  const db = (supabase as any).from("monsters");
  const num = ["f", "h", "a", "pdf", "pv"] as const;
  async function add() {
    const { error } = await (supabase as any).from("monsters").insert({ ...form, reward: form.reward === "" ? null : form.reward });
    if (error) { toast.error(error.message); return; }
    setForm(emptyMonster); refresh();
  }
  async function upd(id: string, patch: Record<string, unknown>) {
    const { error } = await (supabase as any).from("monsters").update(patch).eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }
  void db;
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="text-lg">Novo monstro</h2>
        <Input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {num.map((k) => <label key={k} className="text-xs uppercase">{k === "pv" ? "PV" : k}<Input type="number" value={form[k]} onChange={(e) => setForm({ ...form, [k]: +e.target.value })} /></label>)}
          <label className="text-xs">Moedas<Input type="number" placeholder="padrão" value={form.reward} onChange={(e) => setForm({ ...form, reward: e.target.value === "" ? "" : +e.target.value })} /></label>
        </div>
        <Button disabled={!form.name} onClick={add}>Adicionar monstro</Button>
      </section>
      {data?.map((m: any) => (
        <div key={m.id} className="space-y-2 rounded-lg border bg-card p-3">
          <Input defaultValue={m.name} className={m.active ? "" : "opacity-60"} onBlur={(e) => e.target.value !== m.name && upd(m.id, { name: e.target.value })} />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {num.map((k) => <label key={k} className="text-xs uppercase">{k === "pv" ? "PV" : k}<Input type="number" defaultValue={m[k]} onBlur={(e) => +e.target.value !== m[k] && upd(m.id, { [k]: +e.target.value })} /></label>)}
            <label className="text-xs">Moedas<Input type="number" placeholder="padrão" defaultValue={m.reward ?? ""} onBlur={(e) => upd(m.id, { reward: e.target.value === "" ? null : +e.target.value })} /></label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => upd(m.id, { active: !m.active })}>{m.active ? "Desativar" : "Ativar"}</Button>
            <Button size="sm" variant="destructive" onClick={async () => { if (confirm("Remover monstro?")) { await (supabase as any).from("monsters").delete().eq("id", m.id); refresh(); } }}>Remover</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Puzzles() {
  const refresh = useRefresh();
  const { data } = useQuery({ queryKey: ["puzzles"], queryFn: async () => (await (supabase as any).from("puzzles").select("*").order("created_at", { ascending: false })).data ?? [] });
  const [form, setForm] = useState({ question: "", answer: "", reward: "" as number | "" });
  async function add() {
    const { error } = await (supabase as any).from("puzzles").insert({ question: form.question, answer: form.answer.trim(), reward: form.reward === "" ? null : form.reward });
    if (error) { toast.error(error.message); return; }
    setForm({ question: "", answer: "", reward: "" }); refresh();
  }
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="text-lg">Novo enigma</h2>
        <textarea className="min-h-20 w-full rounded-md border bg-background p-2 text-sm" placeholder="Pergunta" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Resposta (sem diferenciar maiúsculas)" value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} />
          <Input type="number" className="sm:w-36" placeholder="Moedas (padrão)" value={form.reward} onChange={(e) => setForm({ ...form, reward: e.target.value === "" ? "" : +e.target.value })} />
        </div>
        <Button disabled={!form.question || !form.answer} onClick={add}>Adicionar enigma</Button>
        <p className="text-xs text-muted-foreground">Enigmas seus aparecem em cerca de 60% das partidas; o resto é gerado automaticamente.</p>
      </section>
      {data?.map((p: any) => (
        <div key={p.id} className="flex flex-wrap items-start gap-2 rounded-lg border bg-card p-3">
          <div className={"flex-1 " + (p.active ? "" : "opacity-60")}>
            <p>{p.question}</p>
            <p className="text-sm text-muted-foreground">Resposta: {p.answer} · {p.reward ?? "padrão"} moedas</p>
          </div>
          <Button size="sm" variant="secondary" onClick={async () => { await (supabase as any).from("puzzles").update({ active: !p.active }).eq("id", p.id); refresh(); }}>{p.active ? "Desativar" : "Ativar"}</Button>
          <Button size="sm" variant="destructive" onClick={async () => { if (confirm("Remover enigma?")) { await (supabase as any).from("puzzles").delete().eq("id", p.id); refresh(); } }}>Remover</Button>
        </div>
      ))}
    </div>
  );
}
