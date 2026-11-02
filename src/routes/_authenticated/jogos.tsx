import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { rpc, useRefresh, useMe } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Swords, Dice5, Brain, Trophy, RotateCcw, Shield } from "lucide-react";
import { useCustomization } from "@/lib/app-customization";
import { VigorRestore, useGameSettings } from "@/components/VigorRestore";
import { bestScoringSelection, machineShouldBank, nextRollCount, scoreDiceSelection, hasScoringCombination, farkleProbability, type DieFace } from "@/lib/farkle";

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
          <TabsTrigger value="farkle" className="flex-1"><Trophy className="h-4 w-4" />Jogo de Dados</TabsTrigger>
          <TabsTrigger value="puzzle" className="flex-1"><Brain className="h-4 w-4" />{text("jogos_puzzle")}</TabsTrigger>
        </TabsList>
        <TabsContent value="combat"><Combat onDone={after} hasActive={!!me?.profile?.active_character_id} buttonLabel={text("jogos_fight")} /></TabsContent>
        <TabsContent value="dice"><Dice onDone={after} buttonLabel={text("jogos_roll")} /></TabsContent>
        <TabsContent value="farkle"><Farkle onDone={after} vigor={Number(vigor ?? 0)} /></TabsContent>
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



type FarkleLog = {
  id: number; who: "Você" | "Máquina"; dice: DieFace[]; selected: DieFace[];
  points: number; detail: string;
};

const DIE_GLYPHS = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const rollFarkleDice = (count: number): DieFace[] =>
  Array.from({ length: count }, () => (1 + Math.floor(Math.random() * 6)) as DieFace);

