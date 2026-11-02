import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { rpc, useRefresh, useMe } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Swords, Dice5, Brain } from "lucide-react";
import { useCustomization } from "@/lib/app-customization";
import { VigorRestore, useGameSettings } from "@/components/VigorRestore";

export const Route = createFileRoute("/_authenticated/jogos")({
  head: () => ({ meta: [{ title: "Mini-jogos — Mesa 3D&T" }, { name: "description", content: "Combate, dados da taverna e enigmas." }] }),
  component: Jogos,
});

type LogEntry = { turn: number; who: string; fa: number; fd: number; dmg: number; crit: boolean; hp: number };

function Jogos() {
  const { text } = useCustomization();
  const refresh = useRefresh();
  const { data: me } = useMe();
  const { data: vigor, refetch } = useQuery({ queryKey: ["vigor"], queryFn: () => rpc("get_vigor", {}) as Promise<number> });
  const { data: settings } = useGameSettings();
  const after = () => { refetch(); refresh(); };

  return (
    <div className="space-y-4">
      <div className="page-heading">
        <div><p className="page-eyebrow">Ações da mesa</p><h1 className="mt-1 text-3xl text-gold">{text("jogos_title")}</h1></div>
        <span className="flex items-center gap-1 font-display text-mana"><Zap className="h-4 w-4" />{vigor ?? "…"}/{settings?.vigor_daily ?? 5} vigor</span>
      </div>
      <p className="text-sm text-muted-foreground">{text("jogos_help")}</p>
      <VigorRestore vigor={vigor} />
      <Tabs defaultValue="combat">
        <TabsList className="w-full">
          <TabsTrigger value="combat" className="flex-1"><Swords className="h-4 w-4" />{text("jogos_combat")}</TabsTrigger>
          <TabsTrigger value="dice" className="flex-1"><Dice5 className="h-4 w-4" />{text("jogos_dice")}</TabsTrigger>
          <TabsTrigger value="puzzle" className="flex-1"><Brain className="h-4 w-4" />{text("jogos_puzzle")}</TabsTrigger>
        </TabsList>
        <TabsContent value="combat"><Combat onDone={after} hasActive={!!me?.profile?.active_character_id} buttonLabel={text("jogos_fight")} /></TabsContent>
        <TabsContent value="dice"><Dice onDone={after} buttonLabel={text("jogos_roll")} /></TabsContent>
        <TabsContent value="puzzle"><Puzzle onDone={after} buttonLabel={text("jogos_new_puzzle")} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Combat({ onDone, hasActive, buttonLabel }: { onDone: () => void; hasActive: boolean; buttonLabel: string }) {
  const [res, setRes] = useState<{ monster: string; hero: string; won: boolean; reward: number; xp: number; log: LogEntry[] } | null>(null);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const completed = useRef(false);
  async function fight() {
    setBusy(true); completed.current = false;
    try { const r = await rpc("play_combat", {}); setRes(r); setShown(0); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!res || shown >= res.log.length) return;
    const timer = window.setTimeout(() => setShown((current) => Math.min(current + 1, res.log.length)), 450);
    return () => window.clearTimeout(timer);
  }, [res, shown]);
  const done = !!res && shown >= res.log.length;
  useEffect(() => {
    if (done && !completed.current) { completed.current = true; onDone(); }
  }, [done, onDone]);
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-3"><Swords className="mt-0.5 h-5 w-5 shrink-0 text-gold" /><p className="text-sm text-muted-foreground">Sua ficha ativa enfrenta um monstro. FA = F/PdF + H + 1d6 contra FD = A + H + 1d6. Um 6 no dado é crítico.</p></div>
      {!hasActive && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Defina uma ficha ativa na tela de Fichas antes de iniciar um combate.</p>}
      <Button className="w-full sm:w-auto" onClick={fight} disabled={busy || !hasActive || (!!res && !done)}>{busy ? "Preparando combate…" : done ? "Combater novamente" : buttonLabel}</Button>
      {res && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/50 p-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Encontro</p><h3 className="mt-1 font-display text-xl">{res.hero} <span className="text-muted-foreground">vs.</span> {res.monster}</h3></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${done ? res.won ? "bg-emerald-500/15 text-emerald-500" : "bg-blood/10 text-blood" : "bg-primary/10 text-gold"}`}>{done ? res.won ? "VITÓRIA" : "DERROTA" : `Turno ${shown} de ${res.log.length}`}</span></div>
          <div className="space-y-2">
            {res.log.slice(0, shown).map((l, i) => (
              <div key={i} className={`flex items-start gap-3 rounded-xl border p-3 ${l.who === "herói" ? "border-primary/20 bg-primary/5" : "border-border bg-muted/30"}`}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background font-display text-sm">{l.turn}</span><div className="min-w-0 flex-1"><p className="font-semibold">{l.who === "herói" ? res.hero : l.who}</p><p className="text-sm text-muted-foreground">FA {l.fa} vs FD {l.fd} · {l.dmg} dano{l.crit ? " · CRÍTICO!" : ""}</p><p className="mt-1 text-xs text-muted-foreground">PV restantes do alvo: {l.hp}</p></div>{l.crit && <span className="rounded-lg bg-amber-500/15 px-2 py-1 text-xs font-bold text-amber-500">CRÍTICO</span>}</div>
            ))}
          </div>
          {done && <div aria-live="polite" className={`rounded-2xl border p-4 ${res.won ? "border-emerald-500/30 bg-emerald-500/10" : "border-blood/30 bg-blood/5"}`}><p className="font-display text-xl">{res.won ? "Vitória gloriosa!" : "O herói caiu…"}</p><p className="mt-1 text-sm">{res.won ? `Recompensa: +${res.reward} moedas e +${res.xp} XP` : `Recompensa de consolo: +${res.reward} moedas`}</p></div>}
        </div>
      )}
    </div>
  );
}

function Dice({ onDone, buttonLabel }: { onDone: () => void; buttonLabel: string }) {
  const { data: me } = useMe();
  const { data: settings } = useGameSettings();
  const [bet, setBet] = useState(10);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ player: number[]; house: number[]; result: string; delta: number } | null>(null);
  const face = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  const coins = Number(me?.profile?.coins ?? 0);
  const maxBet = Math.max(0, Math.min(coins, Number(settings?.dice_max_bet ?? coins)));
  const presets = [...new Set([5, 10, 25, maxBet].filter((value) => value > 0 && value <= maxBet))];
  async function roll() {
    setBusy(true);
    try { setRes(await rpc("play_dice", { _bet: bet })); onDone(); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-3"><Dice5 className="mt-0.5 h-5 w-5 shrink-0 text-gold" /><div><p className="font-semibold">Duelo de dados</p><p className="text-sm text-muted-foreground">Role 2d6 contra o taverneiro. A maior soma vence; a aposta máxima é {settings?.dice_max_bet ?? "definida pelo Mestre"} moedas.</p></div></div>
      <div className="space-y-2"><label className="text-sm font-medium" htmlFor="dice-bet">Sua aposta</label><div className="flex flex-col gap-3 sm:flex-row">
        <Input id="dice-bet" aria-label="Valor da aposta em moedas" type="number" min={1} max={maxBet} value={bet} onChange={(e) => setBet(Math.max(1, Number(e.target.value) || 1))} className="sm:w-36" />
        <div className="flex flex-wrap gap-2">{presets.map((value) => <Button key={value} type="button" size="sm" variant={bet === value ? "default" : "outline"} onClick={() => setBet(value)}>{value === maxBet ? "Máximo" : `${value} moedas`}</Button>)}</div>
      </div><p className="text-xs text-muted-foreground">Saldo disponível: {coins} moedas</p></div>
      <Button className="w-full sm:w-auto" disabled={busy || maxBet < 1 || bet < 1 || bet > maxBet} onClick={roll}>{busy ? "Rolando os dados…" : buttonLabel}</Button>
      {res && <div aria-live="polite" className="space-y-4 rounded-2xl border bg-background/40 p-4"><div className="grid grid-cols-2 gap-3 text-center">
        {[{ label: "Você", dice: res.player }, { label: "Taverneiro", dice: res.house }].map(({ label, dice }) => <div key={label} className="rounded-xl border bg-card p-3 sm:p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><div className="my-3 flex flex-wrap justify-center gap-1 text-4xl sm:text-5xl">{dice.map((d, i) => <span key={i} className="drop-shadow-sm">{face[d]}</span>)}</div><p className="font-display text-2xl">{dice.reduce((a, b) => a + b, 0)}</p></div>)}
      </div><div className={`rounded-xl p-4 text-center ${res.delta > 0 ? "bg-emerald-500/10 text-emerald-500" : res.delta < 0 ? "bg-blood/10 text-blood" : "bg-muted text-foreground"}`}><p className="font-display text-xl">{res.result.toUpperCase()}</p><p className="mt-1 text-sm">{res.delta ? `${res.delta > 0 ? "+" : ""}${res.delta} moedas` : "A aposta não mudou"}</p></div></div>}
    </div>
  );
}

function Puzzle({ onDone, buttonLabel }: { onDone: () => void; buttonLabel: string }) {
  const [p, setP] = useState<{ id: string; question: string } | null>(null);
  const [ans, setAns] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ correct: boolean; answer: string; reward: number } | null>(null);
  async function start() {
    setBusy(true);
    try { setP(await rpc("start_puzzle", {})); setRes(null); setAns(""); onDone(); }
    finally { setBusy(false); }
  }
  async function solve() {
    if (!p || !ans.trim()) return;
    setBusy(true);
    try { setRes(await rpc("solve_puzzle", { _id: p.id, _answer: ans.trim() })); onDone(); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-3"><Brain className="mt-0.5 h-5 w-5 shrink-0 text-gold" /><div><p className="font-semibold">Desafio de lógica</p><p className="text-sm text-muted-foreground">Você tem uma tentativa por enigma. Resolva em até 10 minutos; recompensas podem variar conforme o enigma.</p></div></div>
      <Button onClick={start} disabled={busy || (!!p && !res)}>{busy ? "Preparando enigma…" : p && !res ? "Resolva o enigma atual" : p && res ? "Jogar outro enigma" : buttonLabel}</Button>
      {p && <div className="space-y-4 rounded-2xl border bg-background/40 p-4 sm:p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enigma atual</p><p className="font-display text-lg leading-relaxed">{p.question}</p>
        {!res && <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void solve(); }}><Input value={ans} onChange={(e) => setAns(e.target.value)} placeholder="Digite sua resposta…" autoComplete="off" disabled={busy} /><Button type="submit" disabled={busy || !ans.trim()}>{busy ? "Verificando…" : "Responder"}</Button></form>}
        {res && <div aria-live="polite" className={`rounded-xl border p-4 ${res.correct ? "border-emerald-500/30 bg-emerald-500/10" : "border-blood/30 bg-blood/5"}`}><p className="font-display text-lg">{res.correct ? "Enigma resolvido!" : "Não foi dessa vez"}</p><p className="mt-1 text-sm">{res.correct ? `Recompensa: +${res.reward} moedas` : `Resposta correta: ${res.answer}`}</p></div>}
      </div>}
    </div>
  );
}
