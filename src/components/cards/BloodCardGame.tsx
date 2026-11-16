import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight, Crown, Heart, Moon, Skull, Sparkles, Swords, Store, Eye, Zap, Shield,
  Footprints, ScrollText, Gem, Compass, RefreshCw, Crosshair, AlertTriangle, Flame,
  Layers, ChevronRight, Check
} from "lucide-react";

// ==========================================
// TIPOS E DEFINIÇÕES
// ==========================================

export type ArchetypeId = "blood" | "bastion" | "warlock";
export type CardId =
  | "strike" | "guard" | "cycle_strike" | "defensive_stance"
  | "blood_lance" | "water_blade" | "impure_heart" | "blood_siphon" | "rend_flesh" | "crimson_offering"
  | "soul_bastion" | "ardil" | "iron_spikes" | "shield_slam" | "unyielding" | "last_second"
  | "rift_step" | "chain" | "dark_pact" | "astral_purge" | "void_echo" | "execution"
  | "corruption" | "mad_draconate" | "veil_parasite";

export type CardType = "Ataque" | "Defesa" | "Habilidade" | "Magia" | "Maldição" | "Lendária";
export type CardDef = {
  name: string;
  cost: number;
  type: CardType;
  text: string;
  rarity: "Comum" | "Incomum" | "Rara" | "Épica" | "Lendária" | "Maldição" | "Secreta";
  art: string;
  archetype?: ArchetypeId;
};
export type EnemyMechanic = "none" | "lifesteal" | "parasite" | "enrage" | "buffer" | "death_reap";
export type Enemy = {
  id: string; name: string; hp: number; maxHp: number; attack: number; intent: number;
  intentType: "attack" | "heavy" | "guard" | "buff" | "curse";
  mechanic: EnemyMechanic; block: number; boss?: boolean; kind: string;
};
export type NodeType = "monster" | "elite" | "event" | "shop" | "boss" | "escape";
export type Phase = "intro" | "map" | "battle" | "reward" | "event" | "shop" | "victory" | "defeat";
export type Game = {
  phase: Phase; archetype: ArchetypeId; zone: number; step: number; node: NodeType | null;
  draw: CardId[]; hand: CardId[]; discard: CardId[]; exhaust: CardId[];
  enemies: Enemy[]; selectedEnemyId: string | null;
  mana: number; maxMana: number; manaSpent: number; block: number; spikes: number; turn: number;
  log: string[]; artifacts: string[]; corruptionUsed: number; dragonUnlocked: boolean; bleed: number;
  lastPlayed: CardId | null; hannaUsed: boolean; skullUsed: boolean;
  kills: number; bladeKills: number; bladeEvolved: boolean; shards: number;
  mapOptions: NodeType[]; eventId: number; eventChoices: string[]; escaped: boolean;
  floatingText: { text: string; color: string; id: number } | null;
};
export type Progress = { kills: number; bladeKills: number; bladeEvolved: boolean; wins: number };

// ==========================================
// COMPÊNDIO DE CARTAS
// ==========================================

export const CARDS: Record<CardId, CardDef> = {
  strike: { name: "Golpe Rúnico", cost: 1, type: "Ataque", text: "Causa 7 de dano ao alvo.", rarity: "Comum", art: "strike" },
  guard: { name: "Defesa Instintiva", cost: 1, type: "Defesa", text: "Ganhe 8 de bloqueio.", rarity: "Comum", art: "guard" },
  cycle_strike: { name: "Golpe Fluido", cost: 1, type: "Ataque", text: "Causa 5 de dano. Compre 1 carta.", rarity: "Comum", art: "cycle" },
  defensive_stance: { name: "Postura Firme", cost: 1, type: "Defesa", text: "Ganhe 6 de bloqueio e 2 de Espinhos.", rarity: "Comum", art: "spikes" },
  water_blade: { name: "Lâmina d'Água", cost: 1, type: "Ataque", text: "Causa 9 de dano. Derrote 100 monstros na expedição para evoluir para Lança de Sangue.", rarity: "Rara", art: "water_blade", archetype: "blood" },
  blood_lance: { name: "Lança de Sangue", cost: 1, type: "Ataque", text: "Causa 16 de dano e aplica 5 de sangramento por 2 turnos.", rarity: "Lendária", art: "blood_lance", archetype: "blood" },
  impure_heart: { name: "Coração Impuro", cost: 0, type: "Ataque", text: "Sacrifique 1 carta do baralho de vida para causar 14 de dano.", rarity: "Épica", art: "impure_heart", archetype: "blood" },
  blood_siphon: { name: "Sifão Carmesim", cost: 1, type: "Ataque", text: "Causa 7 de dano. Se derrotar o alvo ou causar dano desprotegido, recupera 1 carta do descarte.", rarity: "Incomum", art: "blood_siphon", archetype: "blood" },
  rend_flesh: { name: "Lacerar", cost: 1, type: "Ataque", text: "Causa 8 de dano. Se o alvo estiver sangrando, causa dano em dobro.", rarity: "Incomum", art: "rend", archetype: "blood" },
  crimson_offering: { name: "Oferenda Rubra", cost: 0, type: "Habilidade", text: "Pague 2 cartas de vida. Ganhe 2 de mana e compre 2 cartas.", rarity: "Rara", art: "offering", archetype: "blood" },
  soul_bastion: { name: "Bastião das Almas", cost: 2, type: "Defesa", text: "Ganhe 16 de bloqueio e 4 de Espinhos neste combate.", rarity: "Incomum", art: "soul_bastion", archetype: "bastion" },
  ardil: { name: "Ardil Espelhado", cost: 1, type: "Defesa", text: "Bloqueia o próximo golpe e rebate 100% do dano iminente ao atacante.", rarity: "Épica", art: "ardil", archetype: "bastion" },
  iron_spikes: { name: "Muralha de Espinhos", cost: 1, type: "Defesa", text: "Ganhe 9 de bloqueio e aplique 3 de Espinhos adicionais.", rarity: "Comum", art: "iron_spikes", archetype: "bastion" },
  shield_slam: { name: "Impacto de Escudo", cost: 1, type: "Ataque", text: "Causa dano igual ao seu Bloqueio atual.", rarity: "Incomum", art: "shield_slam", archetype: "bastion" },
  unyielding: { name: "Inabalável", cost: 2, type: "Habilidade", text: "Ganhe 12 de bloqueio que NÃO decai no próximo turno.", rarity: "Rara", art: "unyielding", archetype: "bastion" },
  last_second: { name: "Último Segundo", cost: 1, type: "Defesa", text: "Ganhe 11 de bloqueio e recupere 1 carta do descarte.", rarity: "Incomum", art: "last_second", archetype: "bastion" },
  rift_step: { name: "Passo da Fenda", cost: 0, type: "Magia", text: "Ganhe 4 de bloqueio, 1 de mana temporária e compre 1 carta.", rarity: "Rara", art: "rift_step", archetype: "warlock" },
  chain: { name: "Correntes do Além", cost: 2, type: "Magia", text: "Causa 6 de dano a todos os inimigos e reduz o ataque deles pela metade no próximo turno.", rarity: "Incomum", art: "chain", archetype: "warlock" },
  dark_pact: { name: "Pacto de Sangue", cost: 0, type: "Magia", text: "Exaure 1 carta da sua mão. Devolva 2 cartas do descarte para o baralho de vida.", rarity: "Rara", art: "dark_pact", archetype: "warlock" },
  astral_purge: { name: "Purga Astral", cost: 1, type: "Magia", text: "Causa 10 de dano. Se o alvo tiver bloqueio, rompe todo o bloqueio primeiro.", rarity: "Incomum", art: "purge", archetype: "warlock" },
  void_echo: { name: "Eco do Vazio", cost: 1, type: "Magia", text: "Repete o efeito da última carta jogada neste turno.", rarity: "Épica", art: "echo", archetype: "warlock" },
  execution: { name: "Sentença da Fenda", cost: 2, type: "Ataque", text: "Causa 18 de dano. Causa +12 contra inimigos abaixo de 40% de vida.", rarity: "Épica", art: "execution", archetype: "warlock" },
  corruption: { name: "Corrupção", cost: 0, type: "Maldição", text: "Ao usar: exaure e consome 1 carta de vida. Se terminar o turno na mão: devora 3 cartas.", rarity: "Maldição", art: "corruption" },
  mad_draconate: { name: "Draconato Louco", cost: 0, type: "Lendária", text: "Causa 10× a mana total gasta neste combate a TODOS os inimigos. Exaure.", rarity: "Secreta", art: "mad_draconate" },
  veil_parasite: { name: "Larva Parasita", cost: 1, type: "Maldição", text: "Pague 1 de mana para queimar esta larva, ou perca 2 cartas de vida ao encerrar o turno.", rarity: "Maldição", art: "parasite" },
};

export const ARTIFACTS = [
  { id: "Semente do Mal", icon: "✹", name: "Semente do Mal", desc: "Adiciona 6 Corrupções ao baralho. Use todas as 6 para despertar o lendário Draconato Louco." },
  { id: "Véu de Hanna", icon: "☽", name: "Véu de Hanna", desc: "Uma vez por combate, a presença de Hanna impede o primeiro golpe letal ou dano ao baralho." },
  { id: "Crânio de Rogério", icon: "☠", name: "Crânio de Rogério", desc: "Uma vez por combate, após perder 3+ cartas num único impacto, devolve a última carta jogada à mão." },
  { id: "Pena do Corvo Carmesim", icon: "🪶", name: "Pena do Corvo", desc: "Inicia todo combate com +1 de mana e 4 de bloqueio gratuito." },
];