function Farkle({ onDone, vigor }: { onDone: () => void; vigor: number }) {
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
  const timer = useRef<number | null>(null);
  const selectedFaces = selectedIndices.map((index) => dice[index]);
  const selectedScore = scoreDiceSelection(selectedFaces);
  const selectionValid = selectedIndices.length > 0 && selectedScore > 0;
  const gameOver = phase === "finished";

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
      await rpc("start_farkle_game", {}, "Entrada confirmada: 3 de vigor gastos.");
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

    while (true) {
      setMachineMessage("A máquina está lançando " + remaining + (remaining === 1 ? " dado…" : " dados…"));
      setMachineSelected([]);
      const thrown = rollFarkleDice(remaining);
      throws += 1;
      setMachineDice(thrown);
      await pause(650);

      const choice = bestScoringSelection(thrown);
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

      if (throws >= 18 || machineShouldBank({
        machineTotal: currentMachineTotal,
        playerTotal: currentPlayerTotal,
        turnPoints,
        diceRemaining: remaining,
        target: 4_000,
        riskTemperament: temperament,
      })) {
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

      setMachineMessage("A máquina decidiu arriscar! Risco estimado de Farkle: " + Math.round(farkleProbability(remaining) * 100) + "%.");
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

  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-900/40 bg-[radial-gradient(ellipse_at_top,#70502d_0%,#3a281d_45%,#211912_100%)] p-4 text-amber-50 shadow-2xl sm:p-6">
      <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "repeating-linear-gradient(4deg,transparent 0px,transparent 9px,#d6a35a 10px,#d6a35a 11px,transparent 14px)" }} />
      <div className="relative space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-200/20 pb-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-200/70">Jogo de taberna • disputa contra a casa</p><h2 className="mt-1 flex items-center gap-2 font-display text-2xl text-amber-100 sm:text-3xl"><span aria-hidden="true">⚄</span> Jogo de Dados</h2><p className="mt-1 text-xs text-amber-100/65">Primeiro a guardar 4.000 pontos vence.</p></div>
          <div className="rounded-xl border border-amber-200/20 bg-black/20 px-3 py-2 text-right"><p className="text-[10px] font-bold uppercase tracking-wider text-amber-100/60">Entrada</p><p className="font-display text-lg text-amber-200">3 vigor</p><p className="text-[10px] text-amber-100/50">por partida</p></div>
        </div>

        {phase === "intro" ? (
          <div className="mx-auto max-w-3xl space-y-5 py-4 text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl border-2 border-amber-100/25 bg-gradient-to-br from-amber-100 to-amber-400 text-6xl text-amber-950 shadow-[0_14px_28px_rgba(0,0,0,.4)]">⚄</div>
            <div><h3 className="font-display text-2xl text-amber-100">A sorte favorece os ousados?</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-amber-100/70">Role seis dados, separe combinações pontuadoras e decida quando parar. Cada novo lançamento pode multiplicar seus ganhos — ou levar tudo embora num Farkle.</p></div>
            <div className="grid gap-3 text-left sm:grid-cols-3">
              <div className="rounded-xl border border-amber-100/15 bg-black/20 p-3"><p className="font-display text-amber-200">1 e 5</p><p className="mt-1 text-sm text-amber-50/70">Um 1 vale 100; um 5 vale 50 pontos.</p></div>
              <div className="rounded-xl border border-amber-100/15 bg-black/20 p-3"><p className="font-display text-amber-200">Trincas ou mais</p><p className="mt-1 text-sm text-amber-50/70">Trincas valem de 200 a 1.000. Cada dado extra igual dobra o valor.</p></div>
              <div className="rounded-xl border border-amber-100/15 bg-black/20 p-3"><p className="font-display text-amber-200">Sequências</p><p className="mt-1 text-sm text-amber-50/70">1–5 vale 500; 2–6 vale 750; 1–6 vale 1.500.</p></div>
            </div>
            <p className="mt-2 text-xs text-amber-200/80">Com o vigor atual, você tem {Math.floor(vigor / 3)} partida(s) disponível(is) hoje.</p>
            <p className="text-xs text-amber-100/55">Você precisa selecionar ao menos uma combinação válida por lançamento. Dados guardados não voltam a rolar no mesmo turno. Um Farkle perde todos os pontos ainda não guardados. Ao usar os seis dados, você pode rolar os seis novamente.</p>
            <Button onClick={() => void startGame()} disabled={busy || vigor < 3} className="min-h-12 border border-amber-100/20 bg-amber-300 px-8 font-display text-amber-950 shadow-lg hover:bg-amber-200">{busy ? "Preparando a mesa…" : vigor < 3 ? "Vigor insuficiente · precisa 3" : "Jogar · gastar 3 de vigor"}</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-amber-200/20 bg-black/25 p-3"><p className="text-xs uppercase tracking-wider text-amber-100/60">Você</p><p className="font-display text-3xl tabular-nums text-amber-100">{playerTotal.toLocaleString("pt-BR")}</p><p className="text-[11px] text-amber-100/60">Total guardado</p></div>
              <div className="rounded-xl border border-amber-200/20 bg-black/25 p-3"><p className="text-xs uppercase tracking-wider text-amber-100/60">Máquina</p><p className="font-display text-3xl tabular-nums text-amber-100">{machineTotal.toLocaleString("pt-BR")}</p><p className="text-[11px] text-amber-100/60">Total guardado</p></div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-amber-200/20 bg-black/25 p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wider text-amber-100/70">Sua rodada · em risco</p><span className="font-display text-xl tabular-nums text-amber-300">{playerTurnPoints.toLocaleString("pt-BR")}</span></div>
                <p className="mt-1 text-[11px] text-amber-100/55">{phase === "player-roll" || phase === "player-select" || phase === "player-action" ? "Estes pontos só entram no total quando você encerra a rodada." : "Pontuação acumulada do turno do jogador."}</p>
              </div>
              <div className="rounded-xl border border-amber-200/20 bg-black/25 p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wider text-amber-100/70">Rodada da máquina</p><span className="font-display text-xl tabular-nums text-amber-300">{machineTurnPoints.toLocaleString("pt-BR")}</span></div>
                <p className="mt-1 text-[11px] text-amber-100/55">{machineMessage}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-100/20 bg-gradient-to-b from-[#4b3524] to-[#2d2118] p-3 shadow-inner sm:p-5">
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

            <div className="rounded-xl border border-amber-200/20 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2"><h3 className="font-display text-lg text-amber-100">Jogada da máquina</h3><span className="text-xs text-amber-100/55">{machineDice.length ? machineDice.length + " dados" : "Aguardando"}</span></div>
              <div className="mt-2 flex min-h-12 flex-wrap items-center gap-2">{machineDice.map((face, index) => <span key={index} className={`flex h-10 w-10 items-center justify-center rounded-lg border text-3xl leading-none ${machineSelected.includes(index) ? "border-emerald-200 bg-emerald-200 text-emerald-950" : "border-amber-100/20 bg-amber-50 text-amber-950"}`}>{DIE_GLYPHS[face]}</span>)}{!machineDice.length && <span className="text-xs text-amber-100/45">A máquina ainda não lançou os dados.</span>}</div>
              <p className="mt-2 text-xs text-amber-100/70">{machineMessage}</p>
            </div>

            <div className="rounded-xl border border-amber-200/20 bg-black/20 p-3">
              <h3 className="mb-3 flex items-center gap-2 font-display text-lg text-amber-100"><Shield className="h-4 w-4 text-amber-300" />Histórico recente</h3>
              <div className="space-y-2">{history.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100/10 bg-black/15 px-3 py-2 text-xs"><div className="min-w-0"><p className="font-semibold text-amber-100">{item.who} <span className="font-normal text-amber-100/55">· {item.detail}</span></p><p className="mt-0.5 text-amber-100/65">Rolou {item.dice.map((face) => face).join(" · ")}{item.selected.length ? " | Guardou " + item.selected.join(" · ") : ""}</p></div><span className={`font-display text-base ${item.points ? "text-emerald-300" : "text-red-200"}`}>{item.points ? "+" + item.points.toLocaleString("pt-BR") : "0"}</span></div>)}{!history.length && <p className="text-xs text-amber-100/50">Os lançamentos e combinações aparecerão aqui.</p>}</div>
            </div>
            <p aria-live="polite" className="text-center text-xs text-amber-100/65">{status}</p>
          </>
        )}

        {gameOver && <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-black/75 p-4 backdrop-blur-sm"><div className="w-full max-w-md space-y-4 rounded-2xl border border-amber-200/30 bg-gradient-to-br from-[#59402b] to-[#2a1d15] p-6 text-center shadow-2xl"><Trophy className="mx-auto h-12 w-12 text-amber-300" /><p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-200/70">Fim da partida</p><h3 className="font-display text-3xl text-amber-100">{playerWon ? "Você venceu!" : "A máquina venceu"}</h3><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-amber-100/60">Você</p><p className="font-display text-2xl text-amber-100">{playerTotal.toLocaleString("pt-BR")}</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-amber-100/60">Máquina</p><p className="font-display text-2xl text-amber-100">{machineTotal.toLocaleString("pt-BR")}</p></div></div><Button onClick={() => { setPhase("intro"); setStatus("Uma nova partida custa mais 3 de vigor."); }} className="w-full border border-amber-100/20 bg-amber-300 font-display text-amber-950 hover:bg-amber-200"><RotateCcw className="h-4 w-4" />Nova partida · 3 vigor</Button></div></div>}
      </div>
    </section>
  );
}
