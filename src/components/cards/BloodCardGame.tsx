import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight, Crown, Heart, Moon, Skull, Sparkles, Swords, Store, Eye, Zap,
  Footprints, ScrollText, Gem, Compass,
} from "lucide-react";

type CardId =
  | "strike" | "guard" | "water_blade" | "blood_lance" | "ardil"
  | "corruption" | "mad_draconate" | "chain" | "impure_heart" | "last_second"
  | "blood_siphon" | "soul_bastion" | "rift_step" | "execution";
type CardType = "Ataque" | "Defesa" | "Maldição" | "Magia" | "Lendária";
type CardDef = { name: string; cost: number; type: CardType; text: string; rarity: string; art: string };
type Enemy = { id: string; name: string; hp: number; maxHp: number; attack: number; intent: number; intentType: "attack" | "heavy" | "guard"; boss?: boolean };
type NodeType = "monster" | "elite" | "event" | "shop" | "boss" | "escape";
type Phase = "intro" | "map" | "battle" | "reward" | "event" | "shop" | "victory" | "defeat";
type Game = {
  phase: Phase; zone: number; step: number; node: NodeType | null;
  draw: CardId[]; hand: CardId[]; discard: CardId[]; exhaust: CardId[];
  enemies: Enemy[]; mana: number; manaSpent: number; block: number; turn: number;
  log: string[]; artifacts: string[]; corruptionUsed: number; dragonUnlocked: boolean;
  bleed: number; lastPlayed: CardId | null; hannaUsed: boolean; skullUsed: boolean;
  kills: number; bladeKills: number; bladeEvolved: boolean; shards: number; mapOptions: NodeType[];
  eventId: number; eventChoices: string[]; escaped: boolean;
};
type Progress = { kills: number; bladeKills: number; bladeEvolved: boolean };

const CARDS: Record<CardId, CardDef> = {
  strike: { name: "Golpe", cost: 1, type: "Ataque", text: "Causa 7 de dano.", rarity: "Comum", art: "steel" },
  guard: { name: "Defesa Instintiva", cost: 1, type: "Defesa", text: "Ganhe 9 de bloqueio.", rarity: "Comum", art: "shield" },
  water_blade: { name: "Lâmina d'Água", cost: 1, type: "Ataque", text: "Causa 9 de dano. Derrote 100 monstros com ela no baralho para evoluir.", rarity: "Rara", art: "water" },
  blood_lance: { name: "Lança de Sangue", cost: 1, type: "Ataque", text: "Causa 15 de dano e aplica 4 de sangramento por 2 turnos.", rarity: "Lendária", art: "lance" },
  ardil: { name: "Ardil", cost: 1, type: "Defesa", text: "Bloqueia o próximo ataque inteiro e rebate 100% do dano ao agressor.", rarity: "Épica", art: "mirror" },
  corruption: { name: "Corrupção", cost: 0, type: "Maldição", text: "Ao usar: exaure esta carta e perde 2 cartas de vida no total. Se ficar na mão: perde 4.", rarity: "Maldição", art: "seed" },
  mad_draconate: { name: "Draconato Louco", cost: 0, type: "Lendária", text: "Causa 10× a mana gasta neste turno a TODOS os inimigos. Exaure.", rarity: "Secreta", art: "dragon" },
  chain: { name: "Correntes do Além", cost: 2, type: "Magia", text: "Causa 5 de dano e reduz o próximo ataque inimigo em 50%.", rarity: "Incomum", art: "chains" },
  impure_heart: { name: "Coração Impuro", cost: 0, type: "Ataque", text: "Sacrifique 1 carta de vida para causar 13 de dano.", rarity: "Épica", art: "heart" },
  last_second: { name: "Último Segundo", cost: 1, type: "Defesa", text: "Ganhe 11 de bloqueio e compre 1 carta.", rarity: "Incomum", art: "hourglass" },
  blood_siphon: { name: "Sifão Carmesim", cost: 1, type: "Ataque", text: "Causa 6 de dano. Recupere 1 carta de vida se derrotar o alvo.", rarity: "Incomum", art: "siphon" },
  soul_bastion: { name: "Bastião das Almas", cost: 2, type: "Defesa", text: "Ganhe 15 de bloqueio. Reduz 2 do próximo ataque recebido.", rarity: "Incomum", art: "bastion" },
  rift_step: { name: "Passo da Fenda", cost: 0, type: "Magia", text: "Ganhe 4 de bloqueio e compre 1 carta.", rarity: "Rara", art: "rift" },
  execution: { name: "Sentença", cost: 2, type: "Ataque", text: "Causa 18 de dano. Causa +8 contra inimigos abaixo de 30% de vida.", rarity: "Épica", art: "execution" },
};

const ARTIFACTS = [
  { id: "Semente do Mal", icon: "✹", name: "Semente do Mal", desc: "Adiciona 6 Corrupções ao baralho. Use-as para pagar 2 cartas de vida; deixe-as na mão e pague 4." },
  { id: "Véu de Hanna", icon: "☽", name: "Véu de Hanna", desc: "Uma vez por combate, Hanna impede a perda de 1 carta de vida." },
  { id: "Crânio de Rogério", icon: "☠", name: "Crânio de Rogério", desc: "Uma vez por combate, após perder 3+ cartas num golpe, devolve a última carta jogada à mão." },
];