export const ARCHETYPES: { id: ArchetypeId; name: string; subtitle: string; desc: string; icon: string; border: string; bg: string }[] = [
  { id: "blood", name: "Lâmina de Sangue", subtitle: "Sacrifício & Vampirismo", desc: "Causa danos colossais pagando cartas do próprio baralho de vida e recuperando com sangramento.", icon: "🩸", border: "border-rose-500/50 hover:border-rose-400", bg: "from-rose-950/60 to-black/80" },
  { id: "bastion", name: "Sentinela do Breu", subtitle: "Armadura & Espinhos", desc: "Especialista em bloqueios impenetráveis, retaliação com espinhos cósmicos e esmagamentos de escudo.", icon: "🛡️", border: "border-sky-500/50 hover:border-sky-400", bg: "from-sky-950/60 to-black/80" },
  { id: "warlock", name: "Bruxo das Fendas", subtitle: "Manipulação de Baralho", desc: "Recicla cartas do descarte de volta para a vida, amplifica mana e conjura maldições cósmicas.", icon: "🔮", border: "border-purple-500/50 hover:border-purple-400", bg: "from-purple-950/60 to-black/80" },
];

export const ENCOUNTERS: { name: string; hp: number; attack: number; kind: string; mechanic: EnemyMechanic }[][] = [
  [
    { name: "Carniçal das Fendas", hp: 28, attack: 5, kind: "ghoul", mechanic: "lifesteal" },
    { name: "Larvas do Véu", hp: 16, attack: 3, kind: "swarm", mechanic: "parasite" },
    { name: "Cão de Cinzas", hp: 24, attack: 4, kind: "hound", mechanic: "none" },
    { name: "Viúva do Breu", hp: 22, attack: 5, kind: "widow", mechanic: "none" },
    { name: "Coveiro Errante", hp: 36, attack: 4, kind: "gravedigger", mechanic: "buffer" },
  ],
  [
    { name: "Cavaleiro sem Rosto", hp: 44, attack: 7, kind: "knight", mechanic: "buffer" },
    { name: "Monge Oco", hp: 32, attack: 5, kind: "cultist", mechanic: "lifesteal" },
    { name: "Aracnídeo Rubro", hp: 28, attack: 6, kind: "spider", mechanic: "parasite" },
    { name: "Carrilhão Profano", hp: 40, attack: 6, kind: "bell", mechanic: "none" },
    { name: "Dama do Véu", hp: 36, attack: 8, kind: "veil", mechanic: "buffer" },
  ],
  [
    { name: "Arauto da Ruína", hp: 62, attack: 9, kind: "herald", mechanic: "enrage" },
    { name: "Sentinela Partida", hp: 46, attack: 7, kind: "sentinel", mechanic: "buffer" },
    { name: "Devorador de Ecos", hp: 52, attack: 8, kind: "devourer", mechanic: "lifesteal" },
    { name: "Arauto das Mil Vozes", hp: 58, attack: 9, kind: "voices", mechanic: "parasite" },
    { name: "Carrasco da Catedral", hp: 68, attack: 8, kind: "executioner", mechanic: "enrage" },
  ],
];
export const ZONES = ["Campos das Cinzas", "Catedral do Sangue", "Abismo Sem Lua"];

// ==========================================
// FUNÇÕES UTILITÁRIAS
// ==========================================

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const totalLife = (g: Game) =>
  g.draw.length + g.hand.filter(c => c !== "mad_draconate" && c !== "veil_parasite").length + g.discard.length;

const log = (g: Game, message: string): Game => ({ ...g, log: [message, ...g.log].slice(0, 10) });

function createEnemy(name: string, hp: number, attack: number, id: string, kind: string, mechanic: EnemyMechanic = "none", boss = false): Enemy {
  return { id, name, hp, maxHp: hp, attack, intent: attack, intentType: "attack", mechanic, block: 0, boss, kind };
}

function calculateEnemyIntent(enemy: Enemy, turn: number, playerLife: number): Enemy {
  let intentType: Enemy["intentType"] = "attack";
  let intent = enemy.attack;
  if (enemy.boss) {
    const bossCycle = turn % 4;
    if (bossCycle === 1) { intentType = "heavy"; intent = enemy.attack + 5; }
    else if (bossCycle === 2) { intentType = "buff"; intent = 8; }
    else if (bossCycle === 3) { intentType = "curse"; intent = enemy.attack; }
    else { intentType = "attack"; intent = enemy.attack + 2; }
    return { ...enemy, intentType, intent };
  }
  if (enemy.mechanic === "enrage" && playerLife <= 12) return { ...enemy, intentType: "heavy", intent: Math.ceil(enemy.attack * 1.5) };
  const cycle = turn % 3;
  if (cycle === 0) { intentType = "heavy"; intent = enemy.attack + 3; }
  else if (cycle === 2 && (enemy.mechanic === "buffer" || enemy.hp < enemy.maxHp * 0.4)) { intentType = "guard"; intent = Math.max(3, Math.ceil(enemy.attack * 0.6)); }
  return { ...enemy, intentType, intent };
}

function freshDeckForArchetype(archetype: ArchetypeId, progress: Progress, hasSeed: boolean): CardId[] {
  let baseDeck: CardId[] = [];
  if (archetype === "blood") {
    baseDeck = ["strike", "strike", "strike", "guard", "guard", "cycle_strike", "impure_heart", "blood_siphon", "rend_flesh", "crimson_offering", progress.bladeEvolved ? "blood_lance" : "water_blade"];
  } else if (archetype === "bastion") {
    baseDeck = ["strike", "strike", "guard", "guard", "guard", "defensive_stance", "iron_spikes", "shield_slam", "soul_bastion", "unyielding", "last_second"];
  } else {
    baseDeck = ["strike", "strike", "guard", "guard", "rift_step", "chain", "dark_pact", "astral_purge", "void_echo", "execution", "cycle_strike"];
  }
  if (hasSeed) baseDeck = [...baseDeck, "corruption", "corruption", "corruption", "corruption", "corruption", "corruption"];
  return baseDeck;
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
    const drawCandidates = n.draw.map((c, i) => (c !== "corruption" && c !== "mad_draconate" ? i : -1)).filter(i => i >= 0);
    const discardCandidates = n.discard.map((c, i) => (c !== "corruption" && c !== "mad_draconate" ? i : -1)).filter(i => i >= 0);
    const handCandidates = n.hand.map((c, i) => (c !== "corruption" && c !== "mad_draconate" && c !== "veil_parasite" ? i : -1)).filter(i => i >= 0);
    if (drawCandidates.length) n.draw.splice(drawCandidates[Math.floor(Math.random() * drawCandidates.length)], 1);
    else if (discardCandidates.length) n.discard.splice(discardCandidates[Math.floor(Math.random() * discardCandidates.length)], 1);
    else if (handCandidates.length) n.hand.splice(handCandidates[Math.floor(Math.random() * handCandidates.length)], 1);
    else break;
    remaining--;
  }
  if (totalLife(n) <= 0) n.phase = "defeat";
  return n;
}

function routeOptions(step: number): NodeType[] {
  if (step >= 9) return ["boss", "escape"];
  const pool: NodeType[] = ["monster", "monster", "event", "shop", "elite"];
  if (step >= 6) pool.push("boss");
  return shuffle(pool).slice(0, 3);
}

function makeGame(archetype: ArchetypeId, artifacts: string[], progress: Progress): Game {
  const deck = shuffle(freshDeckForArchetype(archetype, progress, artifacts.includes("Semente do Mal")));
  const maxMana = artifacts.includes("Pena do Corvo Carmesim") ? 4 : 3;
  return {
    phase: "map", archetype, zone: 0, step: 0, node: null, draw: deck, hand: [], discard: [], exhaust: [],
    enemies: [], selectedEnemyId: null, mana: maxMana, maxMana, manaSpent: 0, block: 0, spikes: 0, turn: 1,
    log: ["A expedição começou. Seu baralho é sua vida física."], artifacts, corruptionUsed: 0, dragonUnlocked: false,
    bleed: 0, lastPlayed: null, hannaUsed: false, skullUsed: false, kills: progress.kills, bladeKills: progress.bladeKills,
    bladeEvolved: progress.bladeEvolved, shards: 0, mapOptions: routeOptions(0), eventId: 0, eventChoices: [],
    escaped: false, floatingText: null,
  };
}

