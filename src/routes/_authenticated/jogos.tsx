import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { rpc, useRefresh, useMe } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Swords, Spade, Brain, Trophy, RotateCcw, Shield, BookOpen, Flame, Sparkles, Coins, Wind, X, CheckCircle2, Sparkle, Plus, Lock } from "lucide-react";
import { useCustomization } from "@/lib/app-customization";
import { supabase } from "@/integrations/supabase/client";
import { VigorRestore, useGameSettings } from "@/components/VigorRestore";
import { combatEffectLabel, isCombatAbilityAvailable, isCombatActionAvailable } from "@/lib/combat";
import { getMonsterArtwork } from "@/lib/monster-art";
import type { CombatAction, CombatLogEntry, CombatState } from "@/lib/combat";
import { maxTwentyOneWager, cardRank, cardSuit, type TwentyOneSuit } from "@/lib/twentyone";
import { toast } from "sonner";

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
      <p className="text-sm text-muted-foreground">Combate tático, 21 com cartas e enigmas para desafiar sua sorte e estratégia.</p>
      <VigorRestore vigor={vigor} />
      <Tabs defaultValue="combat">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1.5 rounded-xl border border-border bg-muted/70 p-1.5">
          <TabsTrigger value="combat" className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:text-sm"><Swords className="h-4 w-4" />{text("jogos_combat")}</TabsTrigger>
          <TabsTrigger value="twentyone" className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:text-sm"><Spade className="h-4 w-4" />21</TabsTrigger>
          <TabsTrigger value="puzzle" className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:text-sm"><Brain className="h-4 w-4" />{text("jogos_puzzle")}</TabsTrigger>
        </TabsList>
        <TabsContent value="combat"><Combat onDone={after} hasActive={!!me?.profile?.active_character_id} buttonLabel={text("jogos_fight")} /></TabsContent>
        <TabsContent value="twentyone"><TwentyOne onDone={after} coins={Number(me?.profile?.coins ?? 0)} vigor={Number(vigor ?? 0)} /></TabsContent>
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
    <div className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
      <style>{`
        @keyframes jrpg-hit-panel { 0%,100% { transform: translateX(0); box-shadow: inset 0 0 0 rgba(255,70,80,0); } 20%,55% { transform: translateX(-3px); box-shadow: inset 0 0 28px rgba(255,65,80,.2); border-color: rgba(255,75,85,.65); } 35% { transform: translateX(3px); } }
        @keyframes jrpg-heal-panel { 0%,100% { box-shadow: inset 0 0 0 rgba(74,222,128,0); } 35%,75% { box-shadow: inset 0 0 35px rgba(74,222,128,.2); border-color: rgba(74,222,128,.7); } }
        @keyframes jrpg-magic { 0%,100% { filter: drop-shadow(0 0 0 rgba(130,100,255,0)); transform: scale(1); } 35% { filter: drop-shadow(0 0 25px rgba(155,125,255,.95)) brightness(1.3); transform: scale(1.035); } }
        @keyframes jrpg-burst { 0% { opacity: 0; transform: translate(-50%,-50%) scale(.2); } 35% { opacity: 1; transform: translate(-50%,-50%) scale(1.1); } 100% { opacity: 0; transform: translate(-50%,-50%) scale(1.5); } }
        .jrpg-hit-panel { animation: jrpg-hit-panel .48s ease-out; }
        .jrpg-heal-panel { animation: jrpg-heal-panel .8s ease-out; }
        .jrpg-magic { animation: jrpg-magic .62s ease-out; }
        .jrpg-magic-burst { position:absolute; z-index:20; left:50%; top:48%; width:110px; height:110px; border-radius:999px; border:5px solid rgba(190,165,255,.9); background:radial-gradient(circle,rgba(196,181,253,.6),rgba(124,58,237,.12) 60%,transparent 72%); box-shadow:0 0 28px rgba(167,139,250,.9); animation:jrpg-burst .6s ease-out both; pointer-events:none; }
        .jrpg-feint { animation: jrpg-hit .38s ease-out; }
        @keyframes jrpg-hit { 0%,100% { filter: none; transform: translateX(0) scale(1); } 12%,38% { filter: sepia(1) saturate(7) hue-rotate(315deg) brightness(1.35); transform: translateX(-7px) scale(1.025); } 25%,50% { transform: translateX(7px) scale(1.015); } }
        @keyframes jrpg-heal { 0%,100% { filter: drop-shadow(0 0 0 rgba(74,222,128,0)); } 35%,70% { filter: sepia(.6) saturate(2) hue-rotate(75deg) brightness(1.35) drop-shadow(0 0 18px rgba(74,222,128,.9)); } }
        @keyframes jrpg-float { 0% { opacity: 0; transform: translate(-50%, 18px) scale(.72); } 12% { opacity: 1; transform: translate(-50%, 0) scale(1.08); } 78% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -75px) scale(1); } }
        @keyframes jrpg-guard { 0% { opacity: 0; transform: scale(.65); } 20%,75% { opacity: 1; transform: scale(1.08); } 100% { opacity: 0; transform: scale(1.2); } }
        @keyframes jrpg-slash { 0% { opacity: 0; transform: rotate(-24deg) scaleX(.15); } 25% { opacity: .95; transform: rotate(-24deg) scaleX(1); } 100% { opacity: 0; transform: rotate(-24deg) scaleX(1.2); } }
        .jrpg-slash { position: absolute; z-index: 20; left: 20%; top: 45%; width: 60%; height: 5px; border-radius: 999px; background: linear-gradient(90deg,transparent,#fff4cf,#ff5368,transparent); box-shadow: 0 0 18px #ff5368; animation: jrpg-slash .42s ease-out both; pointer-events: none; }
        .jrpg-hit { animation: jrpg-hit .48s ease-out; }
        .jrpg-heal { animation: jrpg-heal .8s ease-out; }
        .jrpg-number { position: absolute; z-index: 30; left: 50%; top: 40%; pointer-events: none; white-space: nowrap; font-family: Georgia,serif; font-size: clamp(1.3rem,4vw,2.15rem); font-weight: 900; letter-spacing: .02em; text-shadow: 0 3px 3px #000, 0 0 12px currentColor; animation: jrpg-float 1.15s cubic-bezier(.2,.75,.25,1) both; }
        .jrpg-number-damage { color: #ff555d; }
        .jrpg-number-heal { color: #65f39a; }
        .jrpg-number-guard { color: #76caff; animation-name: jrpg-guard; }
        @media (prefers-reduced-motion: reduce) { .jrpg-hit,.jrpg-heal,.jrpg-number,.jrpg-hit-panel,.jrpg-heal-panel,.jrpg-magic,.jrpg-feint,.jrpg-magic-burst { animation-duration: .01ms !important; } }
      `}</style>
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
            <div className={`relative space-y-3 rounded-xl border bg-background/50 p-3 sm:p-4 ${visualEvents.some((event) => event.target === "hero" && event.kind === "damage") ? "jrpg-hit-panel" : ""} ${visualEvents.some((event) => event.target === "hero" && event.kind === "heal") ? "jrpg-heal-panel" : ""}`}>
              {visualEvents.filter((event) => event.target === "hero").map((event) => (
                <span key={event.id} className={`jrpg-number ${event.kind === "damage" ? "jrpg-number-damage" : event.kind === "heal" ? "jrpg-number-heal" : "jrpg-number-guard"}`}>
                  {event.kind === "damage" ? `-${event.amount}${event.crit ? " CRÍTICO!" : ""}` : event.kind === "heal" ? `+${event.amount}` : event.kind === "aim" ? "MIRA!" : event.kind === "feint" ? "FINTA!" : "DEFESA!"}
                </span>
              ))}
              <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10"><Swords className="h-5 w-5 text-gold" /></span><div className="min-w-0"><p className="text-xs uppercase tracking-wider text-muted-foreground">Herói</p><h3 className="truncate font-display text-lg">{res.hero}</h3></div></div>
              <StatBar label="Pontos de Vida (PV)" value={res.heroPv} max={res.heroMaxPv} color="bg-emerald-500" />
              <StatBar label="Pontos de Magia (PM)" value={res.heroPm} max={res.heroMaxPm} color="bg-sky-500" />
              <div className="flex gap-1 pt-1 text-center [&>div]:flex-1 [&>div]:min-w-0">{([["F", res.attributes?.f], ["H", res.attributes?.h], ["R", res.attributes?.r], ["A", res.attributes?.a], ["PdF", res.attributes?.pdf]] as const).map(([label, value]) => <div key={label} className="rounded-md bg-muted/60 px-1 py-1"><span className="block text-[10px] uppercase text-muted-foreground">{label}</span><span className="font-display text-sm">{value ?? "—"}</span></div>)}</div>
            </div>
            <div className="space-y-3 rounded-xl border border-blood/20 bg-blood/5 p-3 sm:p-4">
              <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blood/10"><Shield className="h-5 w-5 text-blood" /></span><div className="min-w-0"><p className="text-xs uppercase tracking-wider text-muted-foreground">Adversário</p><h3 className="truncate font-display text-lg">{res.monster}</h3></div></div>
              <div className="relative isolate flex min-h-[210px] items-center justify-center overflow-hidden rounded-xl border border-blood/20 bg-gradient-to-b from-[#211629] via-[#17121e] to-[#0c0b12] p-3">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(154,67,165,0.22),transparent_68%)]" />
                <img
                  key={visualEvents.filter((event) => event.target === "monster")[visualEvents.filter((event) => event.target === "monster").length - 1]?.id ?? "monster-art"}
                  src={monsterArtworkUrl || getMonsterArtwork(res.monster).src}
                  alt={getMonsterArtwork(res.monster).alt}
                  className={`relative z-10 h-[190px] w-full object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.55)] ${visualEvents.some((event) => event.target === "monster" && event.kind === "damage") ? "jrpg-hit" : ""} ${visualEvents.some((event) => event.target === "monster" && event.kind === "heal") ? "jrpg-heal" : ""} ${visualEvents.some((event) => event.target === "monster" && event.kind === "feint") ? "jrpg-feint" : ""} ${visualEvents.some((event) => event.target === "monster" && event.kind === "damage" && event.sourceAction?.startsWith("Magia:")) ? "jrpg-magic" : ""} `}
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
              <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-display text-lg">Escolha sua ação</h3><p className="text-xs text-muted-foreground">Vigor gasto ao iniciar: 2 por combate.</p></div><span className="text-xs text-muted-foreground">{busy ? "Resolvendo turno…" : "Sua vez"}</span></div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {actions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button key={action.id} type="button" disabled={busy || !!action.disabled || done} onClick={() => act(action.id)} className="flex min-h-[82px] min-w-0 items-start gap-2.5 rounded-xl border bg-background p-2.5 text-left transition hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-[90px] sm:p-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className={`h-4 w-4 ${action.tone}`} /></span>
                      <span className="min-w-0 flex-1"><span className="block font-semibold">{action.title}</span><span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{action.description}</span><span className="mt-1 block text-[11px] font-medium text-gold">{action.cost}</span></span>
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
