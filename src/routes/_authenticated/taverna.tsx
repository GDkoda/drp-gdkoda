import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, rpc } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownLeft, ArrowUpRight, CalendarCheck, CheckCircle2, Clock, Coins, Gift, History, Send, Sparkles, Users, Wallet, Zap, type LucideIcon } from "lucide-react";
import { useCustomization } from "@/lib/app-customization";
import { VigorRestore, useGameSettings } from "@/components/VigorRestore";
import { toast } from "sonner";
import { PwaInstallCard } from "@/components/PwaInstall";

export const Route = createFileRoute("/_authenticated/taverna")({
  head: () => ({ meta: [{ title: "Taverna — Mesa 3D&T" }, { name: "description", content: "Sua carteira, check-in diário e transferências." }] }),
  component: Taverna,
});

const coinNumber = new Intl.NumberFormat("pt-BR");
const transactionNames: Record<string, string> = {
  daily_checkin: "Recompensa diária",
  checkin: "Recompensa diária",
  transfer: "Transferência",
  transfer_coins: "Transferência",
  shop_purchase: "Compra na loja",
  purchase: "Compra",
  master_reward: "Recompensa do Mestre",
  reward: "Recompensa",
};

function Taverna() {
  const { text } = useCustomization();
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const refreshWallet = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["me"] }),
    queryClient.invalidateQueries({ queryKey: ["vigor"] }),
    queryClient.invalidateQueries({ queryKey: ["mytx"] }),
  ]);
  const p = me?.profile;
  const { data: settings } = useGameSettings();
  const { data: vigor } = useQuery({ queryKey: ["vigor"], queryFn: () => rpc("get_vigor", {}) as Promise<number> });
  const { data: players } = useQuery({
    queryKey: ["players"],
    queryFn: async () => (await supabase.from("profiles").select("id, display_name, username").order("display_name")).data ?? [],
  });
  const { data: txs } = useQuery({
    queryKey: ["mytx"],
    queryFn: async () => (await supabase.from("transactions").select("id, kind, item_name, coins, from_user, to_user, note, created_at").order("created_at", { ascending: false }).limit(10)).data ?? [],
  });
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState(10);
  const [checkingIn, setCheckingIn] = useState(false);
  const [sending, setSending] = useState(false);

  const next = p?.last_checkin ? new Date(new Date(p.last_checkin).getTime() + 86400000) : null;
  const canCheckin = !next || Date.now() >= next.getTime();
  const currentVigor = vigor ?? p?.vigor ?? 0;
  const vigorMax = settings?.vigor_daily ?? 5;
  const balance = p?.coins ?? 0;
  const nameOf = (id: string | null) => players?.find((x) => x.id === id)?.display_name ?? "jogador";
  const nextCheckinLabel = next?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) ?? "";
  const safeAmount = Math.max(1, Math.floor(amount));

  async function doCheckin() {
    if (!canCheckin || checkingIn) return;
    setCheckingIn(true);
    try {
      const reward = await rpc("daily_checkin", {});
      toast.success("Check-in concluído! +" + reward + " moedas");
      await refreshWallet();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir o check-in.");
    } finally {
      setCheckingIn(false);
    }
  }

  async function sendCoins() {
    if (!to || sending || safeAmount > balance || balance < 1) return;
    setSending(true);
    try {
      await rpc("transfer_coins", { _to: to, _amount: safeAmount }, "Moedas enviadas");
      setTo("");
      setAmount(10);
      await refreshWallet();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar as moedas.");
    } finally {
      setSending(false);
    }
  }

  function transactionTitle(kind: string) {
    const normalized = String(kind ?? "").toLowerCase();
    return (transactionNames[normalized] ?? normalized.replace(/[_-]+/g, " ").replace(/^./, (char) => char.toUpperCase())) || "Movimentação";
  }

  return (
    <div className="tavern-page space-y-4">
      <header className="tavern-hero">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="page-eyebrow">Sua base de aventuras</p>
            <h1 className="mt-1 text-2xl font-bold text-gold sm:text-3xl">{text("taverna_title")}</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">Tudo o que você precisa para seguir sua jornada, em um só lugar.</p>
          </div>
          <span className="tavern-live-pill"><Sparkles className="h-3.5 w-3.5" /> Painel do aventureiro</span>
        </div>
        <PwaInstallCard />
      <div className="tavern-stats-grid">
          <Stat icon={Coins} label="Carteira" value={coinNumber.format(balance)} suffix="moedas" tone="gold" />
          <Stat icon={Zap} label="Vigor disponível" value={currentVigor + "/" + vigorMax} suffix="para suas ações" tone="mana" />
          <Stat icon={CalendarCheck} label="Sequência diária" value={String(p?.checkin_streak ?? 0)} suffix="dias consecutivos" tone="default" />
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-3">
          <VigorRestore vigor={currentVigor} />

          <section className="tavern-section tavern-checkin">
            <div className="flex items-start gap-3">
              <div className="tavern-section-icon"><Gift className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">{text("taverna_checkin_title")}</h2>
                  {canCheckin ? <span className="tavern-status-ready">Disponível</span> : <span className="tavern-status-wait">Concluído hoje</span>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{text("taverna_checkin_help")}</p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {canCheckin ? "Sua recompensa diária está pronta para resgate." : "Próximo resgate a partir de " + nextCheckinLabel + "."}
                </p>
              </div>
            </div>
            <Button className="mt-3 w-full sm:w-auto" size="sm" disabled={!canCheckin || checkingIn} onClick={() => void doCheckin()}>
              {canCheckin ? <><CalendarCheck className="h-4 w-4" /> {checkingIn ? "Resgatando…" : text("taverna_checkin_button")}</> : <><CheckCircle2 className="h-4 w-4" /> Recompensa coletada</>}
            </Button>
          </section>
        </div>

        <div className="space-y-3">
          <section className="tavern-section">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="tavern-section-icon"><Send className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">{text("taverna_send_title")}</h2>
                  <p className="text-xs text-muted-foreground">Compartilhe moedas com alguém da mesa.</p>
                </div>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-gold">{coinNumber.format(balance)} <span className="font-normal text-muted-foreground">disponíveis</span></span>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger aria-label="Escolher jogador destinatário" className="h-10 w-full"><SelectValue placeholder="Escolha o destinatário…" /></SelectTrigger>
                <SelectContent>
                  {players?.filter((x) => x.id !== me?.id).map((x) => <SelectItem key={x.id} value={x.id}>{x.display_name || x.username}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="relative block">
                <span className="sr-only">Quantidade de moedas</span>
                <Input aria-label="Quantidade de moedas" type="number" inputMode="numeric" min={1} max={balance} value={amount} onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))} className="h-10 w-full pr-12 tabular-nums" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase text-muted-foreground">Moedas</span>
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="mr-1 text-[11px] text-muted-foreground">Rápido:</span>
                {[10, 25, 50].map((value) => (
                  <Button key={value} type="button" size="sm" variant={amount === value ? "secondary" : "ghost"} className="h-7 px-2.5 text-xs" disabled={value > balance} onClick={() => setAmount(value)}>{value}</Button>
                ))}
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={balance < 1} onClick={() => setAmount(balance)}>Tudo</Button>
              </div>
              <Button size="sm" className="h-9" disabled={!to || !balance || safeAmount > balance || sending} onClick={() => void sendCoins()}>
                <Send className="h-3.5 w-3.5" /> {sending ? "Enviando…" : text("taverna_send_button")}
              </Button>
            </div>
            {to && <p className="mt-2 text-[11px] text-muted-foreground">Destino: <strong className="font-semibold text-foreground">{players?.find((x) => x.id === to)?.display_name ?? "jogador selecionado"}</strong> · Total: <strong className="font-semibold text-gold">{coinNumber.format(safeAmount)} moedas</strong></p>}
          </section>

          <section className="tavern-section">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="tavern-section-icon"><History className="h-5 w-5" /></div>
                <div><h2 className="text-base font-semibold">{text("taverna_history_title")}</h2><p className="text-xs text-muted-foreground">As últimas atividades da sua carteira.</p></div>
              </div>
              <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">Últimas 10</span>
            </div>
            <ul className="tavern-transactions">
              {txs?.map((transaction) => {
                const isOutgoing = transaction.from_user === me?.id;
                const peer = isOutgoing && transaction.to_user ? "Para " + nameOf(transaction.to_user) : transaction.to_user === me?.id && transaction.from_user ? "De " + nameOf(transaction.from_user) : "";
                const Icon = isOutgoing ? ArrowUpRight : ArrowDownLeft;
                const value = Number(transaction.coins) || 0;
                const date = transaction.created_at ? new Date(transaction.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
                return (
                  <li key={transaction.id} className="tavern-transaction">
                    <span className={"tavern-transaction-icon " + (isOutgoing ? "is-outgoing" : "is-incoming")}><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{transactionTitle(transaction.kind)}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{transaction.item_name || transaction.note || peer || "Movimentação da campanha"}{peer && transaction.item_name ? " · " + peer : ""}</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">{date}</span>
                    </span>
                    <span className={"shrink-0 text-right text-sm font-semibold tabular-nums " + (value < 0 ? "text-destructive" : "text-gold")}>{value > 0 ? "+" : ""}{coinNumber.format(value)}<span className="block text-[9px] font-normal text-muted-foreground">moedas</span></span>
                  </li>
                );
              })}
              {!txs?.length && <li className="rounded-lg border border-dashed px-3 py-5 text-center"><Wallet className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-1 text-sm font-medium">Sua história começa agora</p><p className="text-xs text-muted-foreground">Suas recompensas e movimentações aparecerão aqui.</p></li>}
            </ul>
          </section>
        </div>
      </div>

      <footer className="flex items-center justify-center gap-2 pb-2 text-center text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> Aventure-se com sua mesa. O próximo capítulo começa em Jogos.</footer>
    </div>
  );
}

function Stat({ icon: Icon, label, value, suffix, tone }: {
  icon: LucideIcon;
  label: string;
  value: string;
  suffix: string;
  tone: "gold" | "mana" | "default";
}) {
  return (
    <div className="tavern-stat">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
      <div className={"mt-1.5 font-display text-2xl font-semibold tabular-nums " + (tone === "gold" ? "text-gold" : tone === "mana" ? "text-mana" : "text-foreground")}>{value}</div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{suffix}</p>
    </div>
  );
}