function startBattle(g: Game, node: NodeType): Game {
  const tier = Math.min(2, Math.floor(g.step / 3));
  let enemies: Enemy[] = [];
  if (node === "boss") enemies = [createEnemy("Hanna, Deusa da Morte", 130, 9, "hanna", "hanna", "death_reap", true)];
  else if (node === "elite") {
    const elites = [
      { name: "Carrasco de Cinzas", hp: 70, atk: 9, kind: "executioner", mechanic: "enrage" as const },
      { name: "Bispo Rubro", hp: 82, atk: 11, kind: "cultist", mechanic: "buffer" as const },
      { name: "Arauto Corrompido", hp: 96, atk: 12, kind: "herald", mechanic: "parasite" as const },
    ];
    const pick = elites[tier];
    enemies = [createEnemy(pick.name, pick.hp, pick.atk, "elite", pick.kind, pick.mechanic)];
  } else {
    const pool = shuffle(ENCOUNTERS[tier]);
    const count = node === "monster" && g.step % 2 === 0 ? 2 : 1;
    enemies = pool.slice(0, count).map((e, idx) => createEnemy(e.name, e.hp + tier * 10, e.attack + tier * 2, `${e.kind}_${idx}`, e.kind, e.mechanic));
  }
  const startBlock = g.artifacts.includes("Pena do Corvo Carmesim") ? 4 : 0;
  const initialPlayerLife = totalLife(g);
  let next: Game = {
    ...g, phase: "battle", node, enemies: enemies.map(e => calculateEnemyIntent(e, 1, initialPlayerLife)),
    selectedEnemyId: enemies[0]?.id || null, hand: [], mana: g.maxMana, manaSpent: 0, block: startBlock, spikes: 0,
    turn: 1, corruptionUsed: 0, dragonUnlocked: false, hannaUsed: false, skullUsed: false, bleed: 0, floatingText: null,
  };
  next = drawCards(next, 5);
  return log(next, node === "boss" ? "Hanna, a Deusa da Morte, desce sobre a Fenda. A foice dela queima com sede de almas." : node === "elite" ? "Uma aura aterradora esmaga o ambiente. Um Elite bloqueia a passagem." : "As criaturas do abismo surgem da escuridão!");
}

function nextMap(g: Game): Game {
  const step = g.step + 1;
  return { ...g, phase: "map", step, zone: Math.min(2, Math.floor(step / 3)), node: null, mapOptions: routeOptions(step), enemies: [], selectedEnemyId: null, hand: [], mana: g.maxMana, manaSpent: 0, block: 0, spikes: 0, floatingText: null };
}

// ==========================================
// ARTE E ILUSTRAÇÃO SVG DAS CRIATURAS
// ==========================================

function MonsterGraphic({ kind, boss = false }: { kind: string; boss?: boolean }) {
  if (boss) return (
    <svg viewBox="0 0 120 120" className="h-28 w-28 drop-shadow-[0_0_24px_rgba(225,29,72,.6)]" aria-hidden="true">
      <circle cx="60" cy="60" r="50" fill="#180710" stroke="#f43f5e" strokeWidth="2" strokeDasharray="4 6" opacity=".5"/>
      <path d="M25 95 C 40 40, 70 20, 105 18 C 85 35, 75 55, 60 70 L 25 95 Z" fill="#e11d48" opacity=".8"/>
      <path d="M20 100 L 70 50" stroke="#fecdd3" strokeWidth="4" strokeLinecap="round"/>
      <path d="M40 50 Q 60 22 80 50 Q 88 85 60 92 Q 32 85 40 50 Z" fill="#09050d" stroke="#f43f5e" strokeWidth="2.5"/>
      <ellipse cx="52" cy="54" rx="4" ry="2" fill="#fda4af"/><ellipse cx="68" cy="54" rx="4" ry="2" fill="#fda4af"/>
      <circle cx="52" cy="54" r="1.5" fill="#fff"/><circle cx="68" cy="54" r="1.5" fill="#fff"/>
      <path d="M45 76 Q 60 84 75 76" stroke="#f43f5e" strokeWidth="1.5" fill="none"/>
    </svg>
  );
  switch (kind) {
    case "ghoul": return <svg viewBox="0 0 100 100" className="h-20 w-20 text-rose-400" aria-hidden="true"><path d="M35 30 Q 50 15 65 30 Q 75 55 60 80 Q 40 80 35 30 Z" fill="#1f101b" stroke="#fb7185" strokeWidth="2"/><path d="M25 45 L 35 55 M75 45 L 65 55" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round"/><circle cx="43" cy="38" r="3" fill="#ffe4e6"/><circle cx="57" cy="38" r="3" fill="#ffe4e6"/><path d="M42 55 L 45 62 L 50 55 L 55 62 L 58 55" fill="#fff"/></svg>;
    case "swarm": case "parasite": return <svg viewBox="0 0 100 100" className="h-20 w-20 text-purple-400" aria-hidden="true"><circle cx="35" cy="40" r="12" fill="#2e1065" stroke="#c084fc" strokeWidth="2"/><circle cx="65" cy="45" r="14" fill="#2e1065" stroke="#c084fc" strokeWidth="2"/><circle cx="48" cy="68" r="16" fill="#3b0764" stroke="#e879f9" strokeWidth="2.5"/><circle cx="48" cy="66" r="3" fill="#fff"/><circle cx="35" cy="39" r="2" fill="#fff"/><circle cx="65" cy="44" r="2" fill="#fff"/><path d="M30 75 Q 48 90 66 75" stroke="#f0abfc" strokeWidth="2" fill="none"/></svg>;
    case "hound": return <svg viewBox="0 0 100 100" className="h-20 w-20 text-amber-500" aria-hidden="true"><path d="M20 65 L 40 30 L 60 30 L 80 50 L 70 75 L 45 70 Z" fill="#1c120c" stroke="#f59e0b" strokeWidth="2"/><polygon points="35,20 45,30 30,35" fill="#d97706"/><polygon points="55,20 65,30 50,35" fill="#d97706"/><circle cx="60" cy="45" r="3" fill="#fde68a"/><path d="M65 60 L 78 58 L 70 68 Z" fill="#b45309"/></svg>;
    case "knight": case "executioner": return <svg viewBox="0 0 100 100" className="h-20 w-20 text-slate-300" aria-hidden="true"><rect x="30" y="25" width="40" height="50" rx="8" fill="#18181b" stroke="#cbd5e1" strokeWidth="2.5"/><line x1="50" y1="30" x2="50" y2="65" stroke="#f43f5e" strokeWidth="3"/><line x1="36" y1="42" x2="64" y2="42" stroke="#f43f5e" strokeWidth="3"/><path d="M25 80 L 75 80 L 65 95 L 35 95 Z" fill="#09090b" stroke="#94a3b8" strokeWidth="2"/></svg>;
    default: return <svg viewBox="0 0 100 100" className="h-20 w-20 text-violet-400" aria-hidden="true"><circle cx="50" cy="50" r="32" fill="#170f26" stroke="#a855f7" strokeWidth="2.5"/><ellipse cx="50" cy="50" rx="20" ry="10" fill="#3b0764"/><circle cx="50" cy="50" r="6" fill="#f43f5e"/><circle cx="52" cy="48" r="2" fill="#fff"/><path d="M20 50 Q 50 15 80 50 Q 50 85 20 50" fill="none" stroke="#d8b4fe" strokeWidth="2" strokeDasharray="3 4"/></svg>;
  }
}

// ==========================================
// VISUAL DAS CARTAS (GÓTICO / RUNAS)
// ==========================================

function cardTheme(id: CardId) {
  const themes: Record<CardId, string> = {
    strike: "from-slate-800 via-zinc-950 to-black border-slate-400/60 shadow-slate-950/80",
    guard: "from-sky-900 via-slate-950 to-black border-sky-400/60 shadow-sky-950/80",
    cycle_strike: "from-cyan-900 via-zinc-950 to-black border-cyan-400/60 shadow-cyan-950/80",
    defensive_stance: "from-teal-900 via-zinc-950 to-black border-teal-400/60 shadow-teal-950/80",
    water_blade: "from-blue-800 via-indigo-950 to-black border-cyan-300/80 shadow-cyan-950/80",
    blood_lance: "from-rose-900 via-red-950 to-black border-rose-400/80 shadow-rose-950/80",
    impure_heart: "from-red-900 via-rose-950 to-black border-red-400/80 shadow-rose-950/80",
    blood_siphon: "from-rose-800 via-zinc-950 to-black border-rose-400/60 shadow-rose-950/80",
    rend_flesh: "from-red-950 via-zinc-950 to-black border-red-500/70 shadow-red-950/80",
    crimson_offering: "from-rose-950 via-purple-950 to-black border-amber-400/70 shadow-amber-950/80",
    soul_bastion: "from-emerald-900 via-zinc-950 to-black border-emerald-400/70 shadow-emerald-950/80",
    ardil: "from-violet-900 via-indigo-950 to-black border-violet-400/80 shadow-violet-950/80",
    iron_spikes: "from-slate-800 via-stone-950 to-black border-slate-300/70 shadow-stone-950/80",
    shield_slam: "from-sky-800 via-blue-950 to-black border-sky-300/70 shadow-sky-950/80",
    unyielding: "from-amber-900 via-stone-950 to-black border-amber-300/70 shadow-amber-950/80",
    last_second: "from-amber-800 via-orange-950 to-black border-amber-400/60 shadow-amber-950/80",
    rift_step: "from-indigo-800 via-violet-950 to-black border-violet-300/70 shadow-violet-950/80",
    chain: "from-stone-800 via-neutral-950 to-black border-stone-300/70 shadow-stone-950/80",
    dark_pact: "from-purple-900 via-black to-black border-fuchsia-400/70 shadow-fuchsia-950/80",
    astral_purge: "from-blue-900 via-indigo-950 to-black border-sky-400/70 shadow-blue-950/80",
    void_echo: "from-fuchsia-900 via-purple-950 to-black border-purple-300/80 shadow-purple-950/80",
    execution: "from-orange-900 via-red-950 to-black border-orange-400/80 shadow-orange-950/80",
    corruption: "from-fuchsia-950 via-purple-950 to-black border-fuchsia-400 shadow-fuchsia-950/90",
    mad_draconate: "from-sky-700 via-blue-950 to-black border-sky-200 shadow-sky-900/90 ring-1 ring-sky-300/60",
    veil_parasite: "from-lime-950 via-zinc-950 to-black border-lime-500/70 shadow-lime-950/90",
  };
  return themes[id] || "from-zinc-800 to-black border-white/20";
}

