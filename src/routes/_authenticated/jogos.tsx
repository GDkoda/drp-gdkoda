import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { rpc, useRefresh, useMe } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Swords, Spade, Dice5, Brain, Trophy, RotateCcw, Shield, BookOpen, Flame, Sparkles, Coins, Wind, X, CheckCircle2, Sparkle, Plus, Lock, ArrowLeft, Skull } from "lucide-react";
import { useCustomization } from "@/lib/app-customization";
import { supabase } from "@/integrations/supabase/client";
import { VigorRestore, useGameSettings } from "@/components/VigorRestore";
import { combatEffectLabel, isCombatAbilityAvailable, isCombatActionAvailable } from "@/lib/combat";
import { getMonsterArtwork } from "@/lib/monster-art";
import type { CombatAction, CombatLogEntry, CombatState } from "@/lib/combat";
import { maxTwentyOneWager, cardRank, cardSuit, type TwentyOneSuit } from "@/lib/twentyone";
import { toast } from "sonner";
import { createMachineStrategy, maxFarkleWager, nextRollCount, scoreDiceSelection, hasScoringCombination, farkleProbability } from "@/lib/farkle";
import type { DieFace } from "@/lib/farkle";

function JogosRouteComponent() {
  return <Jogos />;
}


export const Route = createFileRoute("/_authenticated/jogos")({
  head: () => ({ meta: [{ title: "Mini-jogos — Mesa 3D&T" }, { name: "description", content: "Combate tático, jogo de 21 com cartas e enigmas." }] }),
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
      <p className="text-sm text-muted-foreground">Combate tático, 21 com cartas, Farkle e enigmas para desafiar sua sorte e estratégia.</p>
      <VigorRestore vigor={vigor} />
      <Tabs defaultValue="combat">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 rounded-xl sm:grid-cols-4 border border-border bg-muted/70 p-1.5">
          <TabsTrigger value="combat" className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:text-sm"><Swords className="h-4 w-4" />{text("jogos_combat")}</TabsTrigger>
          <TabsTrigger value="twentyone" className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:text-sm"><Spade className="h-4 w-4" />21</TabsTrigger>
          <TabsTrigger value="farkle" className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:text-sm"><Dice5 className="h-4 w-4" />Farkle</TabsTrigger>
          <TabsTrigger value="puzzle" className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:text-sm"><Brain className="h-4 w-4" />{text("jogos_puzzle")}</TabsTrigger>
        </TabsList>
        <TabsContent value="combat"><Combat onDone={after} hasActive={!!me?.profile?.active_character_id} buttonLabel={text("jogos_fight")} /></TabsContent>
        <TabsContent value="twentyone"><TwentyOne onDone={after} coins={Number(me?.profile?.coins ?? 0)} vigor={Number(vigor ?? 0)} /></TabsContent>
        <TabsContent value="farkle" forceMount className="mt-2 data-[state=inactive]:hidden"><Farkle onDone={after} vigor={Number(vigor ?? 0)} coins={Number(me?.profile?.coins ?? 0)} /></TabsContent>
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
  const [visualEvents, setVisualEvents] = useState<{ id: string; target: "hero" | "monster"; kind: "damage" | "heal" | "guard" | "aim" | "feint"; amount: number; crit?: boolean; sourceAction?: string }[]>([]);
  const lastLogCount = useRef(0);
  const previousState = useRef<CombatState | null>(null);
  const visualSequence = useRef(0);
  const completed = useRef(false);
  const done = !!res && res.status !== "active";
  const { data: monsterArtworkUrl } = useQuery({ queryKey: ["combat-monster-art", res?.monster], enabled: !!res?.monster, queryFn: async () => { const { data } = await (supabase as any).from("monsters").select("image_url").eq("name", res!.monster).maybeSingle(); return data?.image_url as string | null; } });

  async function startFight() {
    setBusy(true);
    completed.current = false;
    try {
      const state = await rpc("start_combat", {}) as CombatState;
      lastLogCount.current = state.log?.length ?? 0;
      previousState.current = state;
      setVisualEvents([]);
      setRes(state);
      onDone();
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
        if (!cancelled && state) {
          const recovered = state as CombatState;
          lastLogCount.current = recovered.log?.length ?? 0;
          previousState.current = recovered;
          setRes(recovered);
        }
      })
      .catch(() => {
        // A falha ao recuperar uma sessão não bloqueia iniciar um novo combate.
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!res) { lastLogCount.current = 0; previousState.current = null; setVisualEvents([]); return; }
    const log = res.log ?? [];
    const fresh = log.slice(lastLogCount.current);
    const before = previousState.current;
    lastLogCount.current = log.length;
    previousState.current = res;
    const events: typeof visualEvents = [];

    fresh.slice(-3).forEach((entry) => {
      const target = entry.target ?? "monster";
      const action = entry.action ?? "";
      if ((entry.dmg ?? 0) > 0) {
        events.push({ id: String(++visualSequence.current), target, kind: "damage", amount: entry.dmg ?? 0, crit: !!entry.crit, sourceAction: action });
      }
      if (entry.effect === "heal" || action === "Recuperar fôlego") {
        // The recovery log's hp is captured before the enemy's response, so it
        // preserves the exact heal even when the monster damages the hero later
        // in the same turn.
        const actualHeal = target === "hero" && before
          ? Math.max(0, (entry.hp ?? res.heroPv) - before.heroPv)
          : Math.max(0, entry.amount ?? 0);
        if (actualHeal > 0) events.push({ id: String(++visualSequence.current), target: "hero", kind: "heal", amount: actualHeal, sourceAction: action });
      }
      if (entry.effect === "guard" || action === "Postura defensiva" || action.includes("Guarda defensiva")) {
        events.push({ id: String(++visualSequence.current), target, kind: "guard", amount: entry.amount ?? 0, sourceAction: action });
      }
      if (action.toLocaleLowerCase().includes("preparar ataque") || action.toLocaleLowerCase().includes("mirar")) {
        events.push({ id: String(++visualSequence.current), target: "hero", kind: "aim", amount: 0, sourceAction: action });
      }
      if (action === "Finta") {
        events.push({ id: String(++visualSequence.current), target: "monster", kind: "feint", amount: 0, sourceAction: action });
      }
    });

    setVisualEvents(events);
  }, [res]);

  useEffect(() => {
    if (!visualEvents.length) return;
    const timeout = window.setTimeout(() => setVisualEvents([]), 1650);
    return () => window.clearTimeout(timeout);
  }, [visualEvents]);

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
    { id: "recover", title: "Recuperar fôlego", description: "Recupera até 3 PV; o inimigo ainda age.", cost: "1 PM", icon: Sparkles, tone: "text-mana", disabled: !isCombatActionAvailable("recover", res) },
    { id: "feint", title: "Finta", description: "+1 na FA; se causar dano, reduz o próximo ataque inimigo em 2.", cost: "Sem custo de PM", icon: Wind, tone: "text-amber-400" },
  ];
  const entries = (res?.log ?? []).filter((entry: CombatLogEntry) => !entry.system);
  const latestTurn = entries.reduce((max, entry) => Math.max(max, entry.turn ?? 0), 0);
  const latestTurnEntries = entries.filter((entry) => (entry.turn ?? 0) === latestTurn);
  const heroDamageTaken = latestTurnEntries.filter((entry) => entry.target === "hero").reduce((sum, entry) => sum + (entry.dmg ?? 0), 0);
  const monsterDamageTaken = latestTurnEntries.filter((entry) => entry.target === "monster").reduce((sum, entry) => sum + (entry.dmg ?? 0), 0);

  return (
    <div className={`combat-screen space-y-4 rounded-2xl border bg-card p-4 sm:p-6 ${res ? "combat-screen-active" : ""}`}>

      {!res && (
        <section className="combat-lobby">
          <div className="combat-lobby-art" aria-hidden="true">
            <div className="combat-lobby-orbit combat-lobby-orbit-one" />
            <div className="combat-lobby-orbit combat-lobby-orbit-two" />
            <div className="combat-lobby-sigil"><Swords className="h-10 w-10 sm:h-12 sm:w-12" /><span>⚔</span></div>
            <i className="combat-lobby-spark combat-lobby-spark-one">✦</i>
            <i className="combat-lobby-spark combat-lobby-spark-two">✧</i>
          </div>

          <div className="combat-lobby-copy">
            <p className="combat-lobby-eyebrow"><Sparkles className="h-3.5 w-3.5" /> Arena de desafios · 3D&T Alpha</p>
            <h2>Erga sua arma. A batalha chama.</h2>
            <p>Enfrente um adversário escolhido para a arena. Cada turno exige uma decisão: atacar, pressionar, recuperar o fôlego ou enganar a defesa inimiga.</p>
          </div>

          <div className="combat-lobby-info">
            <div className="combat-lobby-cost">
              <span className="combat-lobby-info-icon"><Zap className="h-4 w-4" /></span>
              <span><small>Custo de entrada</small><strong>2 pontos de vigor</strong></span>
            </div>
            <div className="combat-lobby-separator" />
            <div className={"combat-lobby-character" + (hasActive ? " is-ready" : " is-missing")}>
              <span className="combat-lobby-info-icon">{hasActive ? <Shield className="h-4 w-4" /> : <Lock className="h-4 w-4" />}</span>
              <span><small>Sua ficha</small><strong>{hasActive ? "Herói preparado" : "Nenhuma ficha ativa"}</strong></span>
            </div>
          </div>

          <div className="combat-lobby-footer">
            <div className="combat-lobby-rules">
              <span><Swords className="h-3 w-3" /> Ação por turno</span>
              <span><Sparkles className="h-3 w-3" /> Habilidades e PM</span>
              <span><Shield className="h-3 w-3" /> Inimigo automático</span>
            </div>
            {!hasActive && <p className="combat-lobby-warning">Defina uma ficha ativa na tela de Fichas antes de entrar na arena.</p>}
            <Button className="combat-lobby-start h-12 w-full sm:w-auto sm:min-w-56" onClick={startFight} disabled={busy || !hasActive}>
              <Swords className="h-4 w-4" />
              {busy ? "Preparando a arena…" : !hasActive ? "Ficha necessária" : buttonLabel}
              <span aria-hidden="true">→</span>
            </Button>
          </div>
        </section>
      )}

      {res && (
        <div className="space-y-4">
          <div className="combat-status-grid grid grid-cols-2 gap-2 sm:gap-3">
            <div className={`relative combat-status-card combat-hero-card space-y-2 rounded-xl border bg-background/50 p-2 sm:space-y-3 sm:p-4 ${visualEvents.some((event) => event.target === "hero" && event.kind === "damage") ? "jrpg-hit-panel" : ""} ${visualEvents.some((event) => event.target === "hero" && event.kind === "heal") ? "jrpg-heal-panel" : ""}`}>
              {visualEvents.filter((event) => event.target === "hero").map((event) => (
                <span key={event.id} className={`jrpg-number ${event.kind === "damage" ? "jrpg-number-damage" : event.kind === "heal" ? "jrpg-number-heal" : "jrpg-number-guard"}`}>
                  {event.kind === "damage" ? `-${event.amount}${event.crit ? " CRÍTICO!" : ""}` : event.kind === "heal" ? `+${event.amount}` : event.kind === "aim" ? "MIRA!" : event.kind === "feint" ? "FINTA!" : "DEFESA!"}
                </span>
              ))}
              <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10"><Swords className="h-5 w-5 text-gold" /></span><div className="min-w-0"><p className="text-xs uppercase tracking-wider text-muted-foreground">Herói</p><h3 className="truncate font-display text-lg">{res.hero}</h3></div></div>
              <StatBar label="Pontos de Vida (PV)" value={res.heroPv} max={res.heroMaxPv} color="bg-emerald-500" />
              <StatBar label="Pontos de Magia (PM)" value={res.heroPm} max={res.heroMaxPm} color="bg-sky-500" />
              <div className="combat-attributes flex gap-1 pt-1 text-center [&>div]:flex-1 [&>div]:min-w-0">{([["F", res.attributes?.f], ["H", res.attributes?.h], ["R", res.attributes?.r], ["A", res.attributes?.a], ["PdF", res.attributes?.pdf]] as const).map(([label, value]) => <div key={label} className="rounded-md bg-muted/60 px-1 py-1"><span className="block text-[10px] uppercase text-muted-foreground">{label}</span><span className="font-display text-sm">{value ?? "—"}</span></div>)}</div>
            </div>
            <div className="combat-status-card combat-enemy-card space-y-2 rounded-xl border border-blood/20 bg-blood/5 p-2 sm:space-y-3 sm:p-4">
              <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blood/10"><Shield className="h-5 w-5 text-blood" /></span><div className="min-w-0"><p className="text-xs uppercase tracking-wider text-muted-foreground">Adversário</p><h3 className="truncate font-display text-lg">{res.monster}</h3></div></div>
              <div className="combat-monster-stage relative isolate flex min-h-[210px] items-center justify-center overflow-hidden rounded-xl border border-blood/20 bg-gradient-to-b from-[#211629] via-[#17121e] to-[#0c0b12] p-3">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(154,67,165,0.22),transparent_68%)]" />
                <img
                  key={visualEvents.filter((event) => event.target === "monster")[visualEvents.filter((event) => event.target === "monster").length - 1]?.id ?? "monster-art"}
                  src={monsterArtworkUrl || getMonsterArtwork(res.monster).src}
                  alt={getMonsterArtwork(res.monster).alt}
                  className={`combat-monster-art relative z-10 h-[190px] w-full object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.55)] ${visualEvents.some((event) => event.target === "monster" && event.kind === "damage") ? "jrpg-hit" : ""} ${visualEvents.some((event) => event.target === "monster" && event.kind === "heal") ? "jrpg-heal" : ""} ${visualEvents.some((event) => event.target === "monster" && event.kind === "feint") ? "jrpg-feint" : ""} ${visualEvents.some((event) => event.target === "monster" && event.kind === "damage" && event.sourceAction?.startsWith("Magia:")) ? "jrpg-magic" : ""} `}
                />
                {visualEvents.some((event) => event.target === "monster" && event.kind === "damage" && !event.sourceAction?.startsWith("Magia:")) && <span className="jrpg-slash" />}
                {visualEvents.some((event) => event.target === "monster" && event.kind === "damage" && event.sourceAction?.startsWith("Magia:")) && <span className="jrpg-magic-burst" />}
                {visualEvents.some((event) => event.target === "monster" && event.kind === "feint") && <span className="absolute inset-x-8 top-1/2 z-20 h-1 -rotate-12 rounded-full bg-gradient-to-r from-transparent via-amber-200 to-transparent shadow-[0_0_18px_rgba(251,191,36,.9)]" />}
                {visualEvents.some((event) => event.target === "monster" && event.kind === "guard") && <span className="pointer-events-none absolute z-20 h-32 w-32 rounded-full border-[5px] border-sky-300/80 shadow-[0_0_30px_rgba(56,189,248,.75)]" />}
                {visualEvents.filter((event) => event.target === "monster").map((event) => (
                  <span key={event.id} className={`jrpg-number ${event.kind === "damage" ? "jrpg-number-damage" : event.kind === "heal" ? "jrpg-number-heal" : "jrpg-number-guard"}`}>
                    {event.kind === "damage" ? `-${event.amount}${event.crit ? " CRÍTICO!" : ""}` : event.kind === "heal" ? `+${event.amount}` : event.kind === "aim" ? "MIRA!" : event.kind === "feint" ? "FINTA!" : "DEFESA!"}
                  </span>
                ))}
                <span className="absolute bottom-2 left-3 z-20 rounded-full border border-white/10 bg-black/40 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-white/65">Inimigo</span>
              </div>
              <StatBar label="Pontos de Vida (PV)" value={res.monsterPv} max={res.monsterMaxPv} color="bg-blood" />
              <p className="text-xs text-muted-foreground">Turno {Math.max(1, res.turn - (done ? 1 : 0))}</p>
            </div>
          </div>

          {res.status === "active" ? (
            <div className="space-y-2">
              <div className="combat-actions-heading flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-display text-lg">Escolha sua ação</h3><p className="text-xs text-muted-foreground">Vigor gasto ao iniciar: 2 por combate.</p></div><span className="text-xs text-muted-foreground">{busy ? "Resolvendo turno…" : "Sua vez"}</span></div>
              <div className="combat-action-grid grid grid-cols-2 gap-2">
                {actions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button key={action.id} type="button" disabled={busy || !!action.disabled || done} onClick={() => act(action.id)} className="combat-action-card flex min-h-[82px] min-w-0 items-start gap-2.5 rounded-xl border bg-background p-2.5 text-left transition hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-[90px] sm:p-3">
                      <span className="combat-action-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className={`h-4 w-4 ${action.tone}`} /></span>
                      <span className="min-w-0 flex-1"><span className="combat-action-title block font-semibold">{action.title}</span><span className="combat-action-description mt-0.5 block text-xs leading-snug text-muted-foreground">{action.description}</span><span className="combat-action-cost mt-1 block text-[11px] font-medium text-gold">{action.cost}</span></span>
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
                        <button key={ability.id} type="button" disabled={busy || !available} onClick={() => act("spell", ability.id)} className="flex min-h-[82px] min-w-0 items-start gap-2.5 rounded-xl border border-mana/25 bg-mana/5 p-2.5 text-left transition hover:border-mana/50 hover:bg-mana/10 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-[90px] sm:p-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mana/10"><Sparkles className="h-4 w-4 text-mana" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2 font-semibold">{ability.name}<span className="text-xs font-normal text-mana">{ability.pmCost} PM</span></span>
                            <span className="mt-1 block text-xs text-muted-foreground">{ability.school} · {combatEffectLabel(ability.effect)} · Potência {ability.power}</span>
                            <span className="mt-1 block text-xs leading-snug text-muted-foreground">{ability.description}</span>
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

          <div className="space-y-2 rounded-xl border border-border bg-background/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base">Último turno</h3>
              <span className="text-[11px] font-semibold text-muted-foreground">Turno {latestTurn || 1}</span>
            </div>
            <div aria-live="polite" className="grid gap-1.5 text-sm sm:grid-cols-2">
              <p className="rounded-lg border border-blood/20 bg-blood/5 px-3 py-2"><strong className="text-blood">{res.monster}</strong> causou <strong>{heroDamageTaken}</strong> dano{heroDamageTaken === 1 ? "" : "s"}</p>
              <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2"><strong className="text-gold">{res.hero}</strong> causou <strong>{monsterDamageTaken}</strong> dano{monsterDamageTaken === 1 ? "" : "s"}</p>
            </div>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted/60 [&::-webkit-details-marker]:hidden">Ver registro completo <span className="transition-transform group-open:rotate-180">⌄</span></summary>
              <div className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1">
                {entries.length === 0 && <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">O combate começou. Escolha sua primeira ação.</p>}
                {entries.slice(-12).map((entry, index) => (
                  <div key={`${entry.turn ?? 0}-${index}`} className={`flex min-w-0 items-start gap-2 rounded-xl border p-2.5 ${entry.target === "monster" ? "border-primary/20 bg-primary/5" : "border-border bg-muted/30"}`}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background font-display text-xs">{entry.turn ?? "•"}</span>
                    <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{entry.who}{entry.action ? ` · ${entry.action}` : ""}</p><p className="text-xs text-muted-foreground">{entry.fa || entry.fd ? `FA ${entry.fa ?? 0} vs FD ${entry.fd ?? 0} · ${entry.dmg ?? 0} dano` : entry.effect === "heal" ? `Recuperou ${entry.amount ?? 0} PV` : entry.effect === "guard" ? `Proteção +${entry.amount ?? 0} na FD` : entry.effect === "weaken" ? `Ataque inimigo reduzido em ${entry.amount ?? 0}` : "Ação tática"}{entry.crit ? " · CRÍTICO!" : ""}</p><p className="mt-1 text-[11px] text-muted-foreground">PV restantes do alvo: {entry.hp ?? 0}</p></div>
                    {entry.crit && <span className="shrink-0 rounded-lg bg-amber-500/15 px-2 py-1 text-[11px] font-bold text-amber-500">CRÍTICO</span>}
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}

const puzzleCurseLines = [
  "O Oráculo marcou sua alma. A partir de hoje, até sua própria sombra desconfiará de você.",
  "Uma maldição antiga se prende ao seu nome. Os sussurros da cripta agora conhecem seu caminho.",
  "As runas se apagaram diante de você. Um presságio sombrio acompanhará seus próximos passos.",
  "O guardião tomou sua resposta como oferenda. Você deixa a câmara levando uma maldição.",
  "A névoa negra envolve seus pensamentos. O Oráculo condenou sua memória ao esquecimento.",
  "Um selo profano foi gravado em seu destino. A sorte se afastou por não ousar contrariar a maldição.",
  "O sino da derrota soou. Algo antigo despertou e agora caminha no rastro de sua alma.",
  "As páginas do arquivo se fecharam. Uma voz sem rosto declarou seu nome amaldiçoado.",
  "O símbolo da ruína brilhou sobre você. Nem mesmo as estrelas ousam desfazer esse presságio.",
  "A chama do conhecimento se extinguiu. Você foi lançado para fora sob o peso de uma praga arcana.",
  "O Oráculo recusou sua oferenda e cobrou um preço: uma maldição seguirá seus passos.",
  "A última runa se partiu. Seu fracasso foi selado nas pedras desta câmara."
];

function Puzzle({ onDone, buttonLabel }: { onDone: () => void; buttonLabel: string }) {
  const [p, setP] = useState<{ id: string; question: string } | null>(null);
  const [ans, setAns] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ correct: boolean; answer: string; reward: number; expired?: boolean } | null>(null);
  const [deadlineMs, setDeadlineMs] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(60);
  const [curseLine, setCurseLine] = useState("");
  const finalizing = useRef(false);

  const timeLabel = `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`;

  function showDefeat() {
    setCurseLine(puzzleCurseLines[Math.floor(Math.random() * puzzleCurseLines.length)]);
    setRemainingSeconds(0);
  }

  async function start() {
    setBusy(true);
    try {
      const next = await rpc("start_puzzle", {}) as {
        id: string;
        question: string;
        expiresAt?: string;
        serverNow?: string;
      };
      if (!next.expiresAt || !next.serverNow) {
        throw new Error("O prazo do Oráculo ainda não foi configurado no banco. Execute a migração SQL de 1 minuto.");
      }

      const remainingMs = Math.max(0, Date.parse(next.expiresAt) - Date.parse(next.serverNow));
      finalizing.current = false;
      setP({ id: next.id, question: next.question });
      setDeadlineMs(Date.now() + remainingMs);
      setRemainingSeconds(Math.max(0, Math.ceil(remainingMs / 1000)));
      setRes(null);
      setCurseLine("");
      setAns("");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível preparar um enigma.");
    } finally {
      setBusy(false);
    }
  }

  async function solve() {
    if (!p || !ans.trim() || busy || res || finalizing.current) return;
    if (deadlineMs !== null && Date.now() >= deadlineMs) {
      setRemainingSeconds(0);
      return;
    }

    finalizing.current = true;
    setBusy(true);
    try {
      const result = await rpc("solve_puzzle", { _id: p.id, _answer: ans.trim() }) as {
        correct: boolean;
        answer: string;
        reward: number;
        expired?: boolean;
      };
      setRes(result);
      if (!result.correct) showDefeat();
      onDone();
    } catch (error) {
      finalizing.current = false;
      toast.error(error instanceof Error ? error.message : "Não foi possível verificar sua resposta.");
    } finally {
      setBusy(false);
    }
  }

  // Countdown uses the server-issued duration, not a ten-minute display or a
  // client-only answer check. The database independently rejects late answers.
  useEffect(() => {
    if (!p || res || deadlineMs === null) return;

    const tick = () => {
      const ms = deadlineMs - Date.now();
      const seconds = Math.max(0, Math.ceil(ms / 1000));
      setRemainingSeconds((previous) => previous === seconds ? previous : seconds);

      if (ms > 0 || finalizing.current) return;
      finalizing.current = true;
      setBusy(true);

      void rpc("expire_puzzle", { _id: p.id })
        .then((value) => {
          const result = value as { expired: boolean; expiresAt?: string; serverNow?: string };
          if (result.expired) {
            setRes({ correct: false, answer: "", reward: 0, expired: true });
            showDefeat();
            onDone();
            return;
          }

          // The database may be a fraction of a second ahead of the UI timer.
          // Rebase the local countdown using the server's clock and expiry.
          if (result.expiresAt && result.serverNow) {
            const msRemaining = Math.max(0, Date.parse(result.expiresAt) - Date.parse(result.serverNow));
            setDeadlineMs(Date.now() + msRemaining);
            finalizing.current = false;
          }
        })
        .catch((error) => {
          finalizing.current = false;
          toast.error(error instanceof Error ? error.message : "Não foi possível registrar a derrota.");
        })
        .finally(() => setBusy(false));
    };

    tick();
    const timerId = window.setInterval(tick, 200);
    return () => window.clearInterval(timerId);
  }, [p?.id, res, deadlineMs, onDone]);

  const inProgress = !!p && !res;
  const timerProgress = Math.max(0, Math.min(100, (remainingSeconds / 60) * 100));

  return (
    <section className="puzzle-room">
      <header className="puzzle-hero">
        <div className="puzzle-hero-emblem"><Brain className="h-7 w-7" /></div>
        <div className="puzzle-hero-copy">
          <p className="puzzle-eyebrow"><Sparkles className="h-3 w-3" /> O arquivo arcano · Provas de raciocínio</p>
          <h2>O Oráculo dos Enigmas</h2>
          <p>Decifre a questão antes que o último grão de areia caia. Uma única tentativa separa a glória da maldição.</p>
        </div>
        <div className={"puzzle-time-seal" + (inProgress && remainingSeconds <= 15 ? " is-urgent" : "")} aria-label={`Tempo restante: ${p ? timeLabel : "um minuto"}`}>
          <span>{p ? timeLabel : "01:00"}</span><small>{inProgress ? "RESTANTE" : "LIMITE"}</small>
        </div>
      </header>

      <div className="puzzle-layout">
        <main className="puzzle-challenge-panel">
          <div className="puzzle-panel-heading">
            <div>
              <span className="puzzle-section-kicker">Câmara de dedução</span>
              <h3>{p ? "Um mistério aguarda solução" : "A próxima prova está selada"}</h3>
            </div>
            <span className={"puzzle-state-pill" + (res ? (res.correct ? " is-correct" : " is-wrong") : p ? " is-active" : "")}>
              {res ? (res.correct ? "Resolvido" : "Derrota") : p ? "Em andamento" : "Preparado"}
            </span>
          </div>

          {!p ? (
            <div className="puzzle-empty-state">
              <div className="puzzle-rune" aria-hidden="true">✧</div>
              <p className="puzzle-question-kicker">Um desafio. Sessenta segundos. Uma chance.</p>
              <h3>Abra o selo e receba seu enigma</h3>
              <p>Leia com atenção, encontre o padrão e responda antes que o tempo acabe. Falhar desperta a maldição do Oráculo.</p>
              <Button onClick={start} disabled={busy} className="puzzle-main-button">
                <BookOpen className="h-4 w-4" /> {busy ? "Preparando desafio…" : buttonLabel}
              </Button>
            </div>
          ) : (
            <div className="puzzle-question-wrap">
              <div className="puzzle-question-ornament" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span></div>
              <p className="puzzle-question-kicker">Enigma recebido · O tempo está correndo</p>
              <h3 className="puzzle-question-text">{p.question}</h3>
              {!res && (
                <div className={"puzzle-countdown" + (remainingSeconds <= 15 ? " is-urgent" : "")} aria-label={`${remainingSeconds} segundos restantes`}>
                  <div className="puzzle-countdown-fill" style={{ width: `${timerProgress}%` }} />
                </div>
              )}

              {!res ? (
                <form className="puzzle-answer-form" onSubmit={(event) => { event.preventDefault(); void solve(); }}>
                  <label className="puzzle-answer-label" htmlFor="puzzle-answer">Sua dedução</label>
                  <Input
                    id="puzzle-answer"
                    className="puzzle-answer-input"
                    value={ans}
                    onChange={(event) => setAns(event.target.value)}
                    placeholder="Escreva sua resposta…"
                    autoComplete="off"
                    disabled={busy || remainingSeconds <= 0}
                  />
                  <Button type="submit" disabled={busy || !ans.trim() || remainingSeconds <= 0} className="puzzle-main-button">
                    {busy ? "Consultando o oráculo…" : "Confirmar resposta"}
                    <Sparkles className="h-4 w-4" />
                  </Button>
                  <p className="puzzle-answer-footnote"><Lock className="h-3 w-3" /> Uma tentativa · {remainingSeconds} {remainingSeconds === 1 ? "segundo" : "segundos"} restantes.</p>
                </form>
              ) : res.correct ? (
                <div aria-live="polite" className="puzzle-result-panel is-correct">
                  <div className="puzzle-result-symbol"><CheckCircle2 className="h-6 w-6" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="puzzle-result-kicker">Prova superada</p>
                    <h4>Sabedoria conquistada!</h4>
                    <p>Sua recompensa foi registrada: +{res.reward.toLocaleString("pt-BR")} moedas.</p>
                  </div>
                  <div className="puzzle-reward"><Trophy className="h-4 w-4" /><strong>+{res.reward.toLocaleString("pt-BR")}</strong><small>moedas</small></div>
                  <Button onClick={start} disabled={busy} className="puzzle-main-button puzzle-next-button">
                    {busy ? "Abrindo…" : "Novo enigma"} <Sparkles className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div aria-live="polite" className="puzzle-defeat-panel">
                  <div className="puzzle-defeat-skull"><Skull className="h-12 w-12 sm:h-16 sm:w-16" strokeWidth={1.7} /></div>
                  <div className="puzzle-defeat-copy">
                    <p className="puzzle-result-kicker">O selo se partiu</p>
                    <h4>DERROTA</h4>
                    <p>{curseLine}</p>
                    {res.expired ? (
                      <small>O último segundo escapou. O Oráculo encerrou sua prova.</small>
                    ) : (
                      <small>Resposta correta: {res.answer}</small>
                    )}
                  </div>
                  <Button onClick={start} disabled={busy} className="puzzle-main-button puzzle-next-button">
                    {busy ? "Abrindo…" : "Tentar outro enigma"} <Sparkles className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </main>

        <aside className="puzzle-sidebar">
          <div className="puzzle-rules-card">
            <p className="puzzle-section-kicker">Regras da prova</p>
            <h3>Raciocínio acima da sorte.</h3>
            <div className="puzzle-rule-row">
              <span className="puzzle-rule-icon">⌛</span>
              <div><strong>60 segundos</strong><small>O prazo é contado pelo relógio do servidor</small></div>
            </div>
            <div className="puzzle-rule-row">
              <span className="puzzle-rule-icon">◆</span>
              <div><strong>Uma tentativa</strong><small>Resposta errada encerra a prova</small></div>
            </div>
            <div className="puzzle-rule-row">
              <span className="puzzle-rule-icon">✦</span>
              <div><strong>Vitória recompensa</strong><small>O prêmio depende do enigma recebido</small></div>
            </div>
          </div>
          <div className="puzzle-motto-card">
            <Sparkles className="h-4 w-4" />
            <p>“O tempo não teme os sábios. O Oráculo, porém, não perdoa os distraídos.”</p>
            <span>— Inscrição na porta do Oráculo</span>
          </div>
        </aside>
      </div>
    </section>
  );
}



type TwentyOneState = {
  id: string;
  status: "active" | "won" | "lost" | "push";
  wager: number;
  payout: number;
  net: number;
  profit: number;
  playerCards: string[];
  dealerCards: string[];
  playerTotal: number;
  playerSoft: boolean;
  dealerTotal: number;
  dealerSoft: boolean;
  deckRemaining: number;
  dealerRule: string;
};

const twentyOneMoney = new Intl.NumberFormat("pt-BR");
const suitSymbol: Record<TwentyOneSuit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const suitName: Record<TwentyOneSuit, string> = { S: "espadas", H: "copas", D: "ouros", C: "paus" };

function PlayingCard({ card, index }: { card: string; index: number }) {
  if (card === "BACK") {
    return (
      <div className="twentyone-card is-back" style={{ animationDelay: String(index * 65) + "ms" }} aria-label="Carta fechada">
        <span className="twentyone-card-back-pattern"><b>21</b><i>✦</i></span>
      </div>
    );
  }
  const rank = cardRank(card);
  const suit = cardSuit(card);
  const red = suit === "H" || suit === "D";
  const symbol = suitSymbol[suit];
  return (
    <div className={"twentyone-card " + (red ? "is-red" : "is-black")} style={{ animationDelay: String(index * 65) + "ms" }} aria-label={rank + " de " + suitName[suit]}>
      <span className="twentyone-card-corner is-top"><b>{rank}</b><i>{symbol}</i></span>
      <span className="twentyone-card-center">{symbol}</span>
      <span className="twentyone-card-corner is-bottom"><b>{rank}</b><i>{symbol}</i></span>
    </div>
  );
}

function TwentyOne({ onDone, coins, vigor }: { onDone: () => void; coins: number; vigor: number }) {
  const [open, setOpen] = useState(false);
  const [game, setGame] = useState<TwentyOneState | null>(null);
  const [wager, setWager] = useState(10);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const maxWager = maxTwentyOneWager(coins);
  const vigorCost = wager > 0 ? 3 : 1;
  const wagerOptions = [...new Set([10, 25, 50, maxWager].filter((value) => value > 0 && value <= maxWager))];
  const active = game?.status === "active";
  const finished = !!game && game.status !== "active";

  useEffect(() => {
    setWager((current) => Math.min(current, maxWager));
  }, [maxWager]);

  async function openTable() {
    setOpen(true);
    setLoading(true);
    setGame(null);
    try {
      const current = await rpc("get_active_twentyone_game", {});
      if (current) setGame(current as TwentyOneState);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível consultar a partida.");
    } finally {
      setLoading(false);
    }
  }

  async function startRound() {
    if (busy || vigor < vigorCost || wager > maxWager) return;
    setBusy(true);
    try {
      const next = await rpc("start_twentyone_game", { _wager: wager }) as TwentyOneState;
      setGame(next);
      onDone();
      if (next.status === "active") toast.success("A mesa está aberta. Boa sorte!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a partida.");
    } finally {
      setBusy(false);
    }
  }

  async function play(action: "hit" | "stand") {
    if (!game || game.status !== "active" || busy) return;
    setBusy(true);
    try {
      const next = await rpc(action === "hit" ? "twentyone_hit" : "twentyone_stand", { _game_id: game.id }) as TwentyOneState;
      setGame(next);
      if (next.status !== "active") {
        onDone();
        if (next.status === "won") toast.success("Você venceu a casa!");
        else if (next.status === "push") toast.info("Empate! Sua aposta foi devolvida.");
        else toast.error("A casa venceu desta vez.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a jogada.");
    } finally {
      setBusy(false);
    }
  }

  function closeTable() {
    if (active) return;
    setOpen(false);
    setGame(null);
  }

  const dealerResult = game?.dealerTotal === 21 ? "21" : String(game?.dealerTotal ?? "—");
  const playerResult = String(game?.playerTotal ?? "—");
  const resultTitle = game?.status === "won" ? "Você venceu!" : game?.status === "lost" ? "A casa venceu" : "Empate perfeito";
  const suitCards = (cards: string[]) => cards.map((card, index) => <PlayingCard key={String(index) + "-" + card} card={card} index={index} />);

  return (
    <>
      <section className="twentyone-launch-card">
        <div className="twentyone-launch-art" aria-hidden="true">
          <div className="twentyone-mini-card one"><span>A</span><b>♠</b></div>
          <div className="twentyone-mini-card two"><span>K</span><b>♥</b></div>
          <div className="twentyone-mini-chip">21</div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="twentyone-eyebrow"><Sparkle className="h-3.5 w-3.5" /> Salão das cartas</p>
          <h2 className="mt-1 font-display text-xl text-gold sm:text-2xl">21 · Desafio contra a casa</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Um baralho, duas mãos e uma decisão: pedir outra carta ou parar antes de passar de 21. A casa joga com estratégia firme.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="twentyone-feature-pill"><Spade className="h-3 w-3" /> Cartas desenhadas por código</span>
            <span className="twentyone-feature-pill"><Shield className="h-3 w-3" /> Baralho e prêmio no servidor</span>
            <span className="twentyone-feature-pill"><Coins className="h-3 w-3" /> Vitória paga 2× a aposta</span>
          </div>
        </div>
        <Button onClick={() => void openTable()} className="h-11 shrink-0 px-5 font-display"><Spade className="h-4 w-4" /> Entrar na mesa</Button>
      </section>

      {open && (
        <div className="twentyone-overlay" role="presentation">
          <section className="twentyone-window" role="dialog" aria-modal="true" aria-labelledby="twentyone-window-title">
            <header className="twentyone-window-header">
              <div className="flex min-w-0 items-center gap-3">
                <span className="twentyone-brand-mark"><Spade className="h-5 w-5" /><small>21</small></span>
                <div className="min-w-0">
                  <p className="twentyone-eyebrow">Mesa de cartas · Taverna</p>
                  <h2 id="twentyone-window-title" className="truncate font-display text-lg text-amber-50 sm:text-xl">Vinte e Um</h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="twentyone-wallet"><Coins className="h-3.5 w-3.5" /> {twentyOneMoney.format(coins)}</span>
                {(!active || finished) && <button type="button" className="twentyone-close" aria-label="Fechar mesa de 21" onClick={closeTable}><X className="h-5 w-5" /></button>}
              </div>
            </header>

            <div className="twentyone-window-body">
              {loading ? (
                <div className="twentyone-loading"><span className="twentyone-spinner" /><p>Preparando o baralho…</p></div>
              ) : !game ? (
                <div className="twentyone-lobby">
                  <div className="twentyone-lobby-illustration">
                    <div className="twentyone-lobby-card card-a"><span>A</span><b>♠</b></div>
                    <div className="twentyone-lobby-card card-k"><span>K</span><b>♥</b></div>
                    <div className="twentyone-lobby-glow">21</div>
                  </div>
                  <div className="twentyone-lobby-copy">
                    <p className="twentyone-eyebrow"><Sparkle className="h-3.5 w-3.5" /> A casa está pronta</p>
                    <h3 className="font-display text-2xl text-amber-50 sm:text-3xl">Faça sua aposta.</h3>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-amber-100/65">Receba duas cartas e tente chegar mais perto de 21 que o taverneiro. Cada carta vale seu número; J, Q e K valem 10; o Ás vale 1 ou 11.</p>
                  </div>
                  <div className="twentyone-bet-panel">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor="twentyone-wager" className="text-sm font-semibold text-amber-50">Sua aposta</label>
                      <span className="text-xs text-amber-100/60">Saldo: {twentyOneMoney.format(coins)} moedas · Máximo: {twentyOneMoney.format(maxWager)}</span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Input id="twentyone-wager" aria-label="Aposta em moedas para o jogo 21" type="number" inputMode="numeric" min={0} max={maxWager} value={wager} disabled={busy} onChange={(event) => setWager(Math.max(0, Math.min(maxWager, Math.floor(Number(event.target.value) || 0))))} className="h-11 border-amber-100/20 bg-black/25 text-lg font-semibold tabular-nums text-amber-50" />
                      <div className="flex flex-wrap gap-1.5">
                        <Button type="button" size="sm" variant={wager === 0 ? "default" : "outline"} onClick={() => setWager(0)} disabled={busy} className="h-11">Sem aposta</Button>
                        {wagerOptions.map((value) => <Button key={value} type="button" size="sm" variant={wager === value ? "default" : "outline"} onClick={() => setWager(value)} disabled={busy} className="h-11">{twentyOneMoney.format(value)}</Button>)}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="twentyone-payout-note"><span>Se vencer</span><b>2× aposta</b><small>10 moedas → 20 creditadas</small></div>
                      <div className="twentyone-payout-note"><span>Se empatar</span><b>Devolução</b><small>Você recebe sua aposta de volta</small></div>
                      <div className="twentyone-payout-note"><span>Se perder</span><b>Sem prêmio</b><small>O valor reservado é perdido</small></div>
                    </div>
                    <p className="mt-2 text-[11px] text-amber-100/50">A aposta é debitada ao iniciar. Limite: metade do saldo. Custo de vigor: {vigorCost} {vigorCost === 1 ? "ponto" : "pontos"}{wager > 0 ? " com aposta" : " sem aposta"}.</p>
                    <Button onClick={() => void startRound()} disabled={busy || vigor < vigorCost || wager > maxWager} className="mt-3 h-12 w-full border border-amber-100/20 bg-amber-300 font-display text-base text-amber-950 shadow-lg hover:bg-amber-200">
                      {busy ? "Embaralhando…" : vigor < vigorCost ? "Vigor insuficiente" : "Distribuir cartas"}
                    </Button>
                    {vigor < vigorCost && <p className="mt-2 text-center text-xs text-rose-200">Você precisa de {vigorCost} de vigor para esta partida.</p>}
                  </div>
                  <details className="twentyone-rules">
                    <summary><BookOpen className="h-4 w-4" /> Regras do 21 <span>+</span></summary>
                    <div className="twentyone-rules-content">
                      <p><b>Objetivo:</b> terminar com uma mão maior que a da casa, sem ultrapassar 21.</p>
                      <p><b>Cartas:</b> 2–10 valem o número; J, Q e K valem 10; Ás vale 1 ou 11, conforme o melhor total possível.</p>
                      <p><b>Sua vez:</b> peça carta quantas vezes quiser ou pare para revelar a mão da casa. Acima de 21 é estouro e derrota imediata.</p>
                      <p><b>Casa:</b> compra abaixo de 17 e também compra em 17 suave (um Ás contando como 11). Para em 17 duro ou mais.</p>
                      <p><b>Pagamento:</b> vitória credita 2 vezes a aposta; empate devolve 1 vez; derrota não devolve. Um 21 natural de duas cartas também paga 2 vezes.</p>
                    </div>
                  </details>
                </div>
              ) : (
                <div className="twentyone-game">
                  <div className="twentyone-table-status">
                    <span className="twentyone-status-dot" />
                    {active ? "Partida em andamento" : "Partida encerrada"}
                    <span className="ml-auto text-xs text-amber-100/55">Baralho: {game.deckRemaining} cartas</span>
                  </div>

                  <div className="twentyone-felt">
                    <section className="twentyone-hand dealer">
                      <div className="twentyone-hand-heading">
                        <div><p className="twentyone-hand-label">A casa</p><h3>O Taverneiro</h3></div>
                        <span className="twentyone-total-pill">{active ? "Carta aberta: " : "Total: "}{dealerResult}</span>
                      </div>
                      <div className="twentyone-cards">{suitCards(game.dealerCards)}</div>
                      {active && <p className="twentyone-hand-hint">A segunda carta permanece oculta até você parar.</p>}
                      {!active && <p className="twentyone-hand-hint">A casa revelou todas as cartas.</p>}
                    </section>
                    <div className="twentyone-table-divider"><span>VERSUS</span><i>✦</i></div>
                    <section className="twentyone-hand player">
                      <div className="twentyone-hand-heading">
                        <div><p className="twentyone-hand-label">Sua mão</p><h3>Aventureiro</h3></div>
                        <span className={"twentyone-total-pill " + (game.playerTotal > 21 ? "is-bust" : game.playerTotal === 21 ? "is-perfect" : "")}>{playerResult}{game.playerSoft ? " · suave" : ""}</span>
                      </div>
                      <div className="twentyone-cards">{suitCards(game.playerCards)}</div>
                      <p className="twentyone-hand-hint">{game.playerTotal > 21 ? "Estourou! Passou de 21." : game.playerTotal === 21 ? "21! Pare para revelar a mão da casa." : "Escolha com cuidado: cada carta muda seu total."}</p>
                    </section>
                  </div>

                  {active ? (
                    <div className="twentyone-controls">
                      <div className="twentyone-turn-copy"><Sparkles className="h-4 w-4" /><span>{game.playerTotal >= 21 ? "Você chegou a 21. Agora é hora de parar." : "Sua vez: peça uma carta ou mantenha sua mão."}</span></div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button size="lg" disabled={busy || game.playerTotal >= 21} onClick={() => void play("hit")} className="h-12 bg-amber-300 font-display text-amber-950 hover:bg-amber-200"><Plus className="h-4 w-4" /> {busy ? "Distribuindo…" : "Pedir carta"}</Button>
                        <Button size="lg" variant="outline" disabled={busy} onClick={() => void play("stand")} className="h-12 border-amber-100/30 bg-black/15 font-display text-amber-50 hover:bg-white/10"><Shield className="h-4 w-4" /> {busy ? "A casa está jogando…" : "Parar e revelar"}</Button>
                      </div>
                      <p className="text-center text-[11px] text-amber-100/45">A IA da casa compra em 17 suave. As cartas e a liquidação são processadas no servidor.</p>
                    </div>
                  ) : (
                    <div className={"twentyone-result-banner " + (game.status === "won" ? "is-win" : game.status === "push" ? "is-push" : "is-loss")}>
                      <div className="twentyone-result-icon">{game.status === "won" ? <Trophy className="h-7 w-7" /> : game.status === "push" ? <CheckCircle2 className="h-7 w-7" /> : <Shield className="h-7 w-7" />}</div>
                      <div className="min-w-0 flex-1">
                        <p className="twentyone-result-eyebrow">Fim da partida</p>
                        <h3 className="font-display text-2xl">{resultTitle}</h3>
                        <p className="mt-1 text-xs opacity-75">{game.status === "won" ? "Sua mão superou a casa. O prêmio já foi creditado." : game.status === "push" ? "As mãos empataram. Sua aposta foi devolvida." : "A casa levou esta rodada. A aposta foi perdida."}</p>
                      </div>
                      <div className="twentyone-result-payout">
                        <small>{game.status === "lost" ? "Prêmio" : "Crédito"}</small>
                        <b>{twentyOneMoney.format(game.payout)}</b>
                        <small>moedas</small>
                      </div>
                      <p className="twentyone-result-net">Aposta: {twentyOneMoney.format(game.wager)} · Resultado líquido: <b>{game.net > 0 ? "+" : ""}{twentyOneMoney.format(game.net)} moedas</b></p>
                      <div className="twentyone-result-actions">
                        <Button onClick={() => setGame(null)} className="h-10 bg-amber-300 font-display text-amber-950 hover:bg-amber-200"><RotateCcw className="h-4 w-4" /> Nova mão</Button>
                        <Button variant="outline" onClick={closeTable} className="h-10 border-white/20 bg-black/15 text-amber-50 hover:bg-white/10"><X className="h-4 w-4" /> Fechar mesa</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <footer className="twentyone-window-footer">
              <span><Lock className="h-3 w-3" /> Baralho embaralhado e prêmio calculado no servidor</span>
              {active ? <span>Finalize a mão para liberar o fechamento.</span> : <span>Vitória: prêmio bruto de 2× a aposta.</span>}
            </footer>
          </section>
        </div>
      )}
    </>
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
    <details open={!compact} className="farkle-score-guide group overflow-hidden rounded-2xl border border-amber-300/40 bg-card text-card-foreground shadow-[0_12px_30px_rgba(0,0,0,.16)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 transition-colors hover:bg-amber-100/[0.04] [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/20 bg-amber-300/10 text-gold"><BookOpen className="h-5 w-5" /></span>
          <span className="min-w-0"><span className="block font-display text-lg text-foreground">Guia de pontuação</span><span className="mt-0.5 block text-xs text-muted-foreground">Consulte todas as combinações válidas e seus valores.</span></span>
        </span>
        <span className="shrink-0 rounded-full border border-amber-200/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200 group-open:bg-amber-200/10">Tabela <span className="ml-1 inline-block transition-transform group-open:rotate-180">⌄</span></span>
      </summary>
      <div className="space-y-4 border-t border-border p-3 sm:p-4">
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-0 border-collapse text-center text-[10px] sm:text-sm">
            <thead className="bg-muted text-foreground">
              <tr><th scope="col" className="px-1.5 py-2 text-left font-semibold sm:px-3 sm:py-3">Combinação</th>{["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"].map((face) => <th key={face} scope="col" className="px-1 py-2 text-base sm:px-2 sm:py-3 sm:text-lg">{face}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground">
              <tr className="bg-muted/70"><th scope="row" className="px-3 py-3 text-left font-semibold text-foreground">Dado isolado</th><td colSpan={6} className="px-1.5 py-2 text-left leading-snug sm:px-3 sm:py-3">⚀ 100 pts <span className="mx-2 text-muted-foreground/60">•</span> ⚄ 50 pts <span className="ml-2 text-muted-foreground">(2, 3, 4 e 6 não pontuam sozinhos)</span></td></tr>
              {groupRows.map((row) => <tr key={row.label} className="transition-colors hover:bg-amber-100/[0.04]"><th scope="row" className="whitespace-nowrap px-1.5 py-2 text-left font-semibold text-foreground sm:px-3 sm:py-3">{row.label}</th>{row.values.map((value, index) => <td key={index} className="px-1 py-2 tabular-nums sm:px-2 sm:py-3">{value}</td>)}</tr>)}
              <tr className="bg-amber-300/[0.06]"><th scope="row" className="px-3 py-3 text-left font-semibold text-foreground">Sequências</th><td colSpan={6} className="px-3 py-3 text-left leading-relaxed">1–2–3–4–5 <strong className="text-amber-200">500 pts</strong><span className="mx-2 text-muted-foreground/50">•</span> 2–3–4–5–6 <strong className="text-amber-200">750 pts</strong><br />1–2–3–4–5–6 <strong className="text-amber-200">1.500 pts</strong></td></tr>
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <p className="rounded-xl border border-amber-100/10 bg-black/20 p-3 text-[11px] leading-relaxed text-muted-foreground"><strong className="text-amber-200">Regra dos iguais:</strong> cada dado adicional igual dobra o valor da trinca. Ex.: três 4 valem 400; quatro 4 valem 800.</p>
          <p className="rounded-xl border border-amber-100/10 bg-black/20 p-3 text-[11px] leading-relaxed text-amber-100/65"><strong className="text-amber-200">Atenção:</strong> padrões independentes do mesmo lançamento somam (⚀ + ⚄ = 150 pts). Pares e três pares não pontuam; dados escolhidos precisam pontuar juntos no lançamento atual.</p>
        </div>
      </div>
    </details>
  );
}

function FarkleGame({ onDone, onClose, vigor, coins }: { onDone: () => void; onClose: () => void; vigor: number; coins: number }) {
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
  const vigorCost = wager > 0 ? 3 : 1;
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
          : "Partida iniciada sem aposta. 1 de vigor gasto.",
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
    <section className="farkle-hud relative isolate overflow-hidden rounded-[1.75rem] border border-border bg-card p-3 text-card-foreground shadow-[0_28px_80px_rgba(0,0,0,.12)] sm:p-6">
      <style>{`
        /* The dice HUD follows the active global theme/palette instead of a fixed tavern skin. */
        .farkle-hud { background: var(--card) !important; color: var(--foreground) !important; border-color: var(--border) !important; }
        .farkle-hud [class*="text-amber-"] { color: var(--muted-foreground) !important; }
        .farkle-hud [class*="text-amber-100"] { color: var(--foreground) !important; }
        .farkle-hud [class*="text-amber-200"],
        .farkle-hud [class*="text-amber-300"] { color: var(--primary) !important; }
        .farkle-hud [class*="border-amber-"] { border-color: var(--border) !important; }
        /* Transparent amber surfaces must stay tinted, not become solid primary-colored. */
        .farkle-hud [class*="bg-amber-"][class*="/"] {
          background-color: color-mix(in oklab, var(--primary) 12%, var(--card)) !important;
          color: var(--primary) !important;
        }
        .farkle-hud [class~="bg-amber-300"],
        .farkle-hud [class~="bg-amber-400"],
        .farkle-hud [class~="bg-amber-500"] {
          background-color: var(--primary) !important;
          color: var(--primary-foreground) !important;
        }
        .farkle-hud [class*="text-amber-950"] { color: var(--primary-foreground) !important; }
        .farkle-hud [class*="bg-[#"],
        .farkle-hud [class*="bg-[linear-gradient"],
        .farkle-hud [class*="bg-[radial-gradient"] {
          background: color-mix(in oklab, var(--card) 92%, var(--primary) 8%) !important;
          background-image: none !important;
        }
        .farkle-hud [class*="from-amber-"],
        .farkle-hud [class*="from-emerald-"] {
          --tw-gradient-from: color-mix(in oklab, var(--primary) 18%, var(--card)) !important;
        }
        .farkle-hud [class*="to-amber-"],
        .farkle-hud [class*="to-emerald-"] {
          --tw-gradient-to: color-mix(in oklab, var(--primary) 4%, var(--card)) !important;
        }
        .farkle-hud .farkle-theme-panel { background: color-mix(in oklab, var(--card) 88%, var(--primary) 12%) !important; }
        .farkle-hud [class*="text-emerald-"] { color: var(--primary) !important; }
        .farkle-hud [class*="text-rose-"] { color: var(--destructive) !important; }
        .farkle-hud [class*="border-emerald-"],
        .farkle-hud [class*="border-rose-"] { border-color: color-mix(in oklab, var(--primary) 30%, var(--border)) !important; }
        .farkle-hud [class*="bg-emerald-"],
        .farkle-hud [class*="bg-rose-"] { background-color: color-mix(in oklab, var(--card) 88%, var(--primary) 12%) !important; }
        .farkle-hud [class*="from-emerald-"],
        .farkle-hud [class*="from-amber-"] {
          --tw-gradient-from: color-mix(in oklab, var(--primary) 18%, var(--card)) !important;
        }
        .farkle-hud [class*="to-emerald-"],
        .farkle-hud [class*="to-amber-"] {
          --tw-gradient-to: color-mix(in oklab, var(--primary) 4%, var(--card)) !important;
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0" style={{ background: "var(--ambient-glow)" }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "repeating-linear-gradient(4deg,transparent 0px,transparent 9px,color-mix(in oklab,var(--primary) 10%,transparent) 10px,color-mix(in oklab,var(--primary) 10%,transparent) 11px,transparent 14px)" }} />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
      <div className="relative space-y-5 sm:space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-100/15 bg-[#2a1b14]/75 p-4 shadow-[0_12px_32px_rgba(0,0,0,.18)] backdrop-blur-sm sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200/25 bg-gradient-to-br from-amber-200/20 to-amber-500/5 text-3xl text-amber-200 shadow-inner">⚄</div>
            <div className="min-w-0"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-200/70"><Sparkles className="h-3.5 w-3.5" /> FARKLE • disputa contra a máquina</p><h2 className="mt-1 font-display text-2xl text-amber-100 sm:text-3xl">Farkle</h2><p className="mt-1 text-xs text-amber-100/60">Acumule pontos, administre o risco e alcance 4.000 primeiro.</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-amber-200/20 bg-black/25 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-300/10 text-amber-300"><Flame className="h-5 w-5" /></span>
            <div><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-100/55">Entrada por partida</p><p className="font-display text-xl leading-tight text-amber-200">{wager > 0 ? "3 vigor" : "1 vigor"}</p><p className="text-[10px] text-amber-100/55">{activeGameId ? `Aposta: ${activeWager.toLocaleString("pt-BR")} moedas` : "Aposta opcional"}</p></div>
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
              <p className="text-[10px] leading-relaxed text-amber-100/35">Os dados e a estratégia da partida rodam nesta mesa; a reserva e a liquidação da aposta são registradas no servidor.</p>
            </div>
            <p className="mt-2 text-xs text-amber-200/80">Com o vigor atual, você tem {Math.floor(vigor / vigorCost)} partida(s) disponível(is) hoje.</p>
            <p className="text-xs text-amber-100/55">Você precisa selecionar ao menos uma combinação válida por lançamento. Dados guardados não voltam a rolar no mesmo turno. Um Farkle perde todos os pontos ainda não guardados. Ao usar os seis dados, você pode rolar os seis novamente.</p>
            <Button onClick={() => void startGame()} disabled={busy || vigor < vigorCost || wager > maxWager} className="min-h-12 border border-amber-100/20 bg-amber-300 px-8 font-display text-amber-950 shadow-lg hover:bg-amber-200">{busy ? "Preparando a mesa…" : vigor < vigorCost ? `Vigor insuficiente · precisa ${vigorCost}` : wager > 0 ? `Jogar com aposta de ${wager.toLocaleString("pt-BR")} · 3 vigor` : "Jogar sem aposta · 1 vigor"}</Button>
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

        {gameOver && <div className="absolute inset-0 z-10 grid place-items-center rounded-[1.5rem] bg-black/80 p-4 backdrop-blur-md"><div className="relative w-full max-w-md space-y-4 rounded-3xl border border-amber-200/30 bg-[linear-gradient(145deg,#59402b,#2a1d15)] p-6 pt-12 text-center shadow-[0_24px_80px_rgba(0,0,0,.5)]">{settlement && !settlementBusy && !settlementError && <button type="button" aria-label="Fechar jogo Farkle" onClick={onClose} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl border border-amber-100/20 bg-black/20 text-amber-100 transition hover:bg-black/40"><X className="h-5 w-5" /></button>}<Trophy className="mx-auto h-12 w-12 text-amber-300" /><p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-200/70">Fim da partida</p><h3 className="font-display text-3xl text-amber-100">{playerWon ? "Você venceu!" : "A máquina venceu"}</h3><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-amber-100/60">Você</p><p className="font-display text-2xl text-amber-100">{playerTotal.toLocaleString("pt-BR")}</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-amber-100/60">Máquina</p><p className="font-display text-2xl text-amber-100">{machineTotal.toLocaleString("pt-BR")}</p></div></div>
          {settlementBusy && <p aria-live="polite" className="rounded-xl border border-amber-200/20 bg-black/25 p-3 text-sm text-amber-100/75">Conferindo o resultado e atualizando sua carteira…</p>}
          {settlementError && <div className="space-y-2 rounded-xl border border-rose-200/25 bg-rose-950/30 p-3 text-sm text-rose-100"><p>Não foi possível confirmar a aposta. Tente novamente para concluir a liquidação.</p><Button type="button" variant="outline" className="w-full border-rose-100/30 bg-transparent text-rose-50 hover:bg-rose-100/10" onClick={() => { settlementRequested.current = false; setSettlementError(false); setSettlementRetry((value) => value + 1); }}>Tentar novamente</Button></div>}
          {settlement && settlement.wager > 0 && <div className={`rounded-xl border p-3 text-sm ${playerWon ? "border-emerald-200/20 bg-emerald-950/30 text-emerald-100" : "border-rose-200/20 bg-rose-950/30 text-rose-100"}`}><p className="font-semibold">{playerWon ? "Aposta vencedora!" : "Aposta perdida"}</p><p className="mt-1 text-xs leading-relaxed">{playerWon ? `Sua aposta de ${settlement.wager.toLocaleString("pt-BR")} moedas foi devolvida, com ${settlement.profit.toLocaleString("pt-BR")} moedas de lucro. Crédito total: ${settlement.payout.toLocaleString("pt-BR")} moedas.` : `Você perdeu as ${settlement.wager.toLocaleString("pt-BR")} moedas apostadas.`}</p></div>}
          {settlement && settlement.wager === 0 && <p className="rounded-xl border border-amber-100/10 bg-black/20 p-3 text-xs text-amber-100/60">Partida sem aposta. Nenhuma moeda foi debitada ou creditada.</p>}
          <Button disabled={settlementBusy || settlementError || !settlement} onClick={() => { setPhase("intro"); setStatus("Uma nova partida custa 1 de vigor sem aposta ou 3 com aposta."); setWager(0); setActiveWager(0); setActiveGameId(null); setSettlement(null); setSettlementError(false); settlementRequested.current = false; }} className="w-full border border-amber-100/20 bg-amber-300 font-display text-amber-950 hover:bg-amber-200"><RotateCcw className="h-4 w-4" />Nova partida · 3 vigor</Button></div></div>}
      </div>
    </section>
  );
}

function Farkle({ onDone, vigor, coins }: { onDone: () => void; vigor: number; coins: number }) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  return (
    <>
      <section className="farkle-launch-card">
        <div className="farkle-launch-dice" aria-hidden="true">
          <span>⚄</span><span>⚂</span><span>⚀</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="farkle-launch-eyebrow"><Trophy className="h-3.5 w-3.5" /> Desafio da taverna</p>
          <h2 className="mt-1 font-display text-xl text-gold sm:text-2xl">Farkle · Jogo de Dados</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Enfrente a máquina, combine dados, calcule riscos e alcance 4.000 pontos antes dela. A sorte ajuda — mas estratégia decide.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="farkle-feature-pill"><Sparkles className="h-3 w-3" /> IA estratégica</span>
            <span className="farkle-feature-pill"><Coins className="h-3 w-3" /> Aposta opcional</span>
            <span className="farkle-feature-pill"><Shield className="h-3 w-3" /> Regras clássicas da mesa</span>
          </div>
        </div>
        <Button onClick={() => { setHasOpened(true); setOpen(true); }} className="h-11 shrink-0 px-5 font-display"><Trophy className="h-4 w-4" /> Abrir mesa</Button>
      </section>

      {hasOpened && (
        <div className="farkle-overlay" hidden={!open} aria-hidden={!open}>
          <section className="farkle-window" role="dialog" aria-modal="true" aria-labelledby="farkle-window-title">
            <header className="farkle-window-header">
              <div className="flex min-w-0 items-center gap-3">
                <span className="farkle-brand-mark">⚄</span>
                <div className="min-w-0">
                  <p className="farkle-launch-eyebrow">Salão dos dados · Mesa da taverna</p>
                  <h2 id="farkle-window-title" className="truncate font-display text-lg text-amber-50 sm:text-xl">Farkle</h2>
                </div>
              </div>
              <div className="farkle-window-header-actions">
                <span className="farkle-window-balance"><Coins className="h-3.5 w-3.5" /> {coins.toLocaleString("pt-BR")} moedas</span>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="farkle-back-button h-9 shrink-0 px-3" aria-label="Voltar para a seleção de jogos"><ArrowLeft className="h-4 w-4" /><span>Voltar</span></Button>
              </div>
            </header>
            <FarkleGame onDone={onDone} onClose={() => setOpen(false)} vigor={vigor} coins={coins} />
          </section>
        </div>
      )}
    </>
  );
}