const ENCOUNTERS: { name: string; hp: number; attack: number; kind: string }[][] = [
  [
    { name: "Carniçal das Fendas", hp: 29, attack: 5, kind: "Ghoul" },
    { name: "Larvas do Véu", hp: 15, attack: 3, kind: "Swarm" },
    { name: "Cão de Cinzas", hp: 24, attack: 4, kind: "Hound" },
    { name: "Viúva do Breu", hp: 21, attack: 5, kind: "Widow" },
    { name: "Coveiro Errante", hp: 34, attack: 4, kind: "Gravedigger" },
  ],
  [
    { name: "Cavaleiro sem Rosto", hp: 43, attack: 7, kind: "Knight" },
    { name: "Monge Oco", hp: 31, attack: 5, kind: "Cultist" },
    { name: "Aracnídeo Rubro", hp: 27, attack: 6, kind: "Spider" },
    { name: "Carrilhão Profano", hp: 38, attack: 6, kind: "Bell" },
    { name: "Dama do Véu", hp: 35, attack: 8, kind: "Veil" },
  ],
  [
    { name: "Arauto da Ruína", hp: 60, attack: 9, kind: "Herald" },
    { name: "Sentinela Partida", hp: 44, attack: 7, kind: "Sentinel" },
    { name: "Devorador de Ecos", hp: 51, attack: 8, kind: "Devourer" },
    { name: "Arauto das Mil Vozes", hp: 56, attack: 9, kind: "Voices" },
    { name: "Carrasco da Catedral", hp: 66, attack: 8, kind: "Executioner" },
  ],
];
const ZONES = ["Campos das Cinzas", "Catedral do Sangue", "Abismo Sem Lua"];
const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const totalLife = (g: Game) => g.draw.length + g.hand.filter(c => c !== "mad_draconate").length + g.discard.length;
const log = (g: Game, message: string): Game => ({ ...g, log: [message, ...g.log].slice(0, 8) });
const newEnemy = (name: string, hp: number, attack: number, id: string, boss = false): Enemy => ({
  id, name, hp, maxHp: hp, attack, intent: attack, intentType: "attack", boss,
});
function freshDeck(progress: Progress, seed: boolean): CardId[] {
  const deck: CardId[] = [
    ...Array(5).fill("strike" as CardId), ...Array(5).fill("guard" as CardId),
    "water_blade", "ardil", "chain", "last_second", "impure_heart", "blood_siphon",
    "soul_bastion", "rift_step", "execution",
  ];
  if (progress.bladeEvolved) return deck.map(c => c === "water_blade" ? "blood_lance" : c);
  return seed ? [...deck, ...Array(6).fill("corruption" as CardId)] : deck;
}
function drawCards(g: Game, amount: number): Game {
  const n = { ...g, draw: [...g.draw], discard: [...g.discard], hand: [...g.hand] };
  for (let i = 0; i < amount; i++) {
    if (!n.draw.length && n.discard.length) { n.draw = shuffle(n.discard); n.discard = []; }
    if (!n.draw.length) break;
    n.hand.push(n.draw.pop()!);
  }
  return n;
}
function removeLife(g: Game, amount: number): Game {
  const n = { ...g, draw: [...g.draw], discard: [...g.discard], hand: [...g.hand] };
  let remaining = amount;
  while (remaining > 0) {
    if (n.draw.length) n.draw.splice(Math.floor(Math.random() * n.draw.length), 1);
    else if (n.discard.length) n.discard.splice(Math.floor(Math.random() * n.discard.length), 1);
    else if (n.hand.some(c => c !== "mad_draconate")) { const candidates = n.hand.map((c,i)=>c!=="mad_draconate"?i:-1).filter(i=>i>=0); n.hand.splice(candidates[Math.floor(Math.random()*candidates.length)],1); }
    else break;
    remaining--;
  }
  if (totalLife(n) <= 0) n.phase = "defeat";
  return n;
}
function intentFor(enemy: Enemy, turn: number): Enemy {
  const cycle = turn % 3;
  const intentType = cycle === 0 ? "heavy" : cycle === 2 ? "guard" : "attack";
  const intent = cycle === 0 ? enemy.attack + 4 : cycle === 2 ? Math.max(2, Math.ceil(enemy.attack * 0.5)) : enemy.attack;
  return { ...enemy, intentType, intent };
}
function routeOptions(step: number): NodeType[] {
  if (step >= 9) return ["boss", "escape"];
  const pool: NodeType[] = ["monster", "monster", "event", "shop", "elite"];
  return shuffle(pool).slice(0, 3);
}
function makeGame(artifacts: string[], progress: Progress): Game {
  const deck = shuffle(freshDeck(progress, artifacts.includes("Semente do Mal")));
  const g: Game = {
    phase: "map", zone: 0, step: 0, node: null, draw: deck, hand: [], discard: [], exhaust: [],
    enemies: [], mana: 3, manaSpent: 0, block: 0, turn: 1, log: ["A expedição começou. Seu baralho é sua vida."],
    artifacts, corruptionUsed: 0, dragonUnlocked: false, bleed: 0, lastPlayed: null, hannaUsed: false,
    skullUsed: false, kills: progress.kills, bladeKills: progress.bladeKills, bladeEvolved: progress.bladeEvolved,
    shards: 0, mapOptions: routeOptions(0), eventId: 0, eventChoices: [], escaped: false,
  };
  return g;
}
function startBattle(g: Game, node: NodeType): Game {
  const tier = Math.min(2, Math.floor(g.step / 3));
  let enemies = node === "boss"
    ? [newEnemy("A Morte", 125, 9, "death", true)]
    : node === "elite"
      ? [newEnemy(["Carrasco de Cinzas", "Bispo Rubro", "Arauto Corrompido"][tier], 70 + tier * 16, 9 + tier * 2, "elite")]
      : shuffle(ENCOUNTERS[tier]).slice(0, node === "monster" && g.step % 2 === 0 ? 2 : 1).map((e, i) => newEnemy(e.name, e.hp + tier * 15, e.attack + tier * 2, e.kind + i));
  let next: Game = { ...g, phase: "battle", node, enemies: enemies.map(e => intentFor(e, 1)), hand: [], mana: 3, manaSpent: 0, block: 0, turn: 1, corruptionUsed: 0, dragonUnlocked: false, hannaUsed: false, skullUsed: false, bleed: 0 };
  next = drawCards(next, 5);
  return log(next, node === "boss" ? "A Morte alcançou você. Não existe mais fuga." : node === "elite" ? "Uma presença poderosa bloqueia o caminho." : "As criaturas avançam!");
}
function nextMap(g: Game): Game {
  const step = g.step + 1;
  const zone = Math.min(2, Math.floor(step / 3));
  return { ...g, phase: "map", step, zone, node: null, mapOptions: routeOptions(step), enemies: [], hand: [], mana: 3, manaSpent: 0, block: 0 };
}
function cardTheme(id: CardId) {
  const themes: Record<CardId, string> = {
    strike: "from-slate-700 via-zinc-950 to-black border-slate-300/50",
    guard: "from-cyan-900 via-slate-950 to-black border-cyan-300/50",
    water_blade: "from-blue-700 via-indigo-950 to-black border-cyan-200/70",
    blood_lance: "from-red-800 via-rose-950 to-black border-red-300/70",
    ardil: "from-violet-700 via-indigo-950 to-black border-violet-300/70",
    corruption: "from-fuchsia-900 via-purple-950 to-black border-fuchsia-300/70",
    mad_draconate: "from-sky-600 via-blue-950 to-black border-sky-200",
    chain: "from-stone-700 via-neutral-950 to-black border-stone-300/60",
    impure_heart: "from-rose-800 via-red-950 to-black border-rose-300/60",
    last_second: "from-amber-700 via-orange-950 to-black border-amber-200/60",
    blood_siphon: "from-red-700 via-rose-950 to-black border-red-200/60",
    soul_bastion: "from-emerald-800 via-teal-950 to-black border-emerald-200/60",
    rift_step: "from-indigo-700 via-violet-950 to-black border-violet-200/60",
    execution: "from-orange-800 via-red-950 to-black border-orange-200/60",
  };
  return themes[id];
}
function CardArt({ id, compact = false }: { id: CardId; compact?: boolean }) {
  const shapes: Record<CardId, ReactNode> = {
    strike: <><path d="M50 10 62 39 88 50 62 61 50 90 38 61 12 50 38 39Z" fill="#dbeafe" opacity=".2"/><path d="M20 74 76 18M31 84 87 28" stroke="#e2e8f0" strokeWidth="5" strokeLinecap="round"/><path d="m65 18 12-5-5 12" fill="none" stroke="#fff" strokeWidth="3"/></>,
    guard: <><path d="M50 9 82 22 78 57Q72 79 50 91 28 79 22 57L18 22Z" fill="#0e7490" stroke="#a5f3fc" strokeWidth="4"/><path d="m50 23 18 8-3 25-15 18-15-18-3-25Z" fill="#cffafe" opacity=".22"/><path d="m37 50 9 9 19-22" fill="none" stroke="#ecfeff" strokeWidth="5" strokeLinecap="round"/></>,
    water_blade: <><path d="M12 70Q32 10 54 30T90 24Q65 52 79 80Q49 61 28 88Z" fill="#38bdf8" opacity=".75"/><path d="M17 70Q48 18 83 20" fill="none" stroke="#e0f2fe" strokeWidth="5" strokeLinecap="round"/><circle cx="30" cy="40" r="5" fill="#fff"/><circle cx="67" cy="58" r="3" fill="#bae6fd"/></>,
    blood_lance: <><path d="M50 5 64 34 54 39 80 82 50 70 20 82 46 39 36 34Z" fill="#fecaca" stroke="#f87171" strokeWidth="3"/><path d="M50 25V90" stroke="#7f1d1d" strokeWidth="5"/><path d="m40 51 20 0" stroke="#fff" strokeWidth="3"/></>,
    ardil: <><path d="M50 12 84 50 50 88 16 50Z" fill="#312e81" stroke="#c4b5fd" strokeWidth="4"/><path d="M50 22 74 50 50 78 26 50Z" fill="#a78bfa" opacity=".3"/><path d="M34 50h32M50 34v32" stroke="#ede9fe" strokeWidth="4"/><path d="m23 22 9 9m45 0 9-9m-63 56 9-9m45 0 9 9" stroke="#fff" strokeWidth="3"/></>,
    corruption: <><path d="M50 8C18 29 20 64 50 91 80 64 82 29 50 8Z" fill="#701a75" stroke="#f0abfc" strokeWidth="3"/><path d="M50 25 60 44 50 54 40 44Z" fill="#f5d0fe"/><path d="M50 54 62 73 50 82 38 73Z" fill="#e879f9"/><circle cx="50" cy="50" r="30" fill="none" stroke="#f0abfc" strokeDasharray="3 7" strokeWidth="2"/></>,
    mad_draconate: <><path d="M16 72Q7 32 34 25L28 8 48 20 58 8 63 25Q93 29 84 72L67 60 50 87 33 60Z" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="3"/><path d="m31 42 13 5m25-5-13 5" stroke="#0284c7" strokeWidth="5"/><path d="m50 49 0 18m-14 0 14 12 14-12" stroke="#fff" strokeWidth="3" fill="none"/></>,
    chain: <><path d="M30 27 21 36Q13 44 22 53L29 60Q38 69 47 60L59 48M70 73l9-9q8-8-1-17l-7-7q-9-9-18 0L41 52" stroke="#e7e5e4" strokeWidth="9" fill="none" strokeLinecap="round"/><path d="m33 47 34 0" stroke="#a8a29e" strokeWidth="4"/></>,
    impure_heart: <><path d="M50 83 18 52Q5 28 27 19 42 13 50 32 59 13 75 19 96 28 82 52Z" fill="#be123c" stroke="#fda4af" strokeWidth="4"/><path d="m50 32-10 21 12 7-8 15 22-29-13-4 7-10" fill="#ffe4e6" opacity=".8"/></>,
    last_second: <><path d="M32 13h36l-8 29 8 45H32l8-45Z" fill="#92400e" stroke="#fde68a" strokeWidth="4"/><path d="M34 18h32M34 82h32" stroke="#fff7ed" strokeWidth="4"/><path d="M42 40h16L50 55Z M42 61h16l-8 12Z" fill="#fef3c7"/></>,
    blood_siphon: <><path d="M50 8C32 34 20 47 20 63a30 30 0 0 0 60 0C80 47 68 34 50 8Z" fill="#be123c" stroke="#fda4af" strokeWidth="3"/><path d="M50 27v43m-13-14 13 14 13-14" stroke="#fff1f2" strokeWidth="4" fill="none"/></>,
    soul_bastion: <><path d="M50 8 82 28v30L50 90 18 58V28Z" fill="#065f46" stroke="#a7f3d0" strokeWidth="4"/><path d="M50 25 68 38v18L50 74 32 56V38Z" fill="#34d399" opacity=".3"/><path d="M50 34v31m-12-15h24" stroke="#ecfdf5" strokeWidth="4"/></>,
    rift_step: <><path d="M20 18 77 15 58 42 84 48 23 84 43 55 16 49Z" fill="#4338ca" stroke="#c4b5fd" strokeWidth="3"/><path d="m29 49 42-22M33 67l34-16" stroke="#e0e7ff" strokeWidth="3"/></>,
    execution: <><path d="M50 8 73 36 63 47 80 78 50 68 20 78 37 47 27 36Z" fill="#9a3412" stroke="#fed7aa" strokeWidth="4"/><path d="M50 18v58M35 48h30" stroke="#ffedd5" strokeWidth="4"/><path d="m42 33 8-10 8 10" fill="none" stroke="#fff" strokeWidth="3"/></>,
  };
  return <svg viewBox="0 0 100 100" className={compact ? "h-16 w-16" : "h-24 w-24"} aria-hidden="true">{shapes[id]}</svg>;
}
function CardFace({ id, onClick, disabled, selected = false }: { id: CardId; onClick?: () => void; disabled?: boolean; selected?: boolean }) {
  const c = CARDS[id];
  const content = <div className={`relative flex h-full min-h-[178px] flex-col overflow-hidden rounded-[14px] border-2 bg-gradient-to-b p-2 shadow-[0_16px_36px_rgba(0,0,0,.45)] transition-all duration-200 ${cardTheme(id)} ${selected ? "ring-2 ring-amber-200 ring-offset-2 ring-offset-[#0b0810]" : ""} ${disabled ? "opacity-45 grayscale-[.55]" : "hover:-translate-y-2 hover:shadow-[0_22px_48px_rgba(0,0,0,.6)]"}`}>
    <div className="pointer-events-none absolute inset-1 rounded-[13px] border border-white/15"/>
    <div className="relative flex items-center justify-between gap-2">
      <span className="rounded-full border border-white/20 bg-black/55 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">{c.rarity}</span>
      <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-amber-200/70 bg-black/70 font-display text-sm font-black text-amber-100 shadow-[0_0_16px_rgba(251,191,36,.25)]">{c.cost}</span>
    </div>
    <div className="relative my-1 flex h-[76px] items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black/35">
      <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 50% 45%,rgba(255,255,255,.35),transparent 55%),repeating-linear-gradient(135deg,transparent 0 10px,rgba(255,255,255,.06) 10px 11px)" }}/>
      <CardArt id={id} compact/>
      <span className="absolute bottom-1 right-2 text-[8px] font-black uppercase tracking-[.3em] text-white/35">GD · FENDAS</span>
    </div>
    <h4 className="relative font-display text-center text-[12px] font-bold leading-tight text-white drop-shadow">{c.name}</h4>
    <p className="relative mt-1 min-h-[34px] text-center text-[9px] leading-[1.45] text-white/75">{c.text}</p>
    <div className="relative mt-1 flex items-center justify-between border-t border-white/15 pt-1">
      <span className="text-[9px] font-black uppercase tracking-[.2em] text-white/55">{c.type}</span>
      <span className="text-[9px] font-bold uppercase tracking-widest text-white/45">{id === "corruption" ? "Maldição" : id === "mad_draconate" ? "Única" : "Fenda"}</span>
    </div>
  </div>;
  return onClick ? <button type="button" onClick={onClick} disabled={disabled} className="block w-full text-left disabled:cursor-not-allowed">{content}</button> : content;
}
function NodeIcon({ type }: { type: NodeType }) {
  if (type === "monster") return <Swords className="h-5 w-5"/>;
  if (type === "elite") return <Skull className="h-5 w-5"/>;
  if (type === "event") return <ScrollText className="h-5 w-5"/>;
  if (type === "shop") return <Store className="h-5 w-5"/>;
  if (type === "escape") return <Footprints className="h-5 w-5"/>;
  return <Crown className="h-5 w-5"/>;
}