function CardArt({ id }: { id: CardId }) {
  const shapes: Record<CardId, ReactNode> = {
    strike: <><path d="M20 74 76 18M31 84 87 28" stroke="#e2e8f0" strokeWidth="5" strokeLinecap="round"/><path d="m65 18 12-5-5 12" fill="none" stroke="#fff" strokeWidth="3"/></>,
    guard: <><path d="M50 9 82 22 78 57Q72 79 50 91 28 79 22 57L18 22Z" fill="#0e7490" stroke="#a5f3fc" strokeWidth="3.5"/><path d="m37 50 9 9 19-22" fill="none" stroke="#ecfeff" strokeWidth="4" strokeLinecap="round"/></>,
    cycle_strike: <><path d="M50 20 A 30 30 0 1 1 22 55" fill="none" stroke="#38bdf8" strokeWidth="4"/><polygon points="18,45 22,58 35,52" fill="#38bdf8"/><path d="M38 65 L 62 35" stroke="#fff" strokeWidth="4"/></>,
    defensive_stance: <><path d="M30 30 L 50 15 L 70 30 L 70 65 L 50 85 L 30 65 Z" fill="#115e59" stroke="#5eead4" strokeWidth="3"/><path d="M20 50 L 30 50 M70 50 L 80 50 M50 95 L 50 85" stroke="#99f6e4" strokeWidth="4"/></>,
    water_blade: <><path d="M12 70Q32 10 54 30T90 24Q65 52 79 80Q49 61 28 88Z" fill="#38bdf8" opacity=".75"/><path d="M17 70Q48 18 83 20" fill="none" stroke="#e0f2fe" strokeWidth="4" strokeLinecap="round"/></>,
    blood_lance: <><path d="M50 5 64 34 54 39 80 82 50 70 20 82 46 39 36 34Z" fill="#fecaca" stroke="#f87171" strokeWidth="3"/><path d="M50 25V90" stroke="#7f1d1d" strokeWidth="5"/></>,
    impure_heart: <><path d="M50 83 18 52Q5 28 27 19 42 13 50 32 59 13 75 19 96 28 82 52Z" fill="#be123c" stroke="#fda4af" strokeWidth="3.5"/><path d="m50 32-10 21 12 7-8 15 22-29-13-4 7-10" fill="#ffe4e6" opacity=".8"/></>,
    blood_siphon: <><path d="M50 8C32 34 20 47 20 63a30 30 0 0 0 60 0C80 47 68 34 50 8Z" fill="#be123c" stroke="#fda4af" strokeWidth="3"/><path d="M50 27v43m-13-14 13 14 13-14" stroke="#fff1f2" strokeWidth="4" fill="none"/></>,
    rend_flesh: <><path d="M25 25 L 75 75 M35 20 L 85 70 M15 30 L 65 80" stroke="#ef4444" strokeWidth="4" strokeLinecap="round"/><circle cx="50" cy="50" r="15" fill="#7f1d1d" opacity=".4"/></>,
    crimson_offering: <><circle cx="50" cy="50" r="30" fill="none" stroke="#f43f5e" strokeWidth="3" strokeDasharray="5 5"/><polygon points="50,25 65,65 30,40 70,40 35,65" fill="#fda4af"/></>,
    soul_bastion: <><path d="M50 8 82 28v30L50 90 18 58V28Z" fill="#065f46" stroke="#a7f3d0" strokeWidth="3.5"/><path d="M50 34v31m-12-15h24" stroke="#ecfdf5" strokeWidth="4"/></>,
    ardil: <><path d="M50 12 84 50 50 88 16 50Z" fill="#312e81" stroke="#c4b5fd" strokeWidth="3.5"/><path d="M34 50h32M50 34v32" stroke="#ede9fe" strokeWidth="4"/></>,
    iron_spikes: <><path d="M50 15 L 75 75 L 25 75 Z" fill="#334155" stroke="#cbd5e1" strokeWidth="3"/><path d="M50 15 L 50 75 M38 45 L 62 45" stroke="#94a3b8" strokeWidth="3"/></>,
    shield_slam: <><circle cx="50" cy="50" r="28" fill="#0369a1" stroke="#bae6fd" strokeWidth="4"/><path d="M35 50 L 65 50 M50 35 L 50 65" stroke="#fff" strokeWidth="4"/></>,
    unyielding: <><rect x="25" y="25" width="50" height="50" rx="6" fill="#78350f" stroke="#fde68a" strokeWidth="3.5"/><path d="M40 50 L 60 50" stroke="#fff" strokeWidth="4"/></>,
    last_second: <><path d="M32 13h36l-8 29 8 45H32l8-45Z" fill="#92400e" stroke="#fde68a" strokeWidth="3.5"/><path d="M42 40h16L50 55Z M42 61h16l-8 12Z" fill="#fef3c7"/></>,
    rift_step: <><path d="M20 18 77 15 58 42 84 48 23 84 43 55 16 49Z" fill="#4338ca" stroke="#c4b5fd" strokeWidth="3"/><path d="m29 49 42-22" stroke="#e0e7ff" strokeWidth="3"/></>,
    chain: <><path d="M30 27 21 36Q13 44 22 53L29 60Q38 69 47 60L59 48M70 73l9-9q8-8-1-17l-7-7q-9-9-18 0L41 52" stroke="#e7e5e4" strokeWidth="7" fill="none" strokeLinecap="round"/></>,
    dark_pact: <><path d="M25 50 Q 50 20 75 50 T 25 50" fill="#581c87" stroke="#e879f9" strokeWidth="3"/><circle cx="50" cy="50" r="8" fill="#f43f5e"/></>,
    astral_purge: <><path d="M50 10 L 60 40 L 90 50 L 60 60 L 50 90 L 40 60 L 10 50 L 40 40 Z" fill="#0284c7" stroke="#bae6fd" strokeWidth="3"/></>,
    void_echo: <><circle cx="50" cy="50" r="15" fill="none" stroke="#d946ef" strokeWidth="3"/><circle cx="50" cy="50" r="28" fill="none" stroke="#d946ef" strokeWidth="2" strokeDasharray="4 4"/></>,
    execution: <><path d="M50 8 73 36 63 47 80 78 50 68 20 78 37 47 27 36Z" fill="#9a3412" stroke="#fed7aa" strokeWidth="3.5"/><path d="M50 18v58" stroke="#ffedd5" strokeWidth="4"/></>,
    corruption: <><path d="M50 8C18 29 20 64 50 91 80 64 82 29 50 8Z" fill="#701a75" stroke="#f0abfc" strokeWidth="3"/><circle cx="50" cy="50" r="26" fill="none" stroke="#f0abfc" strokeDasharray="3 6" strokeWidth="2"/></>,
    mad_draconate: <><path d="M16 72Q7 32 34 25L28 8 48 20 58 8 63 25Q93 29 84 72L67 60 50 87 33 60Z" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="3"/></>,
    veil_parasite: <><ellipse cx="50" cy="50" rx="22" ry="32" fill="#365314" stroke="#a3e635" strokeWidth="3"/><circle cx="43" cy="40" r="3" fill="#bef264"/><circle cx="57" cy="40" r="3" fill="#bef264"/><path d="M40 60 Q 50 70 60 60" stroke="#ecfccb" strokeWidth="3" fill="none"/></>,
  };
  return <svg viewBox="0 0 100 100" className="h-14 w-14" aria-hidden="true">{shapes[id] || <circle cx="50" cy="50" r="20" fill="#444"/>}</svg>;
}

function CardFace({ id, onClick, disabled, selected = false, fanIndex = 0, totalInHand = 1 }: {
  id: CardId; onClick?: () => void; disabled?: boolean; selected?: boolean; fanIndex?: number; totalInHand?: number;
}) {
  const c = CARDS[id];
  const mid = (totalInHand - 1) / 2;
  const offset = fanIndex - mid;
  const rotationDeg = totalInHand > 3 ? Math.max(-10, Math.min(10, offset * 2.5)) : 0;
  const translateY = totalInHand > 3 ? Math.abs(offset) * 3 : 0;
  const content = (
    <div style={{ transform: `rotate(${rotationDeg}deg) translateY(${translateY}px)` }}
      className={`relative flex h-full min-h-[190px] w-full flex-col overflow-hidden rounded-[14px] border-2 bg-gradient-to-b p-2 shadow-lg transition-all duration-200 ${cardTheme(id)} ${selected ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-[#0b0810]" : ""} ${disabled ? "cursor-not-allowed opacity-40 grayscale-[.6]" : "hover:z-30 hover:-translate-y-4 hover:scale-105 hover:shadow-2xl"}`}>
      <div className="pointer-events-none absolute inset-1 rounded-[12px] border border-white/10"/>
      <div className="relative flex items-center justify-between gap-1">
        <span className="rounded-full border border-white/20 bg-black/60 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">{c.rarity}</span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-amber-300/80 bg-black/85 font-display text-xs font-black text-amber-200 shadow-[0_0_12px_rgba(251,191,36,.3)]">{c.cost}</span>
      </div>
      <div className="relative my-1 flex h-[72px] items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-black/40">
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 50% 50%,rgba(255,255,255,.25),transparent 60%),repeating-linear-gradient(45deg,transparent 0 8px,rgba(255,255,255,.05) 8px 9px)" }}/>
        <CardArt id={id}/>
      </div>
      <h4 className="relative text-center font-display text-[11px] font-bold leading-tight text-white drop-shadow">{c.name}</h4>
      <p className="relative mt-1 min-h-[42px] text-center text-[9px] leading-tight text-white/80">{c.text}</p>
      <div className="relative mt-auto flex items-center justify-between border-t border-white/15 pt-1 text-[8px] font-bold uppercase tracking-wider text-white/50">
        <span>{c.type}</span><span>{c.archetype ? c.archetype.toUpperCase() : "GERAL"}</span>
      </div>
    </div>
  );
  return onClick ? <button type="button" onClick={onClick} disabled={disabled} className="group block text-left outline-none transition-transform disabled:cursor-not-allowed">{content}</button> : content;
}

