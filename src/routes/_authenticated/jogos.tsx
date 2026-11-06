import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { rpc, useRefresh, useMe } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Swords, Dice5, Brain, Trophy, RotateCcw, Shield, BookOpen, Flame, Sparkles, Coins, Target, Wind } from "lucide-react";
import { useCustomization } from "@/lib/app-customization";
import { VigorRestore, useGameSettings } from "@/components/VigorRestore";
import { createMachineStrategy, maxFarkleWager, nextRollCount, scoreDiceSelection, hasScoringCombination, farkleProbability } from "@/lib/farkle";
import type { DieFace } from "@/lib/farkle";
import { combatEffectLabel, isCombatAbilityAvailable, isCombatActionAvailable } from "@/lib/combat";
import type { CombatAction, CombatLogEntry, CombatState } from "@/lib/combat";

function JogosRouteComponent() {
  return <Jogos />;
}


export const Route = createFileRoute("/_authenticated/jogos")({
  head: () => ({ meta: [{ title: "Mini-jogos — Mesa 3D&T" }, { name: "description", content: "Combate, dados da taverna e enigmas." }] }),
  component: JogosRouteComponent,
});

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
          <TabsTrigger value="farkle" className="flex-1"><Trophy className="h-4 w-4" />Jogo de Dados</TabsTrigger>
          <TabsTrigger value="puzzle" className="flex-1"><Brain className="h-4 w-4" />{text("jogos_puzzle")}</TabsTrigger>
        </TabsList>
        <TabsContent value="combat"><Combat onDone={after} hasActive={!!me?.profile?.active_character_id} buttonLabel={text("jogos_fight")} /></TabsContent>
        <TabsContent value="dice"><Dice onDone={after} buttonLabel={text("jogos_roll")} /></TabsContent>
        <TabsContent value="farkle"><Farkle onDone={after} vigor={Number(vigor ?? 0)} coins={Number(me?.profile?.coins ?? 0)} /></TabsContent>
        <TabsContent value="puzzle"><Puzzle onDone={after} buttonLabel={text("jogos_new_puzzle")} /></TabsContent>
      </Tabs>
    </div>
  );
}

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-xs"><span className="text-muted-foreground">{label}</span><span className="font-semibold tabular-nums">{value}/{max}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Combat({ onDone, hasActive, buttonLabel }: { onDone: () => void; hasActive: boolean; buttonLabel: string }) {
  const [res, setRes] = useState<CombatState | null>(null);
  const [busy, setBusy] = useState(false);
  const completed = useRef(false);
  const done = !!res && res.status !== "active";

  async function startFight() {
    setBusy(true);
    completed.current = false;
    try {
      const state = await rpc("start_combat", {}) as CombatState;
      setRes(state);
    } finally {
      setBusy(false);
    }
  }

  async function act(action: CombatAction, spellId?: string) {
    if (!res || res.status !== "active" || busy) return;
    setBusy(true);
    try {
      const state = await rpc("perform_combat_action", {
        _session_id: res.id,
        _action: action,
        _spell_id: spellId ?? null,
      }) as CombatState;
      setRes(state);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    rpc("get_active_combat", {})
      .then((state) => {
        if (!cancelled && state) setRes(state as CombatState);
      })
      .catch(() => {
        // A falha ao recuperar uma sessão não bloqueia iniciar um novo combate.
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (done && !completed.current) {
      completed.current = true;
      onDone();
    }
  }, [done, onDone]);

  const actions: {
    id: Exclude<CombatAction, "spell">;
    title: string;
    description: string;
    cost: string;
    icon: typeof Swords;
    tone: string;
    disabled?: boolean;
  }[] = [
    { id: "attack", title: "Ataque básico", description: "FA = maior entre F/PdF + H + 1d6.", cost: "Sem custo de PM", icon: Swords, tone: "text-gold" },
    { id: "power", title: "Golpe poderoso", description: "+2 no atributo de ataque; crítico em 6.", cost: "1 PM", icon: Flame, tone: "text-blood", disabled: !isCombatActionAvailable("power", res) },
    { id: "defend", title: "Postura defensiva", description: "+3 na FD contra o próximo ataque inimigo.", cost: "Sem custo de PM", icon: Shield, tone: "text-sky-400" },
    { id: "recover", title: "Recuperar fôlego", description: "Recupera até 3 PV; o inimigo ainda age.", cost: "1 PM", icon: Sparkles, tone: "text-mana", disabled: !isCombatActionAvailable("recover", res) },
    { id: "aim", title: "Preparar ataque", description: "Acumula +2 na próxima FA (máximo +4).", cost: "Sem custo de PM", icon: Target, tone: "text-violet-400" },
    { id: "feint", title: "Finta", description: "+1 na FA; se causar dano, reduz o próximo ataque inimigo em 2.", cost: "Sem custo de PM", icon: Wind, tone: "text-amber-400" },
  ];
  const entries = (res?.log ?? []).filter((entry: CombatLogEntry) => !entry.system);

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
        <Swords className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
        <div className="min-w-0">
          <p className="font-semibold">Combate tático por turnos</p>
          <p className="text-sm text-muted-foreground">Escolha uma ação. O inimigo responde automaticamente se continuar de pé. FA = maior entre F/PdF + H + 1d6; FD = A + H + 1d6. Prepare ataques, use fintas e administre seus PMs.</p>
        </div>
      </div>
      {!hasActive && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Defina uma ficha ativa na tela de Fichas antes de iniciar um combate.</p>}

      {!res && (
        <Button className="w-full sm:w-auto" onClick={startFight} disabled={busy || !hasActive}>
          {busy ? "Preparando combate…" : buttonLabel}
        </Button>
      )}

      {res && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-3 rounded-xl border bg-background/50 p-3 sm:p-4">
              <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10"><Swords className="h-5 w-5 text-gold" /></span><div className="min-w-0"><p className="text-xs uppercase tracking-wider text-muted-foreground">Herói</p><h3 className="truncate font-display text-lg">{res.hero}</h3></div></div>
              <StatBar label="Pontos de Vida (PV)" value={res.heroPv} max={res.heroMaxPv} color="bg-emerald-500" />
              <StatBar label="Pontos de Magia (PM)" value={res.heroPm} max={res.heroMaxPm} color="bg-sky-500" />
            </div>
            <div className="space-y-3 rounded-xl border border-blood/20 bg-blood/5 p-3 sm:p-4">
              <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blood/10"><Shield className="h-5 w-5 text-blood" /></span><div className="min-w-0"><p className="text-xs uppercase tracking-wider text-muted-foreground">Adversário</p><h3 className="truncate font-display text-lg">{res.monster}</h3></div></div>
              <StatBar label="Pontos de Vida (PV)" value={res.monsterPv} max={res.monsterMaxPv} color="bg-blood" />
              <p className="text-xs text-muted-foreground">Turno {Math.max(1, res.turn - (done ? 1 : 0))}</p>
            </div>
          </div>

          {res.status === "active" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-display text-lg">Escolha sua ação</h3><p className="text-xs text-muted-foreground">Vigor gasto ao iniciar: 2 por combate.</p></div><span className="text-xs text-muted-foreground">{busy ? "Resolvendo turno…" : "Sua vez"}</span></div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {actions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button key={action.id} type="button" disabled={busy || !!action.disabled || done} onClick={() => act(action.id)} className="flex min-h-[112px] min-w-0 items-start gap-3 rounded-xl border bg-background p-3 text-left transition hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-45 sm:p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted"><Icon className={`h-5 w-5 ${action.tone}`} /></span>
                      <span className="min-w-0 flex-1"><span className="block font-semibold">{action.title}</span><span className="mt-1 block text-sm leading-snug text-muted-foreground">{action.description}</span><span className="mt-2 block text-xs font-medium text-gold">{action.cost}</span></span>
                    </button>
                  );
                })}
              </div>
              {res.abilities && res.abilities.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div><h4 className="font-display text-base">Habilidades da ficha</h4><p className="text-xs text-muted-foreground">Magias aprendidas no Grimório e configuradas pelo Mestre para combate.</p></div>
                    <span className="text-xs text-mana">{res.abilities.length} disponíveis</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {res.abilities.map((ability) => {
                      const available = isCombatAbilityAvailable(ability, res);
                      return (
                        <button key={ability.id} type="button" disabled={busy || !available} onClick={() => act("spell", ability.id)} className="flex min-h-[112px] min-w-0 items-start gap-3 rounded-xl border border-mana/25 bg-mana/5 p-3 text-left transition hover:border-mana/50 hover:bg-mana/10 disabled:cursor-not-allowed disabled:opacity-45 sm:p-4">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mana/10"><Sparkles className="h-5 w-5 text-mana" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2 font-semibold">{ability.name}<span className="text-xs font-normal text-mana">{ability.pmCost} PM</span></span>
                            <span className="mt-1 block text-xs text-muted-foreground">{ability.school} · {combatEffectLabel(ability.effect)} · Potência {ability.power}</span>
                            <span className="mt-1 block text-sm leading-snug text-muted-foreground">{ability.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div aria-live="polite" className={`rounded-2xl border p-4 ${res.won ? "border-emerald-500/30 bg-emerald-500/10" : "border-blood/30 bg-blood/5"}`}>
              <p className="font-display text-xl">{res.won ? "Vitória gloriosa!" : "O herói caiu…"}</p>
              <p className="mt-1 text-sm">{res.won ? `Recompensa: +${res.reward} moedas e +${res.xp} XP` : `Recompensa de consolo: +${res.reward} moedas`}</p>
              <Button className="mt-3 w-full sm:w-auto" onClick={() => { setRes(null); completed.current = false; }} variant="outline">Voltar à arena</Button>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="font-display text-lg">Registro do combate</h3>
            {entries.length === 0 && <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">O combate começou. Escolha sua primeira ação.</p>}
            {entries.slice(-8).map((entry, index) => (
              <div key={`${entry.turn ?? 0}-${index}`} className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 ${entry.target === "monster" ? "border-primary/20 bg-primary/5" : "border-border bg-muted/30"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background font-display text-sm">{entry.turn ?? "•"}</span>
                <div className="min-w-0 flex-1"><p className="break-words font-semibold">{entry.who}{entry.action ? ` · ${entry.action}` : ""}</p><p className="text-sm text-muted-foreground">{entry.fa || entry.fd ? `FA ${entry.fa ?? 0} vs FD ${entry.fd ?? 0} · ${entry.dmg ?? 0} dano` : entry.effect === "heal" ? `Recuperou ${entry.amount ?? 0} PV` : entry.effect === "guard" ? `Proteção +${entry.amount ?? 0} na FD` : entry.effect === "weaken" ? `Ataque inimigo reduzido em ${entry.amount ?? 0}` : "Ação tática"}{entry.crit ? " · CRÍTICO!" : ""}</p><p className="mt-1 text-xs text-muted-foreground">PV restantes do alvo: {entry.hp ?? 0}</p></div>
                {entry.crit && <span className="shrink-0 rounded-lg bg-amber-500/15 px-2 py-1 text-xs font-bold text-amber-500">CRÍTICO</span>}
              </div>
            ))}
          </div>
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



type FarkleLog = {
  id: number; who: "Você" | "Máquina"; dice: DieFace[]; selected: DieFace[];
  points: number; detail: string;
};

const DIE_GLYPHS = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const rollFarkleDice = (count: number): DieFace[] =>
  Array.from({ length: count }, () => (1 + Math.floor(Math.random() * 6)) as DieFace);


function FarkleScoreGuide({ compact = false }: { compact?: boolean }) {
  const groupRows = [
    { label: "3 iguais", values: ["1.000", "200", "300", "400", "500", "600"] },
    { label: "4 iguais", values: ["2.000", "400", "600", "800", "1.000", "1.200"] },
    { label: "5 iguais", values: ["4.000", "800", "1.200", "1.600", "2.000", "2.400"] },
    { label: "6 iguais", values: ["8.000", "1.600", "2.400", "3.200", "4.000", "4.800"] },
  ];

  return (
    <details open={!compact} className="group overflow-hidden rounded-2xl border border-amber-200/20 bg-[#211710]/85 shadow-[0_12px_30px_rgba(0,0,0,.16)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 transition-colors hover:bg-amber-100/[0.04] [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/20 bg-amber-300/10 text-amber-200"><BookOpen className="h-5 w-5" /></span>
          <span className="min-w-0"><span className="block font-display text-lg text-amber-100">Guia de pontuação</span><span className="mt-0.5 block text-xs text-amber-100/55">Consulte todas as combinações válidas e seus valores.</span></span>
        </span>
        <span className="shrink-0 rounded-full border border-amber-200/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200 group-open:bg-amber-200/10">Tabela <span className="ml-1 inline-block transition-transform group-open:rotate-180">⌄</span></span>
      </summary>
      <div className="space-y-4 border-t border-amber-100/10 p-3 sm:p-4">
        <div className="overflow-x-auto rounded-xl border border-amber-100/10">
          <table className="w-full min-w-[440px] border-collapse text-center text-xs sm:text-sm">
            <thead className="bg-amber-100/[0.07] text-amber-100/80">
              <tr><th scope="col" className="px-3 py-3 text-left font-semibold">Combinação</th>{["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"].map((face) => <th key={face} scope="col" className="px-2 py-3 text-lg">{face}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-amber-100/10 text-amber-50/85">
              <tr className="bg-amber-300/[0.06]"><th scope="row" className="px-3 py-3 text-left font-semibold text-amber-100">Dado isolado</th><td colSpan={6} className="px-3 py-3 text-left">⚀ 100 pts <span className="mx-2 text-amber-100/30">•</span> ⚄ 50 pts <span className="ml-2 text-amber-100/45">(2, 3, 4 e 6 não pontuam sozinhos)</span></td></tr>
              {groupRows.map((row) => <tr key={row.label} className="transition-colors hover:bg-amber-100/[0.04]"><th scope="row" className="whitespace-nowrap px-3 py-3 text-left font-semibold text-amber-100">{row.label}</th>{row.values.map((value, index) => <td key={index} className="px-2 py-3 tabular-nums">{value}</td>)}</tr>)}
              <tr className="bg-amber-300/[0.06]"><th scope="row" className="px-3 py-3 text-left font-semibold text-amber-100">Sequências</th><td colSpan={6} className="px-3 py-3 text-left leading-relaxed">1–2–3–4–5 <strong className="text-amber-200">500 pts</strong><span className="mx-2 text-amber-100/25">•</span> 2–3–4–5–6 <strong className="text-amber-200">750 pts</strong><br />1–2–3–4–5–6 <strong className="text-amber-200">1.500 pts</strong></td></tr>
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <p className="rounded-xl border border-amber-100/10 bg-black/20 p-3 text-[11px] leading-relaxed text-amber-100/65"><strong className="text-amber-200">Regra dos iguais:</strong> cada dado adicional igual dobra o valor da trinca. Ex.: três 4 valem 400; quatro 4 valem 800.</p>
          <p className="rounded-xl border border-amber-100/10 bg-black/20 p-3 text-[11px] leading-relaxed text-amber-100/65"><strong className="text-amber-200">Atenção:</strong> padrões independentes do mesmo lançamento somam (⚀ + ⚄ = 150 pts). Pares e três pares não pontuam; dados escolhidos precisam pontuar juntos no lançamento atual.</p>
        </div>
      </div>
    </details>
  );
}

function Farkle({ onDone, vigor, coins }: { onDone: () => void; vigor: number; coins: number }) {
  const [phase, setPhase] = useState<"intro" | "player-roll" | "player-select" | "player-action" | "machine" | "farkle" | "finished">("intro");
  const [playerTotal, setPlayerTotal] = useState(0);
  const [machineTotal, setMachineTotal] = useState(0);
  const [playerTurnPoints, setPlayerTurnPoints] = useState(0);
  const [machineTurnPoints, setMachineTurnPoints] = useState(0);
  const [dice, setDice] = useState<DieFace[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [usedDice, setUsedDice] = useState(0);
  const [diceToRoll, setDiceToRoll] = useState(6);
  const [machineDice, setMachineDice] = useState<DieFace[]>([]);
  const [machineSelected, setMachineSelected] = useState<number[]>([]);
  const [machineMessage, setMachineMessage] = useState("A máquina aguarda sua vez.");
  const [history, setHistory] = useState<FarkleLog[]>([]);
  const [status, setStatus] = useState("Prepare seus dados e tente chegar primeiro a 4.000 pontos.");
  const [busy, setBusy] = useState(false);
  const [riskTemperament, setRiskTemperament] = useState(0);
  const [farkleFlash, setFarkleFlash] = useState(false);
  const [wager, setWager] = useState(0);
  const [activeWager, setActiveWager] = useState(0);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<{ wager: number; payout: number; profit: number; net: number } | null>(null);
  const [settlementBusy, setSettlementBusy] = useState(false);
  const [settlementError, setSettlementError] = useState(false);
  const [settlementRetry, setSettlementRetry] = useState(0);
  const settlementRequested = useRef(false);
  const onDoneRef = useRef(onDone);
  const maxWager = maxFarkleWager(coins);
  const wagerPresets = [...new Set([10, 25, maxWager].filter((value) => value > 0 && value <= maxWager))];
  const timer = useRef<number | null>(null);
  const selectedFaces = selectedIndices.map((index) => dice[index]);
  const selectedScore = scoreDiceSelection(selectedFaces);
  const selectionValid = selectedIndices.length > 0 && selectedScore > 0;
  const gameOver = phase === "finished";
  const playerProgress = Math.min(100, (playerTotal / 4_000) * 100);
  const machineProgress = Math.min(100, (machineTotal / 4_000) * 100);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  function pause(ms: number) {
    return new Promise<void>((resolve) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { timer.current = null; resolve(); }, ms);
    });
  }

  function addHistory(entry: Omit<FarkleLog, "id">) {
    setHistory((current) => [{ ...entry, id: Date.now() + Math.random() }, ...current].slice(0, 12));
  }

  async function startGame() {
    setBusy(true);
    try {
      const sessionId = await rpc(
        "start_farkle_game_with_bet",
        { _wager: wager },
        wager > 0
          ? `Aposta de ${wager.toLocaleString("pt-BR")} moedas reservada. Partida iniciada por 3 de vigor.`
          : "Partida iniciada sem aposta. 3 de vigor gastos.",
      );
      if (typeof sessionId !== "string") throw new Error("O servidor não retornou o identificador da partida.");
      setActiveGameId(sessionId);
      setActiveWager(wager);
      setSettlement(null);
      setSettlementBusy(false);
      setSettlementError(false);
      setSettlementRetry(0);
      settlementRequested.current = false;
      onDone();
      setPlayerTotal(0);
      setMachineTotal(0);
      setPlayerTurnPoints(0);
      setMachineTurnPoints(0);
      setDice([]);
      setSelectedIndices([]);
      setUsedDice(0);
      setDiceToRoll(6);
      setMachineDice([]);
      setMachineSelected([]);
      setMachineMessage("A máquina está pronta.");
      setHistory([]);
      setRiskTemperament(Math.random() * 2 - 1);
      setFarkleFlash(false);
      setStatus("Sua vez! Role os seis dados.");
      setPhase("player-roll");
    } catch {
      setStatus("Não foi possível iniciar. Confira seu vigor e tente novamente.");
    } finally { setBusy(false); }
  }

  async function runMachineTurn(currentPlayerTotal: number, currentMachineTotal: number, temperament = riskTemperament) {
    setPhase("machine");
    setPlayerTurnPoints(0);
    setMachineTurnPoints(0);
    setMachineMessage("A máquina está pensando…");
    setDice([]);
    setSelectedIndices([]);
    setUsedDice(0);
    setDiceToRoll(6);
    let turnPoints = 0;
    let usedInCycle = 0;
    let throws = 0;
    let remaining = 6;
    const strategy = createMachineStrategy({
      machineTotal: currentMachineTotal,
      playerTotal: currentPlayerTotal,
      target: 4_000,
      riskTemperament: temperament,
    });

    while (true) {
      setMachineMessage("A máquina está lançando " + remaining + (remaining === 1 ? " dado…" : " dados…"));
      setMachineSelected([]);
      const thrown = rollFarkleDice(remaining);
      throws += 1;
      setMachineDice(thrown);
      await pause(650);

      const futureRolls = Math.min(4, 18 - throws);
      const choice = strategy.chooseSelection(thrown, turnPoints, futureRolls);
      if (!choice) {
        setMachineMessage("FARKLE! A máquina perdeu os pontos desta rodada.");
        setMachineTurnPoints(0);
        addHistory({ who: "Máquina", dice: thrown, selected: [], points: 0, detail: "Farkle — rodada perdida" });
        await pause(1_100);
        setMachineDice([]);
        setMachineSelected([]);
        setMachineMessage("A máquina passou a vez.");
        setMachineTurnPoints(0);
        setPlayerTurnPoints(0);
        setUsedDice(0);
        setDiceToRoll(6);
        setDice([]);
        setSelectedIndices([]);
        setStatus("A máquina fez Farkle. Sua vez!");
        setPhase("player-roll");
        return;
      }

      setMachineSelected(choice.indices);
      turnPoints += choice.score;
      usedInCycle += choice.indices.length;
      addHistory({
        who: "Máquina", dice: thrown, selected: choice.faces, points: choice.score,
        detail: "Separou " + choice.faces.length + " dado(s) pontuador(es)",
      });
      setMachineTurnPoints(turnPoints);
      setMachineMessage("A máquina separou " + choice.faces.length + " dado(s) e marcou " + choice.score + " pontos.");
      await pause(850);

      remaining = nextRollCount(usedInCycle);
      if (usedInCycle >= 6) usedInCycle = 0;

      const nextLookahead = Math.min(4, 18 - throws);
      if (throws >= 18 || strategy.shouldBank(turnPoints, remaining, nextLookahead)) {
        const newTotal = currentMachineTotal + turnPoints;
        setMachineTotal(newTotal);
        setMachineTurnPoints(0);
        setMachineMessage("A máquina encerrou a rodada e guardou " + turnPoints + " pontos.");
        setStatus(newTotal >= 4_000 ? "A máquina alcançou 4.000 pontos." : "A máquina guardou seus pontos. Sua vez!");
        await pause(850);
        if (newTotal >= 4_000) {
          setPhase("finished");
        } else {
          setDice([]);
          setSelectedIndices([]);
          setUsedDice(0);
          setDiceToRoll(6);
          setMachineSelected([]);
          setPhase("player-roll");
        }
        return;
      }

      setMachineMessage("A máquina avaliou a próxima jogada: risco de Farkle de " + Math.round(farkleProbability(remaining) * 100) + "%. Ela decidiu continuar porque a chance calculada de melhorar o resultado compensa o risco.");
      await pause(650);
    }
  }

  async function playerRoll() {
    if (phase !== "player-roll" || busy) return;
    setBusy(true);
    const thrown = rollFarkleDice(diceToRoll);
    setDice(thrown);
    setSelectedIndices([]);
    setStatus("Escolha dados que formem uma combinação pontuadora.");
    setBusy(false);
    if (!hasScoringCombination(thrown)) {
      addHistory({ who: "Você", dice: thrown, selected: [], points: 0, detail: "Farkle — todos os pontos em risco foram perdidos" });
      setPlayerTurnPoints(0);
      setUsedDice(0);
      setDiceToRoll(6);
      setFarkleFlash(true);
      setStatus("FARKLE! Você perdeu os pontos acumulados nesta rodada.");
      setPhase("farkle");
      await pause(1_300);
      setFarkleFlash(false);
      await runMachineTurn(playerTotal, machineTotal);
    } else {
      setPhase("player-select");
    }
  }

  function toggleDie(index: number) {
    if (phase !== "player-select") return;
    setSelectedIndices((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index]);
  }

  function saveSelectedDice() {
    if (phase !== "player-select" || !selectionValid) return;
    const nextTurn = playerTurnPoints + selectedScore;
    const nextUsed = usedDice + selectedIndices.length;
    addHistory({
      who: "Você", dice, selected: selectedFaces, points: selectedScore,
      detail: "Combinação guardada",
    });
    setPlayerTurnPoints(nextTurn);
    if (nextUsed >= 6) {
      setUsedDice(0);
      setDiceToRoll(6);
      setStatus("Todos os seis dados pontuaram! Você ganhou dados quentes e pode rolar os seis novamente.");
    } else {
      setUsedDice(nextUsed);
      setDiceToRoll(nextRollCount(nextUsed));
      setStatus("Pontos protegidos por enquanto. Você pode arriscar com " + (6 - nextUsed) + " dado(s) ou encerrar a rodada.");
    }
    setPhase("player-action");
  }

  async function bankPlayerTurn() {
    if (phase !== "player-action" || playerTurnPoints <= 0) return;
    const newTotal = playerTotal + playerTurnPoints;
    setPlayerTotal(newTotal);
    setPlayerTurnPoints(0);
    setUsedDice(0);
    setDiceToRoll(6);
    setDice([]);
    setSelectedIndices([]);
    if (newTotal >= 4_000) {
      setStatus("Você alcançou a meta de 4.000 pontos!");
      setPhase("finished");
      return;
    }
    setStatus("Você guardou " + (newTotal - playerTotal) + " pontos. A máquina está jogando.");
    await runMachineTurn(newTotal, machineTotal);
  }

  const playerWon = playerTotal >= 4_000;
  const machineWon = machineTotal >= 4_000;

  useEffect(() => {
    if (!gameOver || !activeGameId || settlement || settlementBusy || settlementRequested.current) return;
    settlementRequested.current = true;
    setSettlementBusy(true);
    setSettlementError(false);
    void (async () => {
      try {
        const result = await rpc("finish_farkle_game", { _game: activeGameId, _won: playerWon }) as {
          wager?: number; payout?: number; profit?: number; net?: number;
        };
        setSettlement({
          wager: Number(result.wager ?? activeWager),
          payout: Number(result.payout ?? 0),
          profit: Number(result.profit ?? 0),
          net: Number(result.net ?? 0),
        });
        onDoneRef.current();
      } catch {
        setSettlementError(true);
      } finally {
        setSettlementBusy(false);
      }
    })();
  }, [gameOver, activeGameId, playerWon, settlement, settlementBusy, settlementRetry, activeWager]);

  return (
    <section className="relative isolate overflow-hidden rounded-[1.75rem] border border-amber-200/20 bg-[#17100d] p-3 text-amber-50 shadow-[0_28px_80px_rgba(0,0,0,.38)] sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_8%_0%,rgba(180,116,45,.22),transparent_34%),radial-gradient(ellipse_at_92%_8%,rgba(117,62,34,.25),transparent_34%),linear-gradient(145deg,#241710_0%,#1a120e_52%,#100b09_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "repeating-linear-gradient(4deg,transparent 0px,transparent 9px,#e4b66d 10px,#e4b66d 11px,transparent 14px)" }} />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
      <div className="relative space-y-5 sm:space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-100/15 bg-[#2a1b14]/75 p-4 shadow-[0_12px_32px_rgba(0,0,0,.18)] backdrop-blur-sm sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200/25 bg-gradient-to-br from-amber-200/20 to-amber-500/5 text-3xl text-amber-200 shadow-inner">⚄</div>
            <div className="min-w-0"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-200/70"><Sparkles className="h-3.5 w-3.5" /> Taverna • disputa contra a casa</p><h2 className="mt-1 font-display text-2xl text-amber-100 sm:text-3xl">Jogo de Dados</h2><p className="mt-1 text-xs text-amber-100/60">Acumule pontos, administre o risco e alcance 4.000 primeiro.</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-amber-200/20 bg-black/25 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-300/10 text-amber-300"><Flame className="h-5 w-5" /></span>
            <div><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-100/55">Entrada por partida</p><p className="font-display text-xl leading-tight text-amber-200">3 vigor</p><p className="text-[10px] text-amber-100/55">{activeGameId ? `Aposta: ${activeWager.toLocaleString("pt-BR")} moedas` : "Aposta opcional"}</p></div>
          </div>
        </div>

        {phase === "intro" ? (
          <div className="mx-auto max-w-3xl space-y-5 py-4 text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl border-2 border-amber-100/25 bg-gradient-to-br from-amber-100 to-amber-400 text-6xl text-amber-950 shadow-[0_14px_28px_rgba(0,0,0,.4)]">⚄</div>
            <div><h3 className="font-display text-2xl text-amber-100">A sorte favorece os ousados?</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-amber-100/70">Role seis dados, separe combinações pontuadoras e decida quando parar. Cada novo lançamento pode multiplicar seus ganhos — ou levar tudo embora num Farkle.</p></div>
            <FarkleScoreGuide />
            <div className="space-y-3 rounded-2xl border border-amber-200/20 bg-[#211710]/85 p-4 text-left shadow-[0_12px_30px_rgba(0,0,0,.16)] sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200"><Coins className="h-5 w-5" /></span><div><p className="font-display text-lg text-amber-100">Aposta opcional</p><p className="text-[11px] text-amber-100/55">Você também pode jogar sem apostar.</p></div></div>
                <span className="rounded-full border border-amber-200/20 bg-amber-200/10 px-3 py-1 text-[10px] font-semibold text-amber-200">Máximo: {maxWager.toLocaleString("pt-BR")} moedas</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 space-y-1.5"><label htmlFor="farkle-wager" className="text-xs font-semibold text-amber-100/80">Quanto deseja apostar?</label><Input id="farkle-wager" aria-label="Aposta opcional em moedas" type="number" min={0} max={maxWager} step={1} value={wager} disabled={busy || maxWager === 0} onChange={(event) => { const amount = Math.floor(Number(event.target.value) || 0); setWager(Math.max(0, Math.min(maxWager, amount))); }} className="border-amber-100/20 bg-black/25 text-amber-50 placeholder:text-amber-100/30" /></div>
                <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={wager === 0 ? "default" : "outline"} onClick={() => setWager(0)} disabled={busy}>Sem aposta</Button>{wagerPresets.map((amount) => <Button key={amount} type="button" size="sm" variant={wager === amount ? "default" : "outline"} onClick={() => setWager(amount)} disabled={busy}>{amount.toLocaleString("pt-BR")}</Button>)}</div>
              </div>
              <p className="text-[11px] text-amber-100/55">Seu saldo: {coins.toLocaleString("pt-BR")} moedas · Limite de aposta: 50% do saldo atual.</p>
              <div className="grid gap-2 sm:grid-cols-2"><p className="rounded-xl border border-emerald-200/15 bg-emerald-950/25 p-3 text-[11px] leading-relaxed text-emerald-100/75"><strong className="text-emerald-200">Se vencer:</strong> recebe a aposta de volta e mais 50% de lucro. Ex.: aposta de 100 → recebe 150 moedas no total.</p><p className="rounded-xl border border-rose-200/15 bg-rose-950/25 p-3 text-[11px] leading-relaxed text-rose-100/75"><strong className="text-rose-200">Se perder:</strong> perde todo o valor apostado. Sem aposta, suas moedas não mudam.</p></div>
              <p className="text-[10px] leading-relaxed text-amber-100/40">A aposta é reservada ao iniciar. O lucro é arredondado para baixo quando a aposta for ímpar. Se sair ou recarregar a página antes do fim da partida, ela será considerada perdida.</p>
              <p className="text-[10px] leading-relaxed text-amber-100/35">A partida ainda é executada no navegador; o servidor registra a reserva e a liquidação, mas não revalida os lançamentos realizados.</p>
            </div>
            <p className="mt-2 text-xs text-amber-200/80">Com o vigor atual, você tem {Math.floor(vigor / 3)} partida(s) disponível(is) hoje.</p>
            <p className="text-xs text-amber-100/55">Você precisa selecionar ao menos uma combinação válida por lançamento. Dados guardados não voltam a rolar no mesmo turno. Um Farkle perde todos os pontos ainda não guardados. Ao usar os seis dados, você pode rolar os seis novamente.</p>
            <Button onClick={() => void startGame()} disabled={busy || vigor < 3 || wager > maxWager} className="min-h-12 border border-amber-100/20 bg-amber-300 px-8 font-display text-amber-950 shadow-lg hover:bg-amber-200">{busy ? "Preparando a mesa…" : vigor < 3 ? "Vigor insuficiente · precisa 3" : wager > 0 ? `Jogar com aposta de ${wager.toLocaleString("pt-BR")} · 3 vigor` : "Jogar sem aposta · 3 vigor"}</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-200/20 bg-gradient-to-br from-emerald-950/55 to-black/35 p-4 shadow-[0_12px_30px_rgba(0,0,0,.15)]">
                <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-100/65">Seu placar</p><span className="rounded-full border border-emerald-200/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">Jogador</span></div>
                <p className="mt-2 font-display text-4xl tabular-nums text-emerald-100">{playerTotal.toLocaleString("pt-BR")}<span className="ml-1 text-base text-emerald-100/45">/ 4.000</span></p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/35"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-200 transition-[width] duration-500" style={{ width: `${playerProgress}%` }} /></div>
                <p className="mt-2 text-[10px] text-emerald-100/55">Pontos já protegidos no placar</p>
              </div>
              <div className="rounded-2xl border border-amber-200/20 bg-gradient-to-br from-amber-950/55 to-black/35 p-4 shadow-[0_12px_30px_rgba(0,0,0,.15)]">
                <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-100/65">Placar da casa</p><span className="rounded-full border border-amber-200/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold text-amber-200">Máquina</span></div>
                <p className="mt-2 font-display text-4xl tabular-nums text-amber-100">{machineTotal.toLocaleString("pt-BR")}<span className="ml-1 text-base text-amber-100/45">/ 4.000</span></p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/35"><div className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-200 transition-[width] duration-500" style={{ width: `${machineProgress}%` }} /></div>
                <p className="mt-2 text-[10px] text-amber-100/55">Pontos guardados pela casa</p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-rose-200/15 bg-gradient-to-br from-rose-950/35 to-black/30 p-4 shadow-inner">
                <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wider text-amber-100/70">Sua rodada · em risco</p><span className="font-display text-xl tabular-nums text-amber-300">{playerTurnPoints.toLocaleString("pt-BR")}</span></div>
                <p className="mt-1 text-[11px] text-amber-100/55">{phase === "player-roll" || phase === "player-select" || phase === "player-action" ? "Estes pontos só entram no total quando você encerra a rodada." : "Pontuação acumulada do turno do jogador."}</p>
              </div>
              <div className="rounded-2xl border border-amber-200/15 bg-gradient-to-br from-amber-950/35 to-black/30 p-4 shadow-inner">
                <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wider text-amber-100/70">Rodada da máquina</p><span className="font-display text-xl tabular-nums text-amber-300">{machineTurnPoints.toLocaleString("pt-BR")}</span></div>
                <p className="mt-1 text-[11px] text-amber-100/55">{machineMessage}</p>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-amber-100/25 bg-[linear-gradient(145deg,#513821_0%,#352417_48%,#24180f_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.07),0_18px_40px_rgba(0,0,0,.22)] sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wider text-amber-200/80">Mesa de lançamento</p><p className="text-[11px] text-amber-100/55">Dados disponíveis: {phase === "player-select" ? dice.length : diceToRoll}</p></div><span className="rounded-full border border-amber-200/20 bg-black/25 px-3 py-1 text-xs font-semibold text-amber-200">{phase === "machine" ? "Vez da máquina" : phase === "finished" ? "Partida encerrada" : phase === "player-select" ? "Selecione os dados" : phase === "player-action" ? "Decida seu próximo passo" : phase === "farkle" ? "Farkle!" : "Sua vez"}</span></div>
              {farkleFlash && <div role="alert" className="mb-3 animate-pulse rounded-xl border border-red-300/50 bg-red-950/70 p-3 text-center font-display text-xl text-red-100">FARKLE! Pontos da rodada perdidos.</div>}
              <div className="flex min-h-28 flex-wrap items-center justify-center gap-2.5 py-3 sm:gap-4">
                {dice.length > 0 ? dice.map((face, index) => {
                  const chosen = selectedIndices.includes(index);
                  return <button key={index} type="button" onClick={() => toggleDie(index)} disabled={phase !== "player-select"} aria-pressed={chosen} aria-label={`Dado ${index + 1}: face ${face}${chosen ? ", selecionado" : ""}`} className={`flex h-[4.35rem] w-[4.35rem] items-center justify-center rounded-2xl border-2 text-[3.6rem] leading-none shadow-[0_7px_0_rgba(0,0,0,.28),0_12px_20px_rgba(0,0,0,.25)] transition-all ${chosen ? "translate-y-[-5px] rotate-[-5deg] border-emerald-300 bg-emerald-100 text-emerald-950 ring-4 ring-emerald-300/30" : "border-amber-950/30 bg-gradient-to-br from-[#fff8e8] to-[#d7c39a] text-[#39291b] hover:-translate-y-1"} ${phase === "player-select" ? "cursor-pointer" : "cursor-default opacity-95"}`}>{DIE_GLYPHS[face]}</button>;
                }) : <p className="text-sm italic text-amber-100/55">{phase === "machine" ? "A máquina está preparando o lançamento…" : "Os dados aguardam seu comando."}</p>}
              </div>
              {phase === "player-select" && <div className="mt-2 rounded-xl border border-amber-100/15 bg-black/20 p-3 text-center"><p className="text-sm text-amber-100">{selectedIndices.length ? selectedScore > 0 ? selectedFaces.map((face) => DIE_GLYPHS[face]).join(" ") + " · " + selectedScore.toLocaleString("pt-BR") + " pontos" : "Essa seleção não forma uma combinação válida." : "Clique em um ou mais dados para separá-los."}</p>{selectedIndices.length > 0 && selectedScore === 0 && <p className="mt-1 text-xs text-red-200">Selecione somente dados que pontuem juntos neste lançamento. Tente outra combinação.</p>}</div>}
              {phase === "player-action" && <p className="mt-2 rounded-xl border border-amber-100/15 bg-black/20 p-3 text-center text-sm text-amber-100">Você guardou {playerTurnPoints.toLocaleString("pt-BR")} pontos. Ainda há {diceToRoll} dado(s) para arriscar.</p>}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {phase === "player-roll" && <Button onClick={() => void playerRoll()} disabled={busy} className="border border-amber-100/20 bg-amber-300 px-5 font-display text-amber-950 hover:bg-amber-200">⚄ Lançar {diceToRoll} dado(s)</Button>}
                {phase === "player-select" && <Button onClick={saveSelectedDice} disabled={!selectionValid} className="border border-emerald-200/20 bg-emerald-300 px-5 font-display text-emerald-950 hover:bg-emerald-200">Separar dados · {selectionValid ? selectedScore.toLocaleString("pt-BR") + " pts" : "selecione combinação"}</Button>}
                {phase === "player-action" && <><Button onClick={() => { setPhase("player-roll"); setStatus("Você decidiu arriscar. Boa sorte!"); }} variant="outline" className="border-amber-100/30 bg-transparent text-amber-50 hover:bg-amber-100/10">↻ Arriscar novamente ({diceToRoll})</Button><Button onClick={() => void bankPlayerTurn()} className="bg-emerald-300 font-display text-emerald-950 hover:bg-emerald-200">Guardar e passar a vez</Button></>}
                {(phase === "machine" || phase === "farkle") && <span className="rounded-lg border border-amber-100/20 px-4 py-2 text-sm text-amber-100/75">{phase === "machine" ? "A máquina está jogando…" : "A rodada foi perdida…"}</span>}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200/15 bg-[#241811]/80 p-4 shadow-inner backdrop-blur-sm">
              <div className="flex items-center justify-between gap-2"><h3 className="font-display text-lg text-amber-100">Jogada da máquina</h3><span className="text-xs text-amber-100/55">{machineDice.length ? machineDice.length + " dados" : "Aguardando"}</span></div>
              <div className="mt-2 flex min-h-12 flex-wrap items-center gap-2">{machineDice.map((face, index) => <span key={index} className={`flex h-10 w-10 items-center justify-center rounded-lg border text-3xl leading-none ${machineSelected.includes(index) ? "border-emerald-200 bg-emerald-200 text-emerald-950" : "border-amber-100/20 bg-amber-50 text-amber-950"}`}>{DIE_GLYPHS[face]}</span>)}{!machineDice.length && <span className="text-xs text-amber-100/45">A máquina ainda não lançou os dados.</span>}</div>
              <p className="mt-2 text-xs text-amber-100/70">{machineMessage}</p>
            </div>

            <div className="rounded-2xl border border-amber-200/15 bg-[#241811]/80 p-4 shadow-inner backdrop-blur-sm">
              <h3 className="mb-3 flex items-center gap-2 font-display text-lg text-amber-100"><Shield className="h-4 w-4 text-amber-300" />Histórico recente</h3>
              <div className="space-y-2">{history.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100/10 bg-black/15 px-3 py-2 text-xs"><div className="min-w-0"><p className="font-semibold text-amber-100">{item.who} <span className="font-normal text-amber-100/55">· {item.detail}</span></p><p className="mt-0.5 text-amber-100/65">Rolou {item.dice.map((face) => face).join(" · ")}{item.selected.length ? " | Guardou " + item.selected.join(" · ") : ""}</p></div><span className={`font-display text-base ${item.points ? "text-emerald-300" : "text-red-200"}`}>{item.points ? "+" + item.points.toLocaleString("pt-BR") : "0"}</span></div>)}{!history.length && <p className="text-xs text-amber-100/50">Os lançamentos e combinações aparecerão aqui.</p>}</div>
            </div>
            <FarkleScoreGuide compact />
            <p aria-live="polite" className="rounded-xl border border-amber-100/10 bg-black/20 px-4 py-3 text-center text-xs text-amber-100/70">{status}</p>
          </>
        )}

        {gameOver && <div className="absolute inset-0 z-10 grid place-items-center rounded-[1.5rem] bg-black/80 p-4 backdrop-blur-md"><div className="w-full max-w-md space-y-4 rounded-3xl border border-amber-200/30 bg-[linear-gradient(145deg,#59402b,#2a1d15)] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,.5)]"><Trophy className="mx-auto h-12 w-12 text-amber-300" /><p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-200/70">Fim da partida</p><h3 className="font-display text-3xl text-amber-100">{playerWon ? "Você venceu!" : "A máquina venceu"}</h3><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-amber-100/60">Você</p><p className="font-display text-2xl text-amber-100">{playerTotal.toLocaleString("pt-BR")}</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-amber-100/60">Máquina</p><p className="font-display text-2xl text-amber-100">{machineTotal.toLocaleString("pt-BR")}</p></div></div>
          {settlementBusy && <p aria-live="polite" className="rounded-xl border border-amber-200/20 bg-black/25 p-3 text-sm text-amber-100/75">Conferindo o resultado e atualizando sua carteira…</p>}
          {settlementError && <div className="space-y-2 rounded-xl border border-rose-200/25 bg-rose-950/30 p-3 text-sm text-rose-100"><p>Não foi possível confirmar a aposta. Tente novamente para concluir a liquidação.</p><Button type="button" variant="outline" className="w-full border-rose-100/30 bg-transparent text-rose-50 hover:bg-rose-100/10" onClick={() => { settlementRequested.current = false; setSettlementError(false); setSettlementRetry((value) => value + 1); }}>Tentar novamente</Button></div>}
          {settlement && settlement.wager > 0 && <div className={`rounded-xl border p-3 text-sm ${playerWon ? "border-emerald-200/20 bg-emerald-950/30 text-emerald-100" : "border-rose-200/20 bg-rose-950/30 text-rose-100"}`}><p className="font-semibold">{playerWon ? "Aposta vencedora!" : "Aposta perdida"}</p><p className="mt-1 text-xs leading-relaxed">{playerWon ? `Sua aposta de ${settlement.wager.toLocaleString("pt-BR")} moedas foi devolvida, com ${settlement.profit.toLocaleString("pt-BR")} moedas de lucro. Crédito total: ${settlement.payout.toLocaleString("pt-BR")} moedas.` : `Você perdeu as ${settlement.wager.toLocaleString("pt-BR")} moedas apostadas.`}</p></div>}
          {settlement && settlement.wager === 0 && <p className="rounded-xl border border-amber-100/10 bg-black/20 p-3 text-xs text-amber-100/60">Partida sem aposta. Nenhuma moeda foi debitada ou creditada.</p>}
          <Button disabled={settlementBusy || settlementError || !settlement} onClick={() => { setPhase("intro"); setStatus("Uma nova partida custa mais 3 de vigor."); setWager(0); setActiveWager(0); setActiveGameId(null); setSettlement(null); setSettlementError(false); settlementRequested.current = false; }} className="w-full border border-amber-100/20 bg-amber-300 font-display text-amber-950 hover:bg-amber-200"><RotateCcw className="h-4 w-4" />Nova partida · 3 vigor</Button></div></div>}
      </div>
    </section>
  );
}