export function BloodCardGame() {
  const [selectedArtifacts, setSelectedArtifacts] = useState<string[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const [progress, setProgress] = useState<Progress>({ kills: 0, bladeKills: 0, bladeEvolved: false });
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem("gd-koda-blood-card-progress-v2");
      if (raw) setProgress(JSON.parse(raw));
    } catch { /* progresso local opcional */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("gd-koda-blood-card-progress-v2", JSON.stringify(progress)); } catch { /* armazenamento opcional */ }
  }, [progress]);

  const begin = () => { setNotice(""); setGame(makeGame(selectedArtifacts, progress)); };
  const enterNode = (node: NodeType) => {
    if (!game) return;
    if (node === "escape") { setGame({ ...game, phase: "victory", escaped: true, log: ["Você abandonou a última rota e escapou da Morte."] }); return; }
    if (node === "event") {
      const eventId = Math.floor(Math.random() * 8);
      const choices = [
        ["Entregar 2 cartas de vida e receber 3 fragmentos", "Recusar a oferta"],
        ["Sacrificar 1 vida e reorganizar até 5 cartas do descarte", "Sair sem tocar no altar"],
        ["Remover uma carta comum do baralho", "Receber 2 fragmentos"],
        ["Ganhar 1 carta rara e sofrer 4 de dano", "Ignorar a visão"],
      ][eventId];
      setGame({ ...game, phase: "event", node, eventId, eventChoices: choices });
    } else if (node === "shop") {
      setGame({ ...game, phase: "shop", node });
    } else setGame(startBattle(game, node));
  };
  const finishBattle = (g: Game) => {
    const killed = g.enemies.every(e => e.hp <= 0);
    if (!killed) return g;
    const kills = g.enemies.length;
    g.kills += kills;
    if (!g.bladeEvolved && [...g.draw, ...g.discard, ...g.hand].some(c => c === "water_blade")) {
      g.bladeKills += kills;
      if (g.bladeKills >= 100) {
        g.bladeEvolved = true;
        g.draw = g.draw.map(c => c === "water_blade" ? "blood_lance" : c);
        g.discard = g.discard.map(c => c === "water_blade" ? "blood_lance" : c);
        g.hand = g.hand.map(c => c === "water_blade" ? "blood_lance" : c);
      }
    }
    g.shards += g.node === "elite" ? 4 : g.node === "boss" ? 8 : 2;
    setProgress({ kills: g.kills, bladeKills: g.bladeKills, bladeEvolved: g.bladeEvolved });
    if (g.node === "boss") g.phase = "victory";
    else { g.phase = "reward"; }
    return log(g, "Vitória! Escolha uma recompensa para continuar.");
  };
  const playCard = (index: number) => {
    if (!game || game.phase !== "battle") return;
    const id = game.hand[index];
    const card = CARDS[id];
    if (!card || card.cost > game.mana) { setNotice("Mana insuficiente."); return; }
    setNotice("");
    let g: Game = { ...game, draw: [...game.draw], hand: [...game.hand], discard: [...game.discard], exhaust: [...game.exhaust], enemies: game.enemies.map(e => ({ ...e })) };
    g.hand.splice(index, 1);
    g.mana -= card.cost;
    g.manaSpent += card.cost;
    g.lastPlayed = id;
    const target = g.enemies.find(e => e.hp > 0);
    const damageAll = (damage: number) => { g.enemies = g.enemies.map(e => ({ ...e, hp: Math.max(0, e.hp - damage) })); };
    const damageTarget = (damage: number) => { if (target) target.hp = Math.max(0, target.hp - damage); };
    if (id === "strike") damageTarget(7);
    if (id === "water_blade") damageTarget(9);
    if (id === "blood_lance") { damageTarget(15); g.bleed = 2; }
    if (id === "guard") g.block += 9;
    if (id === "ardil") { const incoming = g.enemies.reduce((sum, e) => sum + (e.hp > 0 ? e.intent : 0), 0); g.block += incoming; g.enemies = g.enemies.map(e => ({ ...e, hp: e.hp > 0 ? Math.max(0, e.hp - e.intent) : e.hp })); }
    if (id === "chain") { damageTarget(5); g.enemies = g.enemies.map(e => ({ ...e, intent: Math.ceil(e.intent / 2) })); }
    if (id === "impure_heart") { g = removeLife(g, 1); damageTarget(13); }
    if (id === "last_second") { g.block += 11; g = drawCards(g, 1); }
    if (id === "blood_siphon") { const before = target?.hp ?? 0; damageTarget(6); if (before > 0 && target?.hp === 0) { g.draw.push("strike"); g = log(g, "Sifão Carmesim recuperou uma carta de vida."); } }
    if (id === "soul_bastion") { g.block += 15; g.enemies = g.enemies.map(e => ({ ...e, intent: Math.max(0, e.intent - 2) })); }
    if (id === "rift_step") { g.block += 4; g = drawCards(g, 1); }
    if (id === "execution") { const e = g.enemies.find(x => x.hp > 0); damageTarget(e && e.hp / e.maxHp <= .3 ? 26 : 18); }
    if (id === "corruption") {
      g.exhaust.push(id);
      g = removeLife(g, 1);
      g.corruptionUsed += 1;
      if (g.corruptionUsed >= 6 && !g.dragonUnlocked) {
        g.dragonUnlocked = true;
        g.hand.push("mad_draconate");
        g = log(g, "SEGREDO DESBLOQUEADO — DRACONATO LOUCO!");
      }
    }
    if (id === "mad_draconate") { damageAll(g.manaSpent * 10); g.exhaust.push(id); g = log(g, `O Draconato libera ${g.manaSpent * 10} de dano elétrico em área!`); }
    if (id !== "corruption" && id !== "mad_draconate") g.discard.push(id);
    if (g.phase === "defeat") { setGame(g); return; }
    g = log(g, `${card.name}: ${card.text}`);
    if (g.enemies.every(e => e.hp <= 0)) g = finishBattle(g);
    setGame(g);
  };
  const endTurn = () => {
    if (!game || game.phase !== "battle") return;
    let g: Game = { ...game, draw: [...game.draw], hand: [...game.hand], discard: [...game.discard], enemies: game.enemies.map(e => ({ ...e })) };
    const unused = g.hand.filter(c => c === "corruption").length;
    if (unused) {
      const kept = g.hand.filter(c => c !== "corruption");
      g.exhaust.push(...g.hand.filter(c => c === "corruption"));
      g.hand = kept;
      g = removeLife(g, unused * 3);
      g = log(g, `A Corrupção cobrou ${unused * 4} cartas de vida.`);
    }
    g.exhaust.push(...g.hand.filter(c => c === "mad_draconate"));
    g.discard.push(...g.hand.filter(c => c !== "mad_draconate"));
    g.hand = [];
    if (g.phase === "defeat") { setGame(g); return; }
    if (g.bleed > 0) {
      const target = g.enemies.find(e => e.hp > 0);
      if (target) target.hp = Math.max(0, target.hp - 4);
      g.bleed -= 1;
      g = log(g, "Sangramento: 4 de dano.");
    }
    if (g.enemies.every(e => e.hp <= 0)) { setGame(finishBattle(g)); return; }
    const incoming = g.enemies.reduce((sum, e) => sum + (e.hp > 0 ? e.intent : 0), 0);
    const blocked = Math.min(g.block, incoming);
    let lost = Math.max(0, incoming - g.block);
    if (lost > 0 && g.artifacts.includes("Véu de Hanna") && !g.hannaUsed) { lost = Math.max(0, lost - 1); g.hannaUsed = true; g = log(g, "O Véu de Hanna anulou 1 dano."); }
    if (lost > 0 && g.artifacts.includes("Crânio de Rogério") && !g.skullUsed && lost >= 3 && g.lastPlayed) {
      const i = g.discard.lastIndexOf(g.lastPlayed);
      const card = i >= 0 ? g.discard.splice(i, 1)[0] : g.lastPlayed;
      g.hand.push(card); g.skullUsed = true;
      g = log(g, `O Crânio de Rogério devolveu ${CARDS[card].name} à sua mão.`);
    }
    if (lost > 0) g = removeLife(g, lost);
    g.block = 0;
    g = log(g, `Os inimigos causaram ${incoming} de dano; bloqueio absorveu ${blocked}; ${lost} cartas foram perdidas.`);
    if (g.phase === "defeat") { setGame(g); return; }
    g.turn += 1; g.mana = 3; g.manaSpent = 0;
    g.enemies = g.enemies.map(e => e.hp > 0 ? intentFor(e, g.turn) : e);
    g = drawCards(g, 5);
    setGame(g);
  };
  const chooseReward = (id: CardId | null) => {
    if (!game) return;
    const draw = id ? shuffle([...game.draw, id]) : [...game.draw];
    setGame(nextMap({ ...game, phase: "map", draw }));
  };
  const chooseEvent = (choice: number) => {
    if (!game) return;
    let g = { ...game, draw: [...game.draw], discard: [...game.discard], hand: [...game.hand] };
    if (g.eventId === 0 && choice === 0) { g = removeLife(g, 2); g.shards += 3; }
    if (g.eventId === 1 && choice === 0) { g = removeLife(g, 1); const recover = Math.min(5, g.discard.length); g.draw.push(...g.discard.splice(0, recover)); }
    if (g.eventId === 2 && choice === 0) { const i = g.draw.findIndex(c => c === "strike" || c === "guard"); if (i >= 0) g.draw.splice(i, 1); }
    if (g.eventId === 2 && choice === 1) g.shards += 2;
    if (g.eventId === 3 && choice === 0) { g.draw.push("blood_siphon"); g = removeLife(g, 4); }
    if (g.phase === "defeat") { setGame(g); return; }
    setGame(nextMap({ ...g, phase: "map" }));
  };
  const shopBuy = (item: "heal" | "remove" | "card") => {
    if (!game) return;
    let g = { ...game, draw: [...game.draw], discard: [...game.discard] };
    if (item === "heal" && g.shards >= 3) { g.shards -= 3; g.draw.push(...g.discard.splice(0, Math.min(4, g.discard.length))); }
    if (item === "remove" && g.shards >= 4 && g.draw.length > 1) { g.shards -= 4; g.draw.pop(); }
    if (item === "card" && g.shards >= 5) { g.shards -= 5; g.draw.push("execution"); }
    setGame(g);
  };
  const total = game ? totalLife(game) : 0;
  const nodeLabel: Record<NodeType, string> = { monster: "Encontro", elite: "Elite", event: "Evento", shop: "Mercador", boss: "A Morte", escape: "Fugir da Morte" };
  const rewardChoices = useMemo(() => shuffle(["water_blade", "blood_lance", "ardil", "chain", "impure_heart", "blood_siphon", "soul_bastion", "rift_step", "execution", "last_second", "guard", "strike"] as CardId[]).filter(id => !(game?.bladeEvolved && id === "water_blade") && !(!game?.bladeEvolved && id === "blood_lance")).slice(0, 3), [game?.phase, game?.step, game?.bladeEvolved]);

  return <div className="space-y-5 text-foreground">
    {!game && <section className="relative overflow-hidden rounded-[28px] border border-rose-300/20 bg-[radial-gradient(ellipse_at_15%_0%,rgba(190,24,93,.28),transparent_40%),radial-gradient(ellipse_at_90%_90%,rgba(67,56,202,.22),transparent_40%),linear-gradient(145deg,#1a101b,#08070c)] p-5 shadow-[0_25px_80px_rgba(0,0,0,.55)] sm:p-8">
      <div className="pointer-events-none absolute -right-12 -top-14 text-[220px] opacity-[.045]">☠</div>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.38em] text-rose-300"><span className="h-px w-8 bg-rose-400"/> Roguelike de cartas · 3 regiões</div>
      <h1 className="mt-3 font-display text-4xl font-black tracking-tight text-rose-50 sm:text-6xl">Sangue <span className="text-rose-500">das</span> Fendas</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-rose-100/65">A sua vida é o seu baralho. Cada ferida apaga uma carta da expedição. Escolha caminhos, enfrente criaturas, negocie com forças antigas e fuja da Morte — ou tente destruí-la.</p>
      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        {[{ icon: <Heart/>, title: "Vida = cartas", text: "Dano destrói cartas do seu baralho. Cartas jogadas circulam entre compra e descarte." }, { icon: <Compass/>, title: "Rotas ramificadas", text: "Escolha entre monstros, elites, eventos e mercadores em três regiões." }, { icon: <Skull/>, title: "A Morte persegue", text: "O encontro final espera no fim da expedição. Cada rota muda seus recursos." }].map((v,i)=><div key={v.title} className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur"><span className="text-rose-300">{v.icon}</span><b className="mt-2 block text-sm text-white">{v.title}</b><p className="mt-1 text-xs leading-5 text-white/50">{v.text}</p></div>)}
      </div>
      <div className="mt-6 rounded-2xl border border-rose-200/15 bg-black/30 p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white"><Sparkles className="h-4 w-4 text-amber-300"/> Relíquias iniciais</div>
        <p className="mt-1 text-xs text-white/45">Escolha qualquer combinação. A Semente do Mal é poderosa, mas perigosa.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {ARTIFACTS.map(a=><button key={a.id} type="button" onClick={()=>setSelectedArtifacts(v=>v.includes(a.id)?v.filter(x=>x!==a.id):[...v,a.id])} className={`rounded-xl border p-3 text-left transition ${selectedArtifacts.includes(a.id)?"border-amber-300/70 bg-amber-950/45 shadow-[0_0_22px_rgba(251,191,36,.12)]":"border-white/10 bg-white/[.03] hover:bg-white/[.07]"}`}><span className="text-2xl">{a.icon}</span><b className="mt-1 block text-sm text-white">{a.name}</b><span className="mt-1 block text-[11px] leading-4 text-white/55">{a.desc}</span></button>)}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div className="text-xs text-white/50">Lâmina d'Água: <b className="text-cyan-200">{progress.bladeEvolved?"Lança de Sangue desbloqueada":`${progress.bladeKills}/100 abates`}</b><br/>Abates permanentes: {progress.kills}</div>
        <button onClick={begin} className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-rose-700 to-red-600 px-6 font-bold text-white shadow-[0_8px_28px_rgba(225,29,72,.3)] transition hover:brightness-110"><Swords className="h-4 w-4"/> Iniciar expedição <ArrowRight className="h-4 w-4"/></button>
      </div>
    </section>}

    {game?.phase === "map" && <section className="overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(ellipse_at_top,rgba(88,28,135,.18),transparent_50%),#0d0a11] p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.3em] text-violet-300">Mapa da expedição · Região {game.zone+1}/3</p><h2 className="mt-1 font-display text-3xl text-white">{ZONES[game.zone]}</h2></div><div className="rounded-xl border border-rose-300/20 bg-rose-950/30 px-3 py-2 text-xs text-rose-100"><Heart className="mr-1 inline h-4 w-4"/> {total} cartas de vida <span className="mx-2 text-white/20">|</span><Gem className="mr-1 inline h-4 w-4 text-amber-300"/> {game.shards} fragmentos</div></div>
      <div className="relative mt-6 overflow-hidden rounded-2xl border border-white/10 bg-black/35 p-4 sm:p-6">
        <div className="absolute inset-0 opacity-20" style={{backgroundImage:"radial-gradient(circle at 50% 50%,rgba(168,85,247,.25),transparent 55%),repeating-linear-gradient(45deg,transparent 0 25px,rgba(255,255,255,.035) 25px 26px)"}}/>
        <div className={`relative mx-auto grid gap-3 sm:gap-5 ${game.mapOptions.length === 2 ? "max-w-2xl grid-cols-2" : "grid-cols-3"}`}>
          {game.mapOptions.map((node,i)=><button key={`${node}-${i}`} onClick={()=>enterNode(node)} className="group flex min-h-[145px] flex-col items-center justify-center rounded-2xl border border-violet-200/20 bg-gradient-to-b from-violet-950/65 to-black/70 p-3 text-center text-violet-100 transition hover:-translate-y-1 hover:border-amber-200/60 hover:shadow-[0_0_28px_rgba(167,139,250,.2)]"><span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/45 text-amber-200 group-hover:scale-110"><NodeIcon type={node}/></span><b className="text-xs sm:text-sm">{nodeLabel[node]}</b><span className="mt-1 text-[9px] uppercase tracking-widest text-white/35">{node==="elite"?"alto risco":node==="shop"?"trocas":node==="event"?"escolha":node==="boss"?"final":"combate"}</span></button>)}
        </div>
        <div className="relative mt-5 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[.2em] text-white/35"><Footprints className="h-4 w-4"/> Escolha seu próximo caminho</div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-white/45"><span>Passo {game.step+1}/9 · {game.step>=6?"A Morte já sente seu cheiro":"A Morte avança a cada região"}</span><span>Baralho: {game.draw.length} compra · {game.discard.length} descarte</span></div>
    </section>}

    {game?.phase === "battle" && <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200/15 bg-[#100b13] p-4 shadow-lg">
        <div><p className="text-[10px] font-black uppercase tracking-[.3em] text-rose-300/70">{nodeLabel[game.node!]} · {ZONES[game.zone]}</p><h2 className="font-display text-2xl text-white">A Fenda está aberta</h2></div>
        <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-lg border border-rose-300/20 bg-rose-950/40 px-3 py-2 text-rose-100"><Heart className="mr-1 inline h-3.5 w-3.5"/> {total} vida</span><span className="rounded-lg border border-amber-300/20 bg-amber-950/30 px-3 py-2 text-amber-100"><Zap className="mr-1 inline h-3.5 w-3.5"/> {game.mana}/3 mana</span><span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white/70">Turno {game.turn}</span></div>
      </header>
      <div className="grid gap-3 lg:grid-cols-[1fr_230px]">
        <div className="rounded-[24px] border border-rose-200/10 bg-[radial-gradient(ellipse_at_50%_0%,rgba(127,29,29,.25),transparent_60%),linear-gradient(160deg,#17101b,#09070c)] p-4 sm:p-6">
          <div className={`grid gap-3 ${game.enemies.length>1?"sm:grid-cols-2":"grid-cols-1"}`}>
            {game.enemies.map((enemy,i)=><div key={enemy.id} className={`relative overflow-hidden rounded-2xl border p-4 text-center transition ${enemy.hp<=0?"border-white/5 bg-black/40 opacity-35 grayscale":"border-rose-200/20 bg-black/35"}`}>
              <div className="absolute inset-0 opacity-20" style={{backgroundImage:"radial-gradient(circle at 50% 30%,rgba(244,63,94,.35),transparent 60%)"}}/>
              <div className="relative text-5xl drop-shadow-[0_0_24px_rgba(190,24,93,.35)]">{enemy.boss?"☠":i===0?"👹":i===1?"🕷":"👁"}</div>
              <p className="relative mt-2 text-[9px] font-black uppercase tracking-[.25em] text-rose-300/60">{enemy.boss?"A Morte · Chefe final":"Criatura das Fendas"}</p>
              <h3 className="relative font-display text-xl text-white">{enemy.name}</h3>
              <div className="relative mx-auto mt-3 max-w-sm"><div className="mb-1 flex justify-between text-[11px] text-white/60"><span>Vitalidade</span><b>{enemy.hp}/{enemy.maxHp}</b></div><div className="h-2.5 overflow-hidden rounded-full bg-black/70"><div className="h-full rounded-full bg-gradient-to-r from-rose-900 via-red-600 to-orange-300 transition-all" style={{width:`${Math.max(0,enemy.hp/enemy.maxHp*100)}%`}}/></div></div>
              <div className="relative mt-3 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-950/40 px-3 py-1.5 text-[10px] text-amber-100"><Eye className="h-3.5 w-3.5"/>{enemy.intentType==="heavy"?"Ataque pesado":enemy.intentType==="guard"?"Ataque enfraquecido":"Atacará"} · {enemy.intent}</div>
            </div>)}
          </div>
        </div>
        <aside className="rounded-2xl border border-white/10 bg-[#100d14] p-4">
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-white/45">Estado do jogador</p>
          <div className="mt-4 space-y-3">
            <div><div className="flex justify-between text-xs"><span className="text-white/55">Vida do baralho</span><b className="text-rose-200">{total}</b></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-rose-800 to-rose-400" style={{width:`${Math.min(100,total/24*100)}%`}}/></div></div>
            <div className="flex justify-between text-xs"><span className="text-white/50">Bloqueio</span><b className="text-sky-300">{game.block}</b></div>
            <div className="flex justify-between text-xs"><span className="text-white/50">Compra / descarte</span><b>{game.draw.length} / {game.discard.length}</b></div>
            <div className="flex justify-between text-xs"><span className="text-white/50">Exaustão</span><b>{game.exhaust.length}</b></div>
            <div className="flex justify-between text-xs"><span className="text-white/50">Mana gasta</span><b className="text-amber-200">{game.manaSpent}</b></div>
            <div className="flex justify-between text-xs"><span className="text-white/50">Fragmentos</span><b className="text-amber-200">{game.shards}</b></div>
          </div>
          {game.artifacts.length>0&&<div className="mt-4 border-t border-white/10 pt-3"><p className="text-[9px] uppercase tracking-widest text-white/40">Relíquias</p><div className="mt-2 flex flex-wrap gap-1">{game.artifacts.map(a=><span key={a} className="rounded-md border border-amber-200/10 bg-amber-950/30 px-2 py-1 text-[9px] text-amber-100">{a}</span>)}</div></div>}
        </aside>
      </div>
      <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,#15101a,#08070b)] p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[.25em] text-rose-200/55">Sua mão</p><p className="text-xs text-white/40">Cada carta possui uma identidade visual própria. Escolha sua sequência.</p></div><span className="rounded-lg border border-amber-200/15 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-100">{game.hand.length} cartas na mão</span></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {game.hand.map((id,index)=><CardFace key={`${id}-${index}`} id={id} disabled={CARDS[id].cost>game.mana} onClick={()=>playCard(index)}/>)}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><div className="text-[11px] text-white/45">Compra: {game.draw.length} · Descarte: {game.discard.length} · Exaustão: {game.exhaust.length}</div><button onClick={endTurn} className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-400 px-5 text-sm font-black text-black shadow-[0_8px_25px_rgba(245,158,11,.18)] transition hover:brightness-110">Encerrar turno <ArrowRight className="h-4 w-4"/></button></div>
      </div>
      <div className="rounded-xl border border-white/10 bg-black/25 p-3"><p className="mb-2 text-[9px] font-black uppercase tracking-[.2em] text-white/35">Crônica da batalha</p>{game.log.map((line,i)=><p key={i} className={`text-xs leading-5 ${i===0?"text-rose-100":"text-white/40"}`}>{line}</p>)}</div>
    </section>}

    {game?.phase === "reward" && <section className="rounded-[26px] border border-amber-200/20 bg-[radial-gradient(ellipse_at_top,rgba(180,83,9,.22),transparent_60%),#100d12] p-5 text-center sm:p-7"><Sparkles className="mx-auto h-9 w-9 text-amber-300"/><p className="mt-2 text-[10px] font-black uppercase tracking-[.3em] text-amber-200/60">Recompensa da expedição</p><h3 className="mt-1 font-display text-3xl text-white">Escolha uma carta</h3><p className="mt-2 text-xs text-white/50">Adicionar cartas aumenta suas opções, mas também aumenta sua vida máxima.</p><div className="mt-5 grid gap-3 sm:grid-cols-3">{rewardChoices.map((id,i)=><CardFace key={`${id}-${i}`} id={id} onClick={()=>chooseReward(id)}/>)}</div><button onClick={()=>chooseReward(null)} className="mt-4 text-xs text-white/45 underline">Seguir sem recompensa</button></section>}

    {game?.phase === "event" && <section className="rounded-[26px] border border-violet-200/20 bg-[radial-gradient(ellipse_at_top,rgba(109,40,217,.22),transparent_60%),#100d15] p-6 text-center"><Moon className="mx-auto h-10 w-10 text-violet-200"/><p className="mt-2 text-[10px] font-black uppercase tracking-[.3em] text-violet-200/60">Encontro desconhecido</p><h3 className="mt-2 font-display text-3xl text-white">{["A Oferta do Sussurrante","Fonte das Memórias","Altar de Cinzas","Visão do Dragão"][game.eventId]}</h3><p className="mx-auto mt-2 max-w-lg text-sm text-white/55">Uma presença antiga oferece poder em troca de lembranças. Toda escolha deixa uma marca no baralho.</p><div className="mx-auto mt-5 grid max-w-xl gap-3 sm:grid-cols-2">{game.eventChoices.map((choice,i)=><button key={choice} onClick={()=>chooseEvent(i)} className="rounded-xl border border-violet-200/20 bg-violet-950/35 p-4 text-sm text-violet-50 transition hover:border-amber-200/50 hover:bg-violet-900/40">{choice}</button>)}</div></section>}

    {game?.phase === "shop" && <section className="rounded-[26px] border border-amber-200/20 bg-[radial-gradient(ellipse_at_top,rgba(120,53,15,.25),transparent_60%),#100d12] p-6"><div className="text-center"><Store className="mx-auto h-9 w-9 text-amber-200"/><p className="mt-2 text-[10px] font-black uppercase tracking-[.3em] text-amber-200/60">Mercador das Fendas</p><h3 className="mt-1 font-display text-3xl text-white">Troque fragmentos</h3><p className="mt-2 text-xs text-white/50">Você tem {game.shards} fragmentos de sangue.</p></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{[{id:"heal" as const,cost:3,title:"Recuperar memórias",desc:"Devolve até 4 cartas do descarte ao baralho."},{id:"remove" as const,cost:4,title:"Apagar uma fraqueza",desc:"Remove uma carta comum do seu baralho."},{id:"card" as const,cost:5,title:"Sentença antiga",desc:"Adiciona Sentença ao baralho."}].map(item=><button key={item.id} disabled={game.shards<item.cost || (item.id==="heal" && game.discard.length===0) || (item.id==="remove" && game.draw.length<=1)} onClick={()=>shopBuy(item.id)} className="rounded-xl border border-amber-200/15 bg-black/30 p-4 text-left transition hover:border-amber-200/50 disabled:opacity-35"><b className="text-sm text-amber-100">{item.title}</b><p className="mt-1 text-xs text-white/45">{item.desc}</p><span className="mt-3 inline-block text-xs font-bold text-amber-300">{item.cost} fragmentos</span></button>)}</div><div className="mt-5 text-center"><button onClick={()=>setGame(nextMap(game))} className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-black">Sair da loja <ArrowRight className="ml-1 inline h-4 w-4"/></button></div></section>}

    {game?.phase === "victory" && <section className="overflow-hidden rounded-[28px] border border-amber-200/25 bg-[radial-gradient(ellipse_at_center,rgba(217,119,6,.2),transparent_60%),#100d12] p-8 text-center"><Crown className="mx-auto h-14 w-14 text-amber-300"/><p className="mt-3 text-[10px] font-black uppercase tracking-[.35em] text-amber-200/60">A última fenda se fechou</p><h3 className="mt-2 font-display text-4xl text-amber-50">{game.escaped?"Você escapou da Morte":"A Morte foi vencida"}</h3><p className="mt-2 text-sm text-white/55">{game.escaped?"Você escolheu abandonar a última rota e sobreviveu para lutar outro dia.":`Você terminou a expedição com ${total} cartas de vida e ${game.kills} criaturas derrotadas.`}</p><button onClick={()=>setGame(null)} className="mt-6 rounded-xl bg-amber-500 px-6 py-3 font-bold text-black">Voltar ao santuário</button></section>}
    {game?.phase === "defeat" && <section className="rounded-[28px] border border-rose-300/20 bg-[radial-gradient(ellipse_at_center,rgba(159,18,57,.2),transparent_60%),#10080e] p-8 text-center"><Skull className="mx-auto h-14 w-14 text-rose-300"/><p className="mt-3 text-[10px] font-black uppercase tracking-[.35em] text-rose-200/60">Todas as lembranças foram consumidas</p><h3 className="mt-2 font-display text-4xl text-rose-50">A Fenda venceu</h3><p className="mt-2 text-sm text-white/55">Sua expedição terminou após {game.kills} abates. A Morte não precisou sequer desembainhar a foice.</p><button onClick={()=>setGame(null)} className="mt-6 rounded-xl bg-rose-700 px-6 py-3 font-bold text-white">Voltar ao santuário</button></section>}
    {notice && <p role="status" className="rounded-xl border border-amber-300/20 bg-amber-950/30 px-4 py-2 text-xs text-amber-100">{notice}</p>}
  </div>;
}
