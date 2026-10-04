import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, rpc, useRefresh } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck, Coins, Zap, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/taverna")({
  head: () => ({ meta: [{ title: "Taverna — Mesa 3D&T" }, { name: "description", content: "Sua carteira, check-in diário e transferências." }] }),
  component: Taverna,
});

function Taverna() {
  const { data: me } = useMe();
  const refresh = useRefresh();
  const p = me?.profile;
  const { data: players } = useQuery({
    queryKey: ["players"],
    queryFn: async () => (await supabase.from("profiles").select("id, display_name, username").order("display_name")).data ?? [],
  });
  const { data: txs } = useQuery({
    queryKey: ["mytx"],
    queryFn: async () => (await supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(10)).data ?? [],
  });
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState(10);

  const next = p?.last_checkin ? new Date(new Date(p.last_checkin).getTime() + 86400000) : null;
  const canCheckin = !next || next < new Date();
  const nameOf = (id: string | null) => players?.find((x) => x.id === id)?.display_name ?? "—";

  return (
    <div className="space-y-5">
      <h1 className="text-2xl text-gold">Taverna</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Coins} label="Moedas" value={p?.coins ?? 0} cls="text-gold" />
        <Stat icon={Zap} label="Vigor hoje" value={`${p?.vigor ?? 0}/10`} cls="text-mana" />
        <Stat icon={CalendarCheck} label="Sequência" value={`${p?.checkin_streak ?? 0} dia(s)`} cls="text-foreground" />
      </div>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-lg">Check-in diário</h2>
        <p className="text-sm text-muted-foreground">Recompensa cresce a cada dia seguido (até 70 moedas).</p>
        <Button className="mt-3" disabled={!canCheckin} onClick={async () => {
          const r = await rpc("daily_checkin", {});
          refresh();
          import("sonner").then(({ toast }) => toast.success(`+${r} moedas!`));
        }}>
          {canCheckin ? "Fazer check-in" : `Disponível ${next?.toLocaleString("pt-BR")}`}
        </Button>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="flex items-center gap-2 text-lg"><Send className="h-4 w-4" />Enviar moedas</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger className="sm:w-56"><SelectValue placeholder="Jogador" /></SelectTrigger>
            <SelectContent>
              {players?.filter((x) => x.id !== me?.id).map((x) => <SelectItem key={x.id} value={x.id}>{x.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" min={1} value={amount} onChange={(e) => setAmount(+e.target.value)} className="sm:w-28" />
          <Button disabled={!to} onClick={async () => { await rpc("transfer_coins", { _to: to, _amount: amount }, "Moedas enviadas"); refresh(); }}>Enviar</Button>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-lg">Últimas movimentações</h2>
        <ul className="mt-2 divide-y text-sm">
          {txs?.map((t) => (
            <li key={t.id} className="flex justify-between py-2">
              <span>{t.kind}{t.item_name ? `: ${t.item_name}` : ""} {t.to_user && t.from_user ? `(${nameOf(t.from_user)} → ${nameOf(t.to_user)})` : ""}</span>
              <span className="text-gold">{t.coins ? t.coins : ""}</span>
            </li>
          ))}
          {!txs?.length && <li className="py-2 text-muted-foreground">Nada ainda.</li>}
        </ul>
      </section>
      <p className="text-center text-sm text-muted-foreground">Desafie a sorte na aba Jogos!</p>
    </div>
  );
}

function Stat({ icon: I, label, value, cls }: { icon: typeof Coins; label: string; value: React.ReactNode; cls: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><I className="h-4 w-4" />{label}</div>
      <div className={`mt-1 font-display text-2xl ${cls}`}>{value}</div>
    </div>
  );
}