function NodeIcon({ type }: { type: NodeType }) {
  if (type === "monster") return <Swords className="h-5 w-5"/>;
  if (type === "elite") return <Skull className="h-5 w-5"/>;
  if (type === "event") return <ScrollText className="h-5 w-5"/>;
  if (type === "shop") return <Store className="h-5 w-5"/>;
  if (type === "escape") return <Footprints className="h-5 w-5"/>;
  return <Crown className="h-5 w-5"/>;
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export function BloodCardGame() {
  const [selectedArchetype, setSelectedArchetype] = useState<ArchetypeId>("blood");
  const [selectedArtifacts, setSelectedArtifacts] = useState<string[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const [progress, setProgress] = useState<Progress>({ kills: 0, bladeKills: 0, bladeEvolved: false, wins: 0 });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("gd-koda-bloodcard-v3");
      if (raw) setProgress(JSON.parse(raw));
    } catch { /* Ignora erro de storage */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("gd-koda-bloodcard-v3", JSON.stringify(progress)); } catch { /* Ignora erro de storage */ }
  }, [progress]);

  const begin = () => { setNotice(""); setGame(makeGame(selectedArchetype, selectedArtifacts, progress)); };

  const enterNode = (node: NodeType) => {
    if (!game) return;
    if (node === "escape") {
      setGame({ ...game, phase: "victory", escaped: true, log: ["Você abandonou a última fenda e escapou da perseguição de Hanna."] });
      return;
    }
    if (node === "event") {
      const eventId = Math.floor(Math.random() * 6);
      const choices = [
        ["Entregar 2 cartas de vida para receber 4 fragmentos", "Recusar a oferta e seguir"],
        ["Sacrificar 1 carta e devolver 4 cartas do descarte ao baralho", "Ignorar o altar profano"],
        ["Destruir uma carta básica do baralho", "Ganhar 2 fragmentos"],
        ["Pagar 3 cartas de vida pelo Véu de Hanna", "Sair sem olhar para trás"],
        ["Consumir 2 cartas de vida e aprender Sentença da Fenda", "Fechar o grimório"],
        ["Entregar 3 fragmentos para purificar o baralho", "Não gastar fragmentos"],
      ][eventId];
      setGame({ ...game, phase: "event", node, eventId, eventChoices: choices });
    } else if (node === "shop") setGame({ ...game, phase: "shop", node });
    else setGame(startBattle(game, node));
  };

  const finishBattle = (g: Game) => {
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
    g.shards += g.node === "elite" ? 5 : g.node === "boss" ? 10 : 3;
    const newWins = g.node === "boss" ? progress.wins + 1 : progress.wins;
    setProgress({ kills: g.kills, bladeKills: g.bladeKills, bladeEvolved: g.bladeEvolved, wins: newWins });
    g.phase = g.node === "boss" ? "victory" : "reward";
    return log(g, "Inimigos abatidos! Escolha uma recompensa rúnica.");
  };

  const playCard = (index: number) => {
    if (!game || game.phase !== "battle") return;
    const id = game.hand[index];
    const card = CARDS[id];
    if (!card || card.cost > game.mana) { setNotice("Mana insuficiente para conjurar esta carta."); return; }
    setNotice("");
    let g: Game = { ...game, draw: [...game.draw], hand: [...game.hand], discard: [...game.discard], exhaust: [...game.exhaust], enemies: game.enemies.map(e => ({ ...e })) };
    g.hand.splice(index, 1);
    g.mana -= card.cost;
    g.manaSpent += card.cost;
    const lastBeforePlay = g.lastPlayed;
    g.lastPlayed = id;
    const aliveEnemies = g.enemies.filter(e => e.hp > 0);
    const target = g.enemies.find(e => e.id === g.selectedEnemyId && e.hp > 0) || aliveEnemies[0];
    const damageEnemy = (e: Enemy, amt: number) => {
      let dmg = amt;
      if (e.block > 0) { const absorbed = Math.min(e.block, dmg); e.block -= absorbed; dmg -= absorbed; }
      e.hp = Math.max(0, e.hp - dmg);
    };
    const damageAll = (dmg: number) => g.enemies.forEach(e => { if (e.hp > 0) damageEnemy(e, dmg); });
    const resolveCardEffect = (cardId: CardId, allowEcho = true) => {
      if (cardId === "strike") { if (target) damageEnemy(target, 7); }
      else if (cardId === "guard") g.block += 8;
      else if (cardId === "cycle_strike") { if (target) damageEnemy(target, 5); g = drawCards(g, 1); }
      else if (cardId === "defensive_stance") { g.block += 6; g.spikes += 2; }
      else if (cardId === "water_blade") { if (target) damageEnemy(target, 9); }
      else if (cardId === "blood_lance") { if (target) damageEnemy(target, 16); g.bleed += 5; }
      else if (cardId === "impure_heart") { g = removeLife(g, 1); if (target) damageEnemy(target, 14); }
      else if (cardId === "blood_siphon") {
        if (target) {
          const initialHp = target.hp;
          const initialBlock = target.block;
          damageEnemy(target, 7);
          const unprotectedDamage = Math.max(0, Math.min(7, initialHp) - Math.min(7, initialBlock));
          if ((target.hp <= 0 || unprotectedDamage > 0) && g.discard.length) {
            g.draw.push(g.discard.pop()!);
            g = log(g, "Sifão Carmesim recuperou 1 carta de vida do descarte!");
          }
        }
      } else if (cardId === "rend_flesh") { if (target) damageEnemy(target, g.bleed > 0 ? 16 : 8); }
      else if (cardId === "crimson_offering") {
        g = removeLife(g, 2);
        if (g.phase !== "defeat") { g.mana = Math.min(g.maxMana + 2, g.mana + 2); g = drawCards(g, 2); }
      } else if (cardId === "soul_bastion") { g.block += 16; g.spikes += 4; }
      else if (cardId === "ardil") {
        const incoming = g.enemies.reduce((acc, e) => acc + (e.hp > 0 && e.intentType !== "guard" && e.intentType !== "buff" ? e.intent : 0), 0);
        g.block += incoming;
        g.enemies.forEach(e => { if (e.hp > 0 && e.intentType !== "guard" && e.intentType !== "buff") damageEnemy(e, e.intent); });
        g = log(g, `Ardil rebateu ${incoming} de dano contra os agressores!`);
      } else if (cardId === "iron_spikes") { g.block += 9; g.spikes += 3; }
      else if (cardId === "shield_slam") { if (target) damageEnemy(target, Math.max(5, g.block)); }
      else if (cardId === "unyielding") { g.block += 12; }
      else if (cardId === "last_second") { g.block += 11; if (g.discard.length) g.draw.push(g.discard.pop()!); }
      else if (cardId === "rift_step") { g.block += 4; g.mana = Math.min(g.maxMana + 1, g.mana + 1); g = drawCards(g, 1); }
      else if (cardId === "chain") { damageAll(6); g.enemies = g.enemies.map(e => ({ ...e, intent: Math.max(1, Math.ceil(e.intent * 0.5)) })); }
      else if (cardId === "dark_pact") {
        const recovered = Math.min(2, g.discard.length);
        for (let k = 0; k < recovered; k++) g.draw.push(g.discard.pop()!);
        g = log(g, `Pacto de Sangue recuperou ${recovered} cartas de vida.`);
      } else if (cardId === "astral_purge") { if (target) { target.block = 0; damageEnemy(target, 10); } }
      else if (cardId === "void_echo" && allowEcho) {
        if (lastBeforePlay && lastBeforePlay !== "void_echo") resolveCardEffect(lastBeforePlay, false);
        else g = log(g, "O Eco do Vazio não encontrou uma carta anterior neste turno.");
      } else if (cardId === "execution") { if (target) damageEnemy(target, 18 + (target.hp / target.maxHp <= 0.4 ? 12 : 0)); }
      else if (cardId === "corruption") {
        g.exhaust.push("corruption");
        g = removeLife(g, 1);
        g.corruptionUsed += 1;
        g = log(g, `Corrupção consumida (${g.corruptionUsed}/6).`);
        if (g.corruptionUsed >= 6 && !g.dragonUnlocked) {
          g.dragonUnlocked = true;
          g.hand.push("mad_draconate");
          g = log(g, "★ DRACONATO LOUCO DESPERTOU NA SUA MÃO! ★");
        }
      } else if (cardId === "mad_draconate") {
        const blast = g.manaSpent * 10;
        damageAll(blast);
        g.exhaust.push("mad_draconate");
        g = log(g, `Draconato provocou ${blast} de dano cósmico em área!`);
      } else if (cardId === "veil_parasite") {
        g.exhaust.push("veil_parasite");
        g = log(g, "Você expurgou uma Larva Parasita da sua mão.");
      }
    };
    resolveCardEffect(id);
    if (id !== "corruption" && id !== "mad_draconate" && id !== "veil_parasite") g.discard.push(id);
    if (g.phase === "defeat") { setGame(g); return; }
    if (g.enemies.every(e => e.hp <= 0)) g = finishBattle(g);
    setGame(g);
  };

  const endTurn = () => {
    if (!game || game.phase !== "battle") return;
    let g: Game = { ...game, draw: [...game.draw], hand: [...game.hand], discard: [...game.discard], exhaust: [...game.exhaust], enemies: game.enemies.map(e => ({ ...e })) };
    const unusedCorruption = g.hand.filter(c => c === "corruption").length;
    if (unusedCorruption > 0) {
      g.exhaust.push(...g.hand.filter(c => c === "corruption"));
      g.hand = g.hand.filter(c => c !== "corruption");
      g = removeLife(g, unusedCorruption * 3);
      g = log(g, `A Corrupção devorou ${unusedCorruption * 3} cartas por não ter sido purgada.`);
    }
    const unusedParasites = g.hand.filter(c => c === "veil_parasite").length;
    if (unusedParasites > 0) {
      g.exhaust.push(...g.hand.filter(c => c === "veil_parasite"));
      g.hand = g.hand.filter(c => c !== "veil_parasite");
      g = removeLife(g, unusedParasites * 2);
      g = log(g, `As Larvas Parasitas roeram ${unusedParasites * 2} cartas de vida.`);
    }
    g.discard.push(...g.hand.filter(c => c !== "mad_draconate"));
    g.exhaust.push(...g.hand.filter(c => c === "mad_draconate"));
    g.hand = [];
    if (g.phase === "defeat") { setGame(g); return; }
    if (g.bleed > 0) {
      g.enemies.forEach(e => { if (e.hp > 0) e.hp = Math.max(0, e.hp - g.bleed); });
      g = log(g, `Sangramento causou ${g.bleed} de dano a todas as criaturas.`);
      g.bleed = Math.max(0, g.bleed - 1);
    }
    if (g.enemies.every(e => e.hp <= 0)) { setGame(finishBattle(g)); return; }
    let totalIncomingDamage = 0;
    for (const enemy of g.enemies) {
      if (enemy.hp <= 0) continue;
      if (enemy.intentType === "guard" || enemy.intentType === "buff") {
        enemy.block += enemy.intent;
        g = log(g, `${enemy.name} assumiu postura defensiva (+${enemy.intent} de bloqueio).`);
        continue;
      }
      totalIncomingDamage += enemy.intent;
      if (g.spikes > 0) {
        enemy.hp = Math.max(0, enemy.hp - g.spikes);
        g = log(g, `Espinhos retaliaram ${g.spikes} de dano contra ${enemy.name}.`);
      }
      if (enemy.mechanic === "parasite" && Math.random() > 0.4) {
        g.draw.push("veil_parasite");
        g = log(g, `${enemy.name} cuspiu uma Larva Parasita no seu baralho!`);
      }
    }
    const absorbed = Math.min(g.block, totalIncomingDamage);
    let unblockedDamage = Math.max(0, totalIncomingDamage - g.block);
    if (unblockedDamage > 0 && g.artifacts.includes("Véu de Hanna") && !g.hannaUsed) {
      unblockedDamage = Math.max(0, unblockedDamage - 2);
      g.hannaUsed = true;
      g = log(g, "O Véu de Hanna intercedeu e amortizou 2 de dano mortal.");
    }
    if (unblockedDamage >= 3 && g.artifacts.includes("Crânio de Rogério") && !g.skullUsed && g.lastPlayed) {
      const index = g.discard.lastIndexOf(g.lastPlayed);
      if (index >= 0) {
        g.hand.push(g.discard.splice(index, 1)[0]);
        g.skullUsed = true;
        g = log(g, "O Crânio de Rogério vibrou e devolveu uma carta à sua mão.");
      }
    }
    if (unblockedDamage > 0) {
      g = removeLife(g, unblockedDamage);
      for (const enemy of g.enemies) {
        if (enemy.hp > 0 && enemy.mechanic === "lifesteal") {
          enemy.hp = Math.min(enemy.maxHp, enemy.hp + 3);
          g = log(g, `${enemy.name} drenou seu sangue e recuperou 3 de vida.`);
        }
      }
      g = log(g, `Ataque inimigo: ${totalIncomingDamage} | Bloqueado: ${absorbed} | ${unblockedDamage} cartas perdidas.`);
    } else g = log(g, `Defesa perfeita! Todo o impacto de ${totalIncomingDamage} foi bloqueado.`);
    if (g.phase === "defeat") { setGame(g); return; }
    g.block = 0;
    g.turn += 1;
    g.mana = g.maxMana;
    g.manaSpent = 0;
    const currentLife = totalLife(g);
    g.enemies = g.enemies.map(e => e.hp > 0 ? calculateEnemyIntent(e, g.turn, currentLife) : e);
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
    let g = { ...game, draw: [...game.draw], discard: [...game.discard] };
    if (g.eventId === 0 && choice === 0) { g = removeLife(g, 2); g.shards += 4; }
    else if (g.eventId === 1 && choice === 0) {
      g = removeLife(g, 1);
      const rec = Math.min(4, g.discard.length);
      for (let i = 0; i < rec; i++) g.draw.push(g.discard.pop()!);
    } else if (g.eventId === 2 && choice === 0) {
      const idx = g.draw.findIndex(c => c === "strike" || c === "guard");
      if (idx >= 0) g.draw.splice(idx, 1);
    } else if (g.eventId === 2 && choice === 1) g.shards += 2;
    else if (g.eventId === 3 && choice === 0) {
      g = removeLife(g, 3);
      if (g.phase !== "defeat" && !g.artifacts.includes("Véu de Hanna")) g.artifacts.push("Véu de Hanna");
    } else if (g.eventId === 4 && choice === 0) {
      g = removeLife(g, 2);
      if (g.phase !== "defeat") g.draw.push("execution");
    } else if (g.eventId === 5 && choice === 0) {
      if (g.shards >= 3) { g.shards -= 3; if (g.draw.length > 2) g.draw.pop(); }
      else setNotice("Você precisa de 3 fragmentos para purificar o baralho.");
    }
    if (g.phase === "defeat") { setGame(g); return; }
    setGame(nextMap({ ...g, phase: "map" }));
  };

  const shopBuy = (action: "heal" | "purge" | "rare") => {
    if (!game) return;
    let g = { ...game, draw: [...game.draw], discard: [...game.discard] };
    if (action === "heal" && g.shards >= 3) {
      g.shards -= 3;
      const rec = Math.min(4, g.discard.length);
      for (let i = 0; i < rec; i++) g.draw.push(g.discard.pop()!);
      g = log(g, `O mercador costurou suas lembranças (+${rec} cartas recuperadas).`);
    } else if (action === "purge" && g.shards >= 4 && g.draw.length > 2) {
      g.shards -= 4; g.draw.pop(); g = log(g, "Uma carta foi apagada permanentemente do baralho.");
    } else if (action === "rare" && g.shards >= 5) {
      g.shards -= 5;
      const pool: CardId[] = ["ardil", "soul_bastion", "execution", "blood_lance", "void_echo"];
      g.draw.push(pool[Math.floor(Math.random() * pool.length)]);
      g = log(g, "Você adquiriu uma relíquia em forma de carta.");
    }
    setGame(g);
  };

  const total = game ? totalLife(game) : 0;
  const nodeLabel: Record<NodeType, string> = { monster: "Encontro", elite: "Elite", event: "Evento", shop: "Mercador", boss: "Hanna", escape: "Fuga" };
  const incomingDamage = useMemo(() => {
    if (!game || game.phase !== "battle") return 0;
    return game.enemies.reduce((acc, e) => e.hp > 0 && e.intentType !== "guard" && e.intentType !== "buff" ? acc + e.intent : acc, 0);
  }, [game?.enemies, game?.phase]);
  const netProjectedLoss = useMemo(() => {
    if (!game || game.phase !== "battle") return 0;
    return Math.max(0, incomingDamage - game.block);
  }, [incomingDamage, game?.block, game?.phase]);
  const rewardChoices = useMemo(() => {
    const list: CardId[] = ["blood_siphon", "rend_flesh", "iron_spikes", "shield_slam", "astral_purge", "void_echo", "cycle_strike", "defensive_stance", "last_second", "execution"];
    return shuffle(list).slice(0, 3);
  }, [game?.step, game?.phase]);

  return (
    <div className="space-y-4 text-foreground">
      {!game && (
        <section className="relative overflow-hidden rounded-[26px] border border-rose-400/20 bg-[radial-gradient(ellipse_at_top,rgba(190,24,93,.25),transparent_50%),linear-gradient(160deg,#19101b,#0a070e)] p-5 shadow-2xl sm:p-8">
          <div className="pointer-events-none absolute -right-10 -top-10 text-[200px] opacity-[.03]">☠</div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.35em] text-rose-300"><span className="h-px w-8 bg-rose-400"/> Roguelike Tático · O Baralho é sua Vida</div>
          <h1 className="mt-2 font-display text-4xl font-black tracking-tight text-white sm:text-6xl">Sangue <span className="text-rose-500">das</span> Fendas</h1>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-rose-100/70 sm:text-sm">Inspirado no estilo brutal de <i>Blood Card</i>: seu baralho é seu corpo. Cada ponto de dano devora uma carta física da expedição.</p>
          <div className="mt-6">
            <label className="text-[10px] font-black uppercase tracking-widest text-amber-300">1. Escolha a sua Doutrina Inicial</label>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {ARCHETYPES.map(arch => (
                <button key={arch.id} type="button" onClick={() => setSelectedArchetype(arch.id)} className={`relative flex flex-col rounded-2xl border bg-gradient-to-b p-4 text-left transition-all ${arch.bg} ${selectedArchetype === arch.id ? "border-amber-300 ring-2 ring-amber-300/40 shadow-[0_0_24px_rgba(251,191,36,.25)]" : "border-white/10 opacity-70 hover:opacity-100"}`}>
                  <div className="flex items-center justify-between"><span className="text-2xl">{arch.icon}</span>{selectedArchetype === arch.id && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-black"><Check className="h-3 w-3 stroke-[3]"/></span>}</div>
                  <b className="mt-2 font-display text-sm text-white">{arch.name}</b>
                  <span className="text-[10px] font-bold text-amber-300/80">{arch.subtitle}</span>
                  <p className="mt-1 text-[11px] leading-4 text-white/60">{arch.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-4">
            <div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest text-white/70">2. Relíquias Malditas</span><span className="text-[10px] text-white/40">Opcional</span></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
              {ARTIFACTS.map(art => {
                const active = selectedArtifacts.includes(art.id);
                return <button key={art.id} type="button" onClick={() => setSelectedArtifacts(prev => prev.includes(art.id) ? prev.filter(x => x !== art.id) : [...prev, art.id])}
                  className={`rounded-xl border p-3 text-left transition ${active ? "border-amber-300 bg-amber-950/40 shadow-[0_0_15px_rgba(251,191,36,.15)]" : "border-white/10 bg-white/[.02] hover:bg-white/[.06]"}`}>
                  <span className="text-xl">{art.icon}</span><b className="mt-1 block text-xs text-white">{art.name}</b><span className="mt-1 block text-[10px] leading-tight text-white/50">{art.desc}</span>
                </button>;
              })}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
            <div className="text-xs text-white/50">Vitórias registradas: <b className="text-amber-300">{progress.wins}</b> · Abates totais: {progress.kills}</div>
            <button onClick={begin} className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-rose-700 via-red-600 to-amber-600 px-6 font-bold text-white shadow-xl transition hover:brightness-110 active:scale-95"><Swords className="h-4 w-4"/> Entrar na Fenda <ArrowRight className="h-4 w-4"/></button>
          </div>
        </section>
      )}

      {game?.phase === "map" && (
        <section className="overflow-hidden rounded-[24px] border border-white/15 bg-[radial-gradient(ellipse_at_top,rgba(88,28,135,.25),transparent_50%),#0c0911] p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div><p className="text-[10px] font-black uppercase tracking-[.3em] text-violet-300">Região {game.zone + 1} de 3 · Passo {game.step + 1}/9</p><h2 className="mt-0.5 font-display text-2xl text-white sm:text-3xl">{ZONES[game.zone]}</h2></div>
            <div className="flex items-center gap-2">
              <div className="rounded-xl border border-rose-400/30 bg-rose-950/40 px-3 py-1.5 text-xs text-rose-100"><Heart className="mr-1 inline h-4 w-4 text-rose-400"/><b className="font-mono">{total}</b> cartas de vida</div>
              <div className="rounded-xl border border-violet-400/30 bg-violet-950/40 px-3 py-1.5 text-xs text-violet-100"><Gem className="mr-1 inline h-4 w-4 text-amber-300"/><b className="font-mono">{game.shards}</b> fragmentos</div>
            </div>
          </div>
          <div className="relative mt-6 rounded-2xl border border-white/10 bg-black/40 p-4 sm:p-8">
            <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "radial-gradient(circle at 50% 50%,rgba(168,85,247,.3),transparent 60%),repeating-linear-gradient(45deg,transparent 0 20px,rgba(255,255,255,.03) 20px 21px)" }}/>
            <div className={`relative mx-auto grid gap-4 ${game.mapOptions.length === 2 ? "max-w-xl grid-cols-2" : "grid-cols-3"}`}>
              {game.mapOptions.map((node, i) => <button key={`${node}-${i}`} onClick={() => enterNode(node)} className="group flex min-h-[140px] flex-col items-center justify-center rounded-2xl border border-violet-300/20 bg-gradient-to-b from-violet-950/50 to-black/80 p-4 text-center transition hover:-translate-y-1.5 hover:border-amber-300 hover:shadow-[0_0_25px_rgba(251,191,36,.2)]">
                <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/60 text-amber-300 transition group-hover:scale-110"><NodeIcon type={node}/></span>
                <b className="font-display text-sm text-white">{nodeLabel[node]}</b>
                <span className="mt-1 text-[9px] uppercase tracking-widest text-white/40">{node === "elite" ? "Alto Risco" : node === "shop" ? "Trocas" : node === "event" ? "Mistério" : node === "boss" ? "Encontro com Hanna" : "Combate"}</span>
              </button>)}
            </div>
            <p className="relative mt-6 text-center text-[10px] font-bold uppercase tracking-widest text-white/40">Hanna avança pelas fendas a cada passo dado</p>
          </div>
        </section>
      )}

      {game?.phase === "battle" && (
        <section className="space-y-3">
          <header className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-300/20 bg-[#120b15] px-3.5 py-2.5 shadow-xl">
            <div><p className="text-[9px] font-black uppercase tracking-[.25em] text-rose-300/80">{nodeLabel[game.node!]} · {ZONES[game.zone]}</p><h2 className="font-display text-lg text-white">Duelo nas Fendas</h2></div>
            <div className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-black/60 px-3 py-1.5 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wide text-white/60">Previsão:</span>
              <span className="font-mono font-bold text-rose-400">-{incomingDamage} dano</span><span className="text-white/30">|</span>
              <span className="font-mono font-bold text-sky-300">+{game.block} esc.</span><span className="text-white/30">|</span>
              <span className={`font-mono font-bold ${netProjectedLoss > 0 ? "text-red-400" : "text-emerald-400"}`}>{netProjectedLoss > 0 ? `-${netProjectedLoss} vidas` : "0 vidas perdidas"}</span>
            </div>
          </header>

          <div className="rounded-2xl border border-rose-300/15 bg-[radial-gradient(ellipse_at_50%_0%,rgba(136,19,55,.3),transparent_65%),linear-gradient(160deg,#170f1a,#08060c)] p-3 sm:p-5">
            <div className="mb-2 text-center text-[10px] uppercase tracking-widest text-white/40">Clique no inimigo para focar seu ataque</div>
            <div className={`grid gap-3 ${game.enemies.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
              {game.enemies.map(enemy => {
                const isSelected = game.selectedEnemyId === enemy.id;
                const isDead = enemy.hp <= 0;
                return <div key={enemy.id} onClick={() => !isDead && setGame({ ...game, selectedEnemyId: enemy.id })}
                  className={`relative cursor-pointer overflow-hidden rounded-xl border p-3 text-center transition-all ${isDead ? "border-white/5 bg-black/40 opacity-30 grayscale" : isSelected ? "border-amber-300 bg-amber-950/20 shadow-[0_0_20px_rgba(251,191,36,.2)] scale-[1.01]" : "border-rose-400/20 bg-black/40 hover:border-rose-300/50"}`}>
                  {isSelected && !isDead && <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-400/20 px-2 py-0.5 text-[9px] font-bold text-amber-200"><Crosshair className="h-3 w-3"/> ALVO</div>}
                  <div className="mx-auto flex h-20 items-center justify-center"><MonsterGraphic kind={enemy.kind} boss={enemy.boss}/></div>
                  <h3 className="mt-1 font-display text-sm font-bold text-white">{enemy.name}</h3>
                  <div className="mx-auto mt-2 max-w-xs">
                    <div className="mb-1 flex justify-between text-[10px] text-white/70"><span>Vitalidade</span><span className="font-mono font-bold">{enemy.hp}/{enemy.maxHp} {enemy.block > 0 && <b className="text-sky-300">(+{enemy.block})</b>}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/80"><div className="h-full bg-gradient-to-r from-rose-900 via-red-600 to-amber-300 transition-all duration-300" style={{ width: `${Math.max(0, (enemy.hp / enemy.maxHp) * 100)}%` }}/></div>
                  </div>
                  <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-950/50 px-3 py-1 text-[10px] text-amber-100">
                    <Eye className="h-3.5 w-3.5 text-amber-300"/>
                    {enemy.intentType === "heavy" ? "Golpe Devastador" : enemy.intentType === "guard" ? "Postura Defensiva" : enemy.intentType === "buff" ? "Fortalecer" : enemy.intentType === "curse" ? "Colheita de Hanna" : "Atacará"} · <b className="font-mono text-amber-200">{enemy.intent}</b>
                  </div>
                  {enemy.mechanic !== "none" && <p className="mt-1 text-[9px] uppercase tracking-wider text-violet-200/50">Mecânica: {enemy.mechanic}</p>}
                </div>;
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[linear-gradient(150deg,#140d18,#07060a)] p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2"><span className="text-[10px] font-black uppercase tracking-wider text-rose-300">Sua Mão</span><span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-mono text-white/70">{game.hand.length} cartas</span></div>
              <div className="text-xs font-bold text-amber-200/80">Mana: <b className="font-mono text-sm text-amber-300">{game.mana}</b>/{game.maxMana}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {game.hand.map((id, index) => <CardFace key={`${id}-${index}`} id={id} disabled={CARDS[id].cost > game.mana} onClick={() => playCard(index)} fanIndex={index} totalInHand={game.hand.length}/>)}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
              <div className="text-[10px] text-white/50">Pilha de Vida (Compra): <b className="text-white">{game.draw.length}</b> · Descarte: <b className="text-white">{game.discard.length}</b> · Exauridas: <b className="text-white">{game.exhaust.length}</b></div>
              <button onClick={endTurn} className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-400 to-amber-600 px-6 font-display text-sm font-black text-black shadow-lg transition hover:brightness-110 active:scale-95">Encerrar Turno <ArrowRight className="h-4 w-4"/></button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div className="flex items-center gap-2 rounded-xl border border-rose-300/30 bg-rose-950/40 p-2.5"><Heart className="h-5 w-5 text-rose-400"/><div><b className="block font-mono text-sm leading-none text-rose-100">{total}</b><span className="text-[8px] uppercase tracking-wide text-rose-200/60">Vida (Cartas)</span></div></div>
            <div className="flex items-center gap-2 rounded-xl border border-sky-300/30 bg-sky-950/40 p-2.5"><Shield className="h-5 w-5 text-sky-400"/><div><b className="block font-mono text-sm leading-none text-sky-100">{game.block}</b><span className="text-[8px] uppercase tracking-wide text-sky-200/60">Bloqueio</span></div></div>
            <div className="flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-950/40 p-2.5"><Flame className="h-5 w-5 text-amber-400"/><div><b className="block font-mono text-sm leading-none text-amber-100">{game.spikes}</b><span className="text-[8px] uppercase tracking-wide text-amber-200/60">Espinhos</span></div></div>
            <div className="flex items-center gap-2 rounded-xl border border-violet-300/30 bg-violet-950/40 p-2.5"><Gem className="h-5 w-5 text-violet-300"/><div><b className="block font-mono text-sm leading-none text-violet-100">{game.shards}</b><span className="text-[8px] uppercase tracking-wide text-violet-200/60">Fragmentos</span></div></div>
            <div className="col-span-2 flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-3 py-2 sm:col-span-1"><span className="text-[10px] text-white/50">Turno {game.turn}</span><span className="text-[10px] text-rose-300">Sangria: {game.bleed}</span></div>
          </div>

          <details className="rounded-xl border border-white/10 bg-black/30 p-2.5">
            <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-widest text-white/40">Histórico da Batalha ({game.log.length} registros)</summary>
            <div className="mt-2 max-h-24 space-y-1 overflow-y-auto">{game.log.map((line, i) => <p key={i} className={`text-[10px] ${i === 0 ? "text-rose-200 font-bold" : "text-white/40"}`}>{line}</p>)}</div>
          </details>
        </section>
      )}

      {game?.phase === "reward" && (
        <section className="rounded-[24px] border border-amber-300/30 bg-[radial-gradient(ellipse_at_top,rgba(180,83,9,.25),transparent_60%),#100d14] p-5 text-center sm:p-7">
          <Sparkles className="mx-auto h-9 w-9 text-amber-300"/><p className="mt-2 text-[10px] font-black uppercase tracking-[.3em] text-amber-200/60">Recompensa Rúnica</p>
          <h3 className="mt-1 font-display text-2xl text-white sm:text-3xl">Incorpore uma Carta à sua Vida</h3>
          <p className="mt-1 text-xs text-white/50">Adicionar uma carta expande seu baralho e aumenta sua sobrevivência.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">{rewardChoices.map((id, i) => <CardFace key={`${id}-${i}`} id={id} onClick={() => chooseReward(id)}/>)}</div>
          <button onClick={() => chooseReward(null)} className="mt-4 text-xs text-white/40 underline hover:text-white">Seguir em frente sem absorver poder</button>
        </section>
      )}

      {game?.phase === "event" && (
        <section className="rounded-[24px] border border-violet-400/25 bg-[radial-gradient(ellipse_at_top,rgba(109,40,217,.25),transparent_60%),#110c17] p-6 text-center">
          <Moon className="mx-auto h-10 w-10 text-violet-300"/><p className="mt-2 text-[10px] font-black uppercase tracking-[.3em] text-violet-300/70">Mistério das Profundezas</p>
          <h3 className="mt-2 font-display text-2xl text-white sm:text-3xl">O Altar dos Ecos</h3>
          <p className="mx-auto mt-2 max-w-md text-xs text-white/60">Uma entidade do abismo exige sacrifícios carmesins em troca de bênçãos esquecidas.</p>
          <div className="mx-auto mt-6 grid max-w-md gap-3">
            {game.eventChoices.map(choice => <button key={choice} onClick={() => chooseEvent(game.eventChoices.indexOf(choice))} className="rounded-xl border border-violet-300/20 bg-violet-950/40 p-3.5 text-xs text-violet-100 transition hover:border-amber-300 hover:bg-violet-900/50">{choice}</button>)}
          </div>
        </section>
      )}

      {game?.phase === "shop" && (
        <section className="rounded-[24px] border border-amber-300/25 bg-[radial-gradient(ellipse_at_top,rgba(120,53,15,.25),transparent_60%),#120d15] p-6 text-center">
          <Store className="mx-auto h-9 w-9 text-amber-300"/><p className="mt-2 text-[10px] font-black uppercase tracking-[.3em] text-amber-300/70">Mercador das Almas</p>
          <h3 className="mt-1 font-display text-2xl text-white sm:text-3xl">Troque seus Fragmentos</h3>
          <p className="mt-1 text-xs text-white/50">Você carrega {game.shards} fragmentos de sangue.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <button disabled={game.shards < 3 || game.discard.length === 0} onClick={() => shopBuy("heal")} className="rounded-xl border border-amber-300/20 bg-black/40 p-4 text-left transition hover:border-amber-300 disabled:opacity-30"><b className="text-xs text-amber-100">Costurar Memórias</b><p className="mt-1 text-[10px] text-white/50">Recupera até 4 cartas do descarte para o baralho de vida.</p><span className="mt-2 block text-xs font-bold text-amber-300">3 Fragmentos</span></button>
            <button disabled={game.shards < 4 || game.draw.length <= 2} onClick={() => shopBuy("purge")} className="rounded-xl border border-amber-300/20 bg-black/40 p-4 text-left transition hover:border-amber-300 disabled:opacity-30"><b className="text-xs text-amber-100">Expurgar Fraqueza</b><p className="mt-1 text-[10px] text-white/50">Apaga permanentemente uma carta do baralho.</p><span className="mt-2 block text-xs font-bold text-amber-300">4 Fragmentos</span></button>
            <button disabled={game.shards < 5} onClick={() => shopBuy("rare")} className="rounded-xl border border-amber-300/20 bg-black/40 p-4 text-left transition hover:border-amber-300 disabled:opacity-30"><b className="text-xs text-amber-100">Pacto Raro</b><p className="mt-1 text-[10px] text-white/50">Recebe uma carta de raridade alta aleatória.</p><span className="mt-2 block text-xs font-bold text-amber-300">5 Fragmentos</span></button>
          </div>
          <button onClick={() => setGame(nextMap(game))} className="mt-6 rounded-xl bg-amber-500 px-6 py-2.5 text-xs font-bold text-black hover:bg-amber-400">Continuar Expedição <ArrowRight className="ml-1 inline h-4 w-4"/></button>
        </section>
      )}

      {game?.phase === "victory" && (
        <section className="rounded-[26px] border border-amber-300/30 bg-[radial-gradient(ellipse_at_center,rgba(217,119,6,.2),transparent_60%),#100d14] p-8 text-center">
          <Crown className="mx-auto h-12 w-12 text-amber-300"/><p className="mt-3 text-[10px] font-black uppercase tracking-[.3em] text-amber-300/70">A Fenda foi Conquistada</p>
          <h3 className="mt-1 font-display text-3xl text-amber-100 sm:text-4xl">{game.escaped ? "Você Escapou de Hanna" : "Hanna foi Derrotada"}</h3>
          <p className="mt-2 text-xs text-white/60">{game.escaped ? "Você sobreviveu às três regiões e fugiu antes do último golpe da ceifadora." : `Você destruiu a Deusa da Morte mantendo ${total} cartas de vida intactas.`}</p>
          <button onClick={() => setGame(null)} className="mt-6 rounded-xl bg-amber-500 px-6 py-3 font-bold text-black hover:bg-amber-400">Retornar ao Santuário</button>
        </section>
      )}

      {game?.phase === "defeat" && (
        <section className="rounded-[26px] border border-rose-400/25 bg-[radial-gradient(ellipse_at_center,rgba(159,18,57,.25),transparent_60%),#120810] p-8 text-center">
          <Skull className="mx-auto h-12 w-12 text-rose-400"/><p className="mt-3 text-[10px] font-black uppercase tracking-[.3em] text-rose-300/70">O Sangue se Esgotou</p>
          <h3 className="mt-1 font-display text-3xl text-rose-100 sm:text-4xl">O Baralho foi Devorado</h3>
          <p className="mt-2 text-xs text-white/60">Sua última carta foi consumida pelas criaturas da Fenda. A escuridão fechou o portal.</p>
          <button onClick={() => setGame(null)} className="mt-6 rounded-xl bg-rose-700 px-6 py-3 font-bold text-white hover:bg-rose-600">Tentar Nova Expedição</button>
        </section>
      )}

      {notice && <div className="rounded-xl border border-amber-300/30 bg-amber-950/40 px-4 py-2 text-center text-xs text-amber-200">{notice}</div>}
    </div>
  );
}
