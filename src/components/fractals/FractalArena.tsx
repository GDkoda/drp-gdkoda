import groundImg from "@/assets/fractals/cemetery-ground.jpg";
import mausoleumImg from "@/assets/fractals/mausoleum.png";
import gravestoneImg from "@/assets/fractals/gravestone.png";
import crossImg from "@/assets/fractals/cross.png";
import candlesImg from "@/assets/fractals/candles.png";
import catUrnImg from "@/assets/fractals/cat-urn.png";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Heart, Move, Pause, Play, RotateCcw, RotateCw, Check, Shield, Skull, Sparkles, Swords, Zap, Maximize, UserRound, Gauge, ArrowLeft, ShoppingBag, Crown, Gem as GemIcon, MapPin, Flame, Leaf, Snowflake, Orbit, Lock, Link2, ChevronDown, Coins, Timer, Target, ZoomIn, ZoomOut, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDifficultySnapshot } from "@/lib/fractals/difficulty";
import { fractalAudio } from "@/lib/fractals/audio";
import { CORRUPTION_LEVELS, FRACTAL_MISSIONS, RUN_DURATION_SECONDS } from "@/lib/fractals/config";
import { FRACTAL_SHOP, FRACTAL_RARITY_TIERS } from "@/lib/fractals/economy";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import "./fractal-arena.css";

type WeaponId = "void_revolver" | "unstable_core" | "spectral_scythe" | "orbital_swords" | "gravity_shackle" | "rune_sentinels";
type OmenId = "famine" | "rupture" | "spectral_veil" | "abundance" | "revenge";
type UpgradeId = "power" | "haste" | "vitality" | "swift" | "special_area" | "special_experience" | "special_projectile_range" | "special_projectiles" | "weapon_mastery" | "weapon_evolution" | "anchor_soul";
type Upgrade = { id: UpgradeId; name: string; description: string; icon: typeof Zap; rarity?: "normal" | "rare" | "epic" | "legendary" };
type UpgradeCounts = Record<string, { name: string; count: number; rarity: string }>;

type Enemy = { x: number; y: number; hp: number; maxHp: number; speed: number; radius: number; damage: number; color: string; xp: number; type: "wraith" | "brute" | "charger" | "elite" | "boss"; attack: number; flash: number; windup: number; targetX: number; targetY: number; dashTime: number; summonedAtHalf: boolean; furyTriggered: boolean; isExecutioner?: boolean };
type Shot = {
  x: number; y: number; vx: number; vy: number; damage: number; life: number;
  hitTargets: Enemy[]; bouncesRemaining: number; piercesRemaining: number;
  isChainLightning?: boolean; isSplash?: boolean; targetEnemy?: Enemy;
};
type Gem = { x: number; y: number; value: number; radius: number; previousX?: number; previousY?: number; runeCrystal?: boolean };
type SpecialDrop = { x: number; y: number; kind: "area" | "experience" | "projectile_range" | "projectiles" | "food" | "void"; radius: number };
type BreakableUrn = { id: number; x: number; y: number; hp: number; maxHp: number; radius: number; broken: boolean };
type CemeteryObstacle = { x: number; y: number; radius: number; kind: "gravestone" | "cross" | "mausoleum" | "torch" };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type DamageNumber = { x: number; y: number; value: number; life: number; maxLife: number; drift: number };
type PickupLabel = { x: number; y: number; text: string; life: number; maxLife: number };
type ChallengeEvent = { id: 1 | 2; x: number; y: number; radius: number; remaining: number; progress: number };
type SpriteKey = "boss" | "elite" | "wraith" | "charger" | "brute" | "playerIdle" | "playerMove" | "playerCast" | "xpGem" | "specialXP" | "specialArea" | "specialRange" | "specialProjectiles" | "projectile";
type SpriteMap = Partial<Record<SpriteKey, HTMLImageElement>>;
type PlayerVisualAction = "idle" | "move" | "cast";
const WEAPON_CONFIG: Record<WeaponId, { name: string; description: string; price: number; purchaseKey: keyof PurchaseState | null; masteryKey: keyof PurchaseState; projectKey: keyof PurchaseState; evolutionName: string }> = {
  void_revolver: { name: "Revólver do Vazio", description: "Disparos automáticos que perseguem o inimigo mais próximo.", price: 0, purchaseKey: null, masteryKey: "mastery_void_revolver", projectKey: "evolution_void_revolver", evolutionName: "Seis Ecos" },
  unstable_core: { name: "Núcleo Instável", description: "Orbes lentos que explodem e atingem inimigos próximos.", price: 8000, purchaseKey: "weapon_nucleus", masteryKey: "mastery_nucleus", projectKey: "evolution_nucleus", evolutionName: "Singularidade" },
  spectral_scythe: { name: "Foice Espectral", description: "Cortes espectrais de curto alcance que atravessam grupos.", price: 9000, purchaseKey: "weapon_scythe", masteryKey: "mastery_scythe", projectKey: "evolution_scythe", evolutionName: "Ceifador de Almas" },
  orbital_swords: { name: "Espadas Orbitais", description: "Lâminas conjuradas giram ao redor do personagem e atingem ameaças próximas.", price: 10000, purchaseKey: "weapon_orbitals", masteryKey: "mastery_orbitals", projectKey: "evolution_orbitals", evolutionName: "Dança das Lâminas" },
  gravity_shackle: { name: "Grilhão Gravitacional", description: "Pulsos atraem inimigos e os ferem dentro de uma zona gravitacional.", price: 11000, purchaseKey: "weapon_gravity", masteryKey: "mastery_gravity", projectKey: "evolution_gravity", evolutionName: "Prisão do Abismo" },
  rune_sentinels: { name: "Sentinelas Rúnicas", description: "Cristais orbitais disparam projéteis automáticos contra alvos.", price: 12000, purchaseKey: "weapon_sentinels", masteryKey: "mastery_sentinels", projectKey: "evolution_sentinels", evolutionName: "Arsenal Ancestral" },
};
const OMEN_CONFIG: Record<OmenId, { name: string; description: string }> = {
  famine: { name: "Fome Insaciável", description: "+20% de experiência e +20% de frequência de surgimento de inimigos." },
  rupture: { name: "Ruptura", description: "+20% de dano das armas, mas +15% no intervalo entre ataques." },
  spectral_veil: { name: "Véu Espectral", description: "+15% de velocidade de movimento, mas -15% de vida máxima." },
  abundance: { name: "Abundância", description: "+25% de chance relativa de recompensas especiais; inimigos têm +15% de vida." },
  revenge: { name: "Vingança", description: "Ao sofrer dano, libera uma onda ofensiva próxima. -10% de vida máxima." },
};

type PurchaseState = {
  area: number; experience: number; rarity: number; speed_2x: boolean; speed_3x: boolean;
  health: number; projectile_duration: number; projectile_range: number; projectiles: number;
  ricochet: number; piercing: number; chain_lightning: number;
  reroll: number; oracle: number; banish: number; fortune: number; transmutation: number;
  anchor_soul: boolean; omen_archive: boolean;
  weapon_nucleus: boolean; weapon_scythe: boolean; weapon_orbitals: boolean; weapon_gravity: boolean; weapon_sentinels: boolean;
  mastery_void_revolver: boolean; mastery_nucleus: boolean; mastery_scythe: boolean; mastery_orbitals: boolean; mastery_gravity: boolean; mastery_sentinels: boolean;
  evolution_void_revolver: boolean; evolution_nucleus: boolean; evolution_scythe: boolean; evolution_orbitals: boolean; evolution_gravity: boolean; evolution_sentinels: boolean;
};
const DEFAULT_PURCHASES: PurchaseState = {
  area: 0, experience: 0, rarity: 0, speed_2x: false, speed_3x: false,
  health: 0, projectile_duration: 0, projectile_range: 0, projectiles: 0,
  ricochet: 0, piercing: 0, chain_lightning: 0,
  reroll: 0, oracle: 0, banish: 0, fortune: 0, transmutation: 0,
  anchor_soul: false, omen_archive: false,
  weapon_nucleus: false, weapon_scythe: false, weapon_orbitals: false, weapon_gravity: false, weapon_sentinels: false,
  mastery_void_revolver: false, mastery_nucleus: false, mastery_scythe: false, mastery_orbitals: false, mastery_gravity: false, mastery_sentinels: false,
  evolution_void_revolver: false, evolution_nucleus: false, evolution_scythe: false, evolution_orbitals: false, evolution_gravity: false, evolution_sentinels: false,
};
const PROJECTILE_DURATION_MULTIPLIERS = [1, 1.25, 1.5, 2] as const;
const PROJECTILE_BASE_LIFE = 0.8;
const MAX_EXTRA_PROJECTILES = 2;
const WORLD_LIMIT = 1300;
const CHALLENGE_EVENT_TIMES = [240, 480] as const;
const RITUAL_DURATION = 25;
const RITUAL_WINDOW = 50;
const EXECUTIONER_WINDOW = 60;
function parsePurchaseState(raw: any): PurchaseState {
  const defaults = DEFAULT_PURCHASES;
  const numericKeys = ["area","experience","rarity","health","projectile_duration","projectile_range","projectiles","ricochet","piercing","chain_lightning","reroll","oracle","banish","fortune","transmutation"] as const;
  const booleanKeys = Object.keys(defaults).filter((key) => !numericKeys.includes(key as typeof numericKeys[number])) as Array<keyof PurchaseState>;
  const parsed = { ...defaults, ...raw } as PurchaseState;
  for (const key of numericKeys) parsed[key] = Math.max(0, Number(raw?.[key] ?? 0));
  for (const key of booleanKeys) (parsed as any)[key] = Boolean(raw?.[key] ?? false);
  return parsed;
}

type GameState = {
  width: number; height: number; last: number; elapsed: number; spawnTimer: number; shotTimer: number; bossSpawned: boolean;
  player: { x: number; y: number; hp: number; maxHp: number; speed: number; damage: number; fireRate: number; invuln: number; hitFlash: number; xp: number; nextXp: number; level: number; pickupRadius: number; xpMultiplier: number; specialAreaStacks: number; specialExperienceStacks: number; projectileRangeStacks: number; projectileRangeMultiplier: number; projectileStacks: number; projectileLife: number; facing: number; castFacing: number; castTimer: number; moving: boolean; spriteAction: PlayerVisualAction; spriteDirection: number; previousSpriteAction: PlayerVisualAction; previousSpriteDirection: number; spriteBlend: number };
  enemies: Enemy[]; shots: Shot[]; gems: Gem[]; specialDrops: SpecialDrop[]; urns: BreakableUrn[]; obstacles: CemeteryObstacle[]; nextUrnMinute: number; nextUrnId: number; particles: Particle[]; damageNumbers: DamageNumber[]; pickupLabels: PickupLabel[]; challengeEvent: ChallengeEvent | null; nextChallengeEvent: number; kills: number; ended: boolean; upgradeCounts: UpgradeCounts; totalDamageDealt: number; crystalsCollected: number; highestLevel: number;
  weaponId: WeaponId; weaponLevel: number; evolved: boolean; rerollsRemaining: number; banishesRemaining: number; bannedUpgradeIds: string[];
  anchorReviveAvailable: boolean; anchorReviveUsed: boolean; omenId: OmenId | null; omenSpawnMultiplier: number; omenEnemyHpMultiplier: number; omenRewardMultiplier: number; omenRevengeCooldown: number; lastObservedHp: number;
  shake?: number; rings?: { x: number; y: number; r: number; max: number; life: number; color: string }[];
};

const UPGRADES: Upgrade[] = [
  { id: "power", name: "Estilhaço Voraz", description: "Aumenta o dano dos disparos em 30%.", icon: Swords },
  { id: "haste", name: "Pulso Acelerado", description: "Dispara 18% mais rápido.", icon: Zap },
  { id: "vitality", name: "Casca de Cristal", description: "Recupera 25% da vida máxima e aumenta a vida em 15%.", icon: Shield },
  { id: "swift", name: "Passos do Errante", description: "Aumenta a velocidade de movimento em 10%.", icon: Move },
];

const SPECIAL_UPGRADES: Upgrade[] = [
  { id: "special_area", name: "Ímã de Fragmentos", description: "+10% de alcance de coleta por coleta (máx. +50%).", icon: Move },
  { id: "special_experience", name: "Eco do Conhecimento", description: "+5% de experiência por coleta (máx. +30%).", icon: Sparkles },
  { id: "special_projectile_range", name: "Ressonância de Alcance", description: "+10% de distância dos projéteis por coleta (máx. +50%).", icon: Zap },
  { id: "special_projectiles", name: "Coroa de Estilhaços", description: "+1 projétil por coleta. Até 2 extras por expedição.", icon: Swords },
];

function weaponProjectKey(weapon: WeaponId) {
  return ({ void_revolver: "evolution_void_revolver", unstable_core: "evolution_nucleus", spectral_scythe: "evolution_scythe", orbital_swords: "evolution_orbitals", gravity_shackle: "evolution_gravity", rune_sentinels: "evolution_sentinels" } as const)[weapon];
}
function getEligibleFieldRelics(game: GameState, purchases: PurchaseState): Upgrade[] {
  return SPECIAL_UPGRADES.filter((item) => {
    if (game.bannedUpgradeIds.includes(item.id)) return false;
    if (item.id === "special_area") return purchases.area >= 1 && game.player.specialAreaStacks < 5;
    if (item.id === "special_experience") return purchases.experience >= 1 && game.player.specialExperienceStacks < 6;
    if (item.id === "special_projectile_range") return purchases.projectile_range >= 1 && game.player.projectileRangeStacks < 5;
    return purchases.projectiles >= 1 && game.player.projectileStacks < MAX_EXTRA_PROJECTILES;
  });
}
function buildLevelChoices(game: GameState, purchases: PurchaseState): Upgrade[] {
  const corePool = UPGRADES.filter((item) => !game.bannedUpgradeIds.includes(item.id)).sort(() => Math.random() - 0.5);
  const core = corePool.slice(0, 2);
  const choices: Upgrade[] = [...core];
  if (game.weaponLevel < 10) {
    choices.push({ id: "weapon_mastery", name: "Ressonância da Arma", description: "Aumenta em um nível a arma escolhida, aprimorando seu comportamento. Máximo: nível 10.", icon: Swords });
  } else {
    choices.push(corePool[2] ?? corePool[0] ?? UPGRADES[0]);
  }

  const fieldRelics = getEligibleFieldRelics(game, purchases);
  if (fieldRelics.length && Math.random() < 0.18) {
    const field = fieldRelics[Math.floor(Math.random() * fieldRelics.length)];
    const replaceAt = Math.floor(Math.random() * 2);
    choices[replaceAt] = field;
  }

  if (purchases.anchor_soul && !game.anchorReviveAvailable && !game.anchorReviveUsed && Math.random() < 0.10) {
    const replaceAt = Math.floor(Math.random() * 2);
    choices[replaceAt] = { id: "anchor_soul", name: "Âncora da Alma", description: "Concede uma ressurreição nesta expedição, retornando com 40% da vida e 3 segundos de invulnerabilidade.", icon: Heart };
  }

  if (game.weaponLevel >= 10 && !game.evolved && purchases[weaponProjectKey(game.weaponId)] && Math.random() < 0.33) {
    const evolutionNames: Record<WeaponId, string> = {
      void_revolver: "Seis Ecos", unstable_core: "Singularidade", spectral_scythe: "Ceifador de Almas",
      orbital_swords: "Dança das Lâminas", gravity_shackle: "Prisão do Abismo", rune_sentinels: "Arsenal Ancestral",
    };
    choices[Math.floor(Math.random() * 2)] = {
      id: "weapon_evolution", name: evolutionNames[game.weaponId],
      description: "Evolução lendária: transforma permanentemente o comportamento da arma nesta expedição.",
      icon: Crown, rarity: "legendary",
    };
  }

  const transmutationChance = [0, 3, 6, 10][Math.max(0, Math.min(3, purchases.transmutation))];
  const withRarity = choices.map((upgrade) => ({
    ...upgrade,
    rarity: upgrade.rarity ?? (upgrade.id.startsWith("special_") || upgrade.id === "anchor_soul" ? undefined : rollUpgradeRarity(purchases.rarity, transmutationChance)),
  }));

  // Oráculo: an independent fourth choice that is always an available Field Relic.
  if (purchases.oracle > 0 && Math.random() < purchases.oracle * 3 / 100) {
    const fourthOptions = getEligibleFieldRelics(game, purchases).filter((item) => !withRarity.some((choice) => choice.id === item.id));
    if (fourthOptions.length) {
      const selected = fourthOptions[Math.floor(Math.random() * fourthOptions.length)];
      withRarity.push({ ...selected });
    }
  }
  return withRarity;
}

function rollUpgradeRarity(tier: number, transmutationChance = 0): "normal" | "rare" | "epic" {
  const odds = FRACTAL_RARITY_TIERS[Math.max(0, Math.min(3, tier))];
  const roll = Math.random() * 100;
  if (roll < odds.epic) return "epic";
  if (roll < odds.epic + odds.rare) return Math.random() * 100 < transmutationChance ? "epic" : "rare";
  return "normal";
}

const UPGRADE_RARITY_MULTIPLIERS = { normal: 1, rare: 1.25, epic: 1.5 } as const;
function getUpgradeRarityMultiplier(rarity: Upgrade["rarity"]): number {
  return rarity === "legendary" ? 1.5 : UPGRADE_RARITY_MULTIPLIERS[rarity ?? "normal"];
}
function formatUpgradePercent(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}
function getUpgradeDescription(upgrade: Upgrade): string {
  const multiplier = getUpgradeRarityMultiplier(upgrade.rarity);
  switch (upgrade.id) {
    case "power": return `Dano dos disparos +${formatUpgradePercent(30 * multiplier)}%.`;
    case "haste": return `Velocidade de ataque +${formatUpgradePercent(18 * multiplier)}% (intervalo entre disparos menor).`;
    case "vitality": return `Vida máxima +${formatUpgradePercent(15 * multiplier)}% e cura ${formatUpgradePercent(25 * multiplier)}% da vida máxima anterior.`;
    case "swift": return `Velocidade de movimento +${formatUpgradePercent(10 * multiplier)}%.`;
    case "weapon_mastery": return upgrade.description;
    case "weapon_evolution": return upgrade.description;
    case "anchor_soul": return upgrade.description;
    default: return upgrade.description;
  }
}
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// Stable coordinate hash for repeatable arena props; returns a value in [0, 1).
function hash(x: number, y: number): number {
  let value = Math.imul(x | 0, 0x1f1f1f1f) ^ Math.imul(y | 0, 0x5f356495);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}
const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const directionFromVector = (x: number, y: number) => {
  if (Math.hypot(x, y) < 0.001) return 0;
  const step = Math.round((Math.atan2(y, x) - Math.PI / 2) / (Math.PI / 4));
  return ((step % 8) + 8) % 8;
};
const PLAYER_DIRECTION_VECTORS = [
  { x: 0, y: 1 }, { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 }, { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 0, y: -1 }, { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 1, y: 0 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 },
];

const ENEMY_GRID_CELL_SIZE = 96;
type EnemySpatialGrid = Map<string, Enemy[]>;

function buildEnemySpatialGrid(enemies: Enemy[]): EnemySpatialGrid {
  const grid: EnemySpatialGrid = new Map();
  for (const enemy of enemies) {
    const cellX = Math.floor(enemy.x / ENEMY_GRID_CELL_SIZE);
    const cellY = Math.floor(enemy.y / ENEMY_GRID_CELL_SIZE);
    const key = cellX + ":" + cellY;
    const bucket = grid.get(key);
    if (bucket) bucket.push(enemy);
    else grid.set(key, [enemy]);
  }
  return grid;
}

function getNearbyEnemies(x: number, y: number, grid: EnemySpatialGrid): Enemy[] {
  const nearby: Enemy[] = [];
  const cellX = Math.floor(x / ENEMY_GRID_CELL_SIZE);
  const cellY = Math.floor(y / ENEMY_GRID_CELL_SIZE);
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const bucket = grid.get((cellX + offsetX) + ":" + (cellY + offsetY));
      if (bucket) nearby.push(...bucket);
    }
  }
  return nearby;
}

function getEnemySeparation(enemy: Enemy, grid: EnemySpatialGrid) {
  let sx = 0, sy = 0;
  const cellX = Math.floor(enemy.x / ENEMY_GRID_CELL_SIZE);
  const cellY = Math.floor(enemy.y / ENEMY_GRID_CELL_SIZE);
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const bucket = grid.get((cellX + offsetX) + ":" + (cellY + offsetY));
      if (!bucket) continue;
      for (const other of bucket) {
        if (other === enemy) continue;
        const dx = enemy.x - other.x, dy = enemy.y - other.y;
        const distanceSquared = dx * dx + dy * dy;
        const range = enemy.radius + other.radius + 12;
        if (distanceSquared > 0.000001 && distanceSquared < range * range) {
          const d = Math.sqrt(distanceSquared);
          const weight = (range - d) / range;
          sx += (dx / d) * weight;
          sy += (dy / d) * weight;
        }
      }
    }
  }
  const magnitude = Math.hypot(sx, sy);
  return magnitude > 0 ? { x: sx / magnitude, y: sy / magnitude } : { x: 0, y: 0 };
}


const floorPatternCache = new WeakMap<CanvasRenderingContext2D, Map<number, CanvasPattern>>();

const cemeteryImgs: Record<string, HTMLImageElement> = {};
const cemeteryImagePromises = new Map<string, Promise<void>>();
const CEMETERY_IMAGE_SOURCES = [groundImg, mausoleumImg, gravestoneImg, crossImg, candlesImg, catUrnImg] as const;
function cemImg(src: string): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  let img = cemeteryImgs[src];
  if (!img) { img = new Image(); img.src = src; cemeteryImgs[src] = img; }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
function preloadCemeteryImage(src: string): Promise<void> {
  const existing = cemeteryImgs[src];
  if (existing?.complete) return Promise.resolve();
  const pending = cemeteryImagePromises.get(src);
  if (pending) return pending;
  const image = existing ?? new Image();
  cemeteryImgs[src] = image;
  const promise = new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      void image.decode().catch(() => undefined).then(resolve);
    };
    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", finish, { once: true });
    image.decoding = "sync";
    if (!existing) image.src = src;
    if (image.complete) finish();
  });
  cemeteryImagePromises.set(src, promise);
  return promise;
}
function preloadCemeteryImages(): Promise<void> {
  return Promise.all(CEMETERY_IMAGE_SOURCES.map(preloadCemeteryImage)).then(() => undefined);
}
const groundPatternCache = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
function drawSprite(ctx: CanvasRenderingContext2D, src: string, size: number, footY: number): boolean {
  const img = cemImg(src); if (!img) return false;
  ctx.drawImage(img, -size / 2, footY - size, size, size); return true;
}
function getFloorPattern(ctx: CanvasRenderingContext2D, missionId: number, floor: readonly number[], glow: string): CanvasPattern | null {
  let missionPatterns = floorPatternCache.get(ctx);
  if (!missionPatterns) {
    missionPatterns = new Map<number, CanvasPattern>();
    floorPatternCache.set(ctx, missionPatterns);
  }
  const cached = missionPatterns.get(missionId);
  if (cached) return cached;
  const texture = document.createElement("canvas");
  texture.width = 96;
  texture.height = 96;
  const tileCtx = texture.getContext("2d");
  if (!tileCtx) return null;
  tileCtx.fillStyle = "rgb(" + floor[0] + "," + floor[1] + "," + floor[2] + ")";
  tileCtx.fillRect(0, 0, 96, 96);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const x = col * 48, y = row * 48;
      const shade = (row + col) % 2 === 0 ? 7 : -3;
      tileCtx.fillStyle = "rgb(" + clamp(floor[0] + shade, 0, 255) + "," + clamp(floor[1] + shade, 0, 255) + "," + clamp(floor[2] + shade, 0, 255) + ")";
      tileCtx.fillRect(x + 1, y + 1, 46, 46);
      tileCtx.strokeStyle = "rgba(7,5,13,.82)";
      tileCtx.lineWidth = 2;
      tileCtx.strokeRect(x + 1, y + 1, 46, 46);
      tileCtx.strokeStyle = "rgba(225,205,245,.075)";
      tileCtx.lineWidth = 1;
      tileCtx.beginPath();
      tileCtx.moveTo(x + 7, y + 8); tileCtx.lineTo(x + 40, y + 8);
      tileCtx.moveTo(x + 8, y + 7); tileCtx.lineTo(x + 8, y + 40);
      tileCtx.stroke();
      tileCtx.fillStyle = glow;
      tileCtx.globalAlpha = 0.13;
      tileCtx.beginPath();
      tileCtx.moveTo(x + 24, y + 15); tileCtx.lineTo(x + 30, y + 24);
      tileCtx.lineTo(x + 24, y + 33); tileCtx.lineTo(x + 18, y + 24);
      tileCtx.closePath(); tileCtx.fill();
      tileCtx.globalAlpha = 1;
    }
  }
  const pattern = ctx.createPattern(texture, "repeat");
  if (pattern) missionPatterns.set(missionId, pattern);
  return pattern;
}

const NO_ENEMY_SEPARATION = { x: 0, y: 0 };

function isFreeCemeteryPosition(x: number, y: number, radius: number, obstacles: CemeteryObstacle[], urns: BreakableUrn[] = []): boolean {
  if (Math.abs(x) > WORLD_LIMIT - radius || Math.abs(y) > WORLD_LIMIT - radius) return false;
  if (obstacles.some((item) => distance(x, y, item.x, item.y) < radius + item.radius + 24)) return false;
  return !urns.some((item) => !item.broken && distance(x, y, item.x, item.y) < radius + item.radius + 18);
}
function createCemeteryObstacles(): CemeteryObstacle[] {
  const result: CemeteryObstacle[] = [];
  const specs: Array<[CemeteryObstacle["kind"], number, number]> = [["gravestone",35,18],["cross",20,14],["mausoleum",8,46],["torch",12,16]];
  for (const [kind,count,radius] of specs) {
    let placed=0, attempts=0;
    while (placed<count && attempts<count*90) {
      attempts++; const x=(Math.random()*2-1)*1190, y=(Math.random()*2-1)*1190;
      if (distance(x,y,0,0)<155 || !isFreeCemeteryPosition(x,y,radius,result)) continue;
      result.push({x,y,radius,kind}); placed++;
    }
  }
  return result;
}
function spawnCemeteryUrns(game: GameState, count: number) {
  let placed=0, attempts=0;
  while (placed<count && attempts<count*80) {
    attempts++; const x=(Math.random()*2-1)*1220, y=(Math.random()*2-1)*1220;
    if (!isFreeCemeteryPosition(x,y,15,game.obstacles,game.urns)) continue;
    game.urns.push({id:game.nextUrnId++,x,y,hp:3,maxHp:3,radius:15,broken:false}); placed++;
  }
}
function resolveCemeteryCollision(x:number,y:number,radius:number,obstacles:CemeteryObstacle[]) {
  let nx=clamp(x,-WORLD_LIMIT+radius,WORLD_LIMIT-radius), ny=clamp(y,-WORLD_LIMIT+radius,WORLD_LIMIT-radius);
  for (const obstacle of obstacles) {
    const dx=nx-obstacle.x, dy=ny-obstacle.y, d=Math.hypot(dx,dy), min=radius+obstacle.radius;
    if (d>0 && d<min) { const push=min-d; nx+=dx/d*push; ny+=dy/d*push; }
    else if (d===0) nx+=min;
  }
  return {x:clamp(nx,-WORLD_LIMIT+radius,WORLD_LIMIT-radius),y:clamp(ny,-WORLD_LIMIT+radius,WORLD_LIMIT-radius)};
}


function makeGame(width: number, height: number, purchases: PurchaseState, weaponId: WeaponId, omenId: OmenId | null): GameState {
  const omenHealth = omenId === "spectral_veil" ? 0.85 : omenId === "revenge" ? 0.90 : 1;
  const maxHp = (100 + purchases.health * 10) * omenHealth;
  const projectileLife = PROJECTILE_BASE_LIFE * PROJECTILE_DURATION_MULTIPLIERS[clamp(purchases.projectile_duration, 0, 3)];
  const omenDamage = omenId === "rupture" ? 1.2 : 1;
  return {
    width, height, last: 0, elapsed: 0, spawnTimer: 0.4, shotTimer: 0.25, bossSpawned: false,
    player: { x: 0, y: 0, hp: maxHp, maxHp, speed: 205 * (omenId === "spectral_veil" ? 1.15 : 1), damage: 22 * omenDamage, fireRate: 0.72 * (omenId === "rupture" ? 1.15 : 1), invuln: 0, hitFlash: 0, xp: 0, nextXp: 12, level: 1, pickupRadius: 85, xpMultiplier: omenId === "famine" ? 1.2 : 1, specialAreaStacks: 0, specialExperienceStacks: 0, projectileRangeStacks: 0, projectileRangeMultiplier: 1, projectileStacks: 0, projectileLife, facing: 0, castFacing: 0, castTimer: 0, moving: false, spriteAction: "idle", spriteDirection: 0, previousSpriteAction: "idle", previousSpriteDirection: 0, spriteBlend: 1 },
    enemies: [], shots: [], gems: [], specialDrops: [], urns: [], obstacles: createCemeteryObstacles(), nextUrnMinute: 1, nextUrnId: 1, particles: [], damageNumbers: [], pickupLabels: [], challengeEvent: null, nextChallengeEvent: 0, kills: 0, ended: false, upgradeCounts: {}, totalDamageDealt: 0, crystalsCollected: 0, highestLevel: 1,
    weaponId, weaponLevel: 1, evolved: false, rerollsRemaining: purchases.reroll, banishesRemaining: purchases.banish, bannedUpgradeIds: [],
    anchorReviveAvailable: false, anchorReviveUsed: false, omenId, omenSpawnMultiplier: omenId === "famine" ? 1.2 : 1,
    omenEnemyHpMultiplier: omenId === "abundance" ? 1.15 : 1, omenRewardMultiplier: omenId === "abundance" ? 1.25 : 1,
    omenRevengeCooldown: 0, lastObservedHp: maxHp,
  };
}

function spawnEnemy(game: GameState, missionId: number, elapsed: number, corruption: number, boss = false) {
  const side = Math.floor(Math.random() * 4);
  const margin = 30;
  const centerX = game.player.x, centerY = game.player.y;
  const x = clamp(side === 0 ? centerX - game.width / 2 - margin : side === 1 ? centerX + game.width / 2 + margin : centerX + (Math.random() - 0.5) * game.width, -WORLD_LIMIT + 50, WORLD_LIMIT - 50);
  const y = clamp(side === 2 ? centerY - game.height / 2 - margin : side === 3 ? centerY + game.height / 2 + margin : centerY + (Math.random() - 0.5) * game.height, -WORLD_LIMIT + 50, WORLD_LIMIT - 50);
  const pressure = getDifficultySnapshot(missionId, elapsed, corruption);
  const roll = Math.random();
  const eliteChance = Math.min(0.22, pressure.eliteSpawnScale * 0.075);
  const type: Enemy["type"] = boss ? "boss" : elapsed > 210 && roll < eliteChance ? "elite" : elapsed > 150 && roll > 0.76 ? "brute" : elapsed > 70 && roll > 0.56 ? "charger" : "wraith";
  const scale = 1 + elapsed / 650 + (missionId - 1) * 0.18;
  const stats = type === "boss"
    ? { hp: 1700, speed: 40, radius: 38, damage: 24, color: "#b9a0ff", xp: 0 }
    : type === "elite"
      ? { hp: 245 * scale, speed: 31, radius: 21, damage: 17, color: "#c7a7d9", xp: 9 }
      : type === "brute"
        ? { hp: 100 * scale, speed: 35, radius: 17, damage: 15, color: "#7d8495", xp: 4 }
        : type === "charger"
          ? { hp: 36 * scale, speed: 105, radius: 11, damage: 10, color: "#e5a45b", xp: 2 }
          : { hp: 28 * scale, speed: 57, radius: 10, damage: 8, color: "#9b91b4", xp: 2 };
  const scaledStats = { ...stats, hp: stats.hp * game.omenEnemyHpMultiplier };
  game.enemies.push({ x, y, ...scaledStats, maxHp: scaledStats.hp, type, attack: type === "boss" ? 2.2 : 0, flash: 0, windup: 0, targetX: x, targetY: y, dashTime: 0, summonedAtHalf: false, furyTriggered: false });
  // Spawn pressure is bounded. It affects encounter density, not enemy HP directly.
  if (!boss && pressure.enemySpawnScale > 1.25 && game.enemies.length < 48 && Math.random() < 0.18) {
    game.enemies.push({ x: x + (Math.random() - 0.5) * 70, y: y + (Math.random() - 0.5) * 70, ...scaledStats, maxHp: scaledStats.hp, type, attack: 0, flash: 0, windup: 0, targetX: x, targetY: y, dashTime: 0, summonedAtHalf: false, furyTriggered: false });
  }
}

function drawGame(ctx: CanvasRenderingContext2D, game: GameState, corruption: number, missionId: number, sprites: SpriteMap = {}, showPlayerHp = true, showDamageNumbers = true, zoom = 1) {
  const { width, height, player } = game;
  const safeZoom = clamp(zoom, 0.75, 1.35);
  const viewWidth = width / safeZoom;
  const viewHeight = height / safeZoom;
  const cameraX = player.x - viewWidth / 2;
  const cameraY = player.y - viewHeight / 2;
  const crowded = game.enemies.length > 30;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  if (game.shake) ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  ctx.scale(safeZoom, safeZoom);
  ctx.translate(-player.x, -player.y);

  // Paletas prontas para os cinco biomas; somente o primeiro está liberado.
  const biomes = [
    { floor: [35, 32, 48], glow: "#a75bff", crystal: "#a75bff", stone: "#554365" },
    { floor: [48, 27, 28], glow: "#ed654c", crystal: "#ff754e", stone: "#74443b" },
    { floor: [27, 43, 31], glow: "#69b978", crystal: "#79d18a", stone: "#466b4a" },
    { floor: [25, 37, 53], glow: "#69a9ed", crystal: "#78c8f4", stone: "#456783" },
    { floor: [39, 27, 53], glow: "#c08aff", crystal: "#d29aff", stone: "#654b80" },
  ] as const;
  const biome = biomes[clamp(missionId - 1, 0, biomes.length - 1)];
  // Piso em mosaico cacheado: uma chamada de preenchimento por quadro.
  ctx.fillStyle = "#0d0b14";
  ctx.fillRect(cameraX, cameraY, viewWidth, viewHeight);
  const floorPattern = getFloorPattern(ctx, missionId, biome.floor, biome.glow);
  const gImg = missionId === 1 ? cemImg(groundImg) : null;
  let groundPattern = gImg ? groundPatternCache.get(ctx) : undefined;
  if (gImg && !groundPattern) {
    const createdPattern = ctx.createPattern(gImg, "repeat");
    if (createdPattern) {
      groundPatternCache.set(ctx, createdPattern);
      groundPattern = createdPattern;
    }
  }
  if (gImg && groundPattern) { ctx.fillStyle = groundPattern; ctx.fillRect(cameraX, cameraY, viewWidth, viewHeight); }
  else if (floorPattern) { ctx.fillStyle = floorPattern; ctx.fillRect(cameraX, cameraY, viewWidth, viewHeight); }
  ctx.save();ctx.strokeStyle="rgba(145,119,160,.72)";ctx.lineWidth=34;ctx.strokeRect(-WORLD_LIMIT,-WORLD_LIMIT,WORLD_LIMIT*2,WORLD_LIMIT*2);ctx.strokeStyle="rgba(215,190,231,.25)";ctx.lineWidth=5;ctx.strokeRect(-WORLD_LIMIT+17,-WORLD_LIMIT+17,WORLD_LIMIT*2-34,WORLD_LIMIT*2-34);
  const fog=110;for(let edge=0;edge<4;edge++){const g=edge<2?ctx.createLinearGradient(edge===0?-WORLD_LIMIT:WORLD_LIMIT,0,edge===0?-WORLD_LIMIT+fog:WORLD_LIMIT-fog,0):ctx.createLinearGradient(0,edge===2?-WORLD_LIMIT:WORLD_LIMIT,0,edge===2?-WORLD_LIMIT+fog:WORLD_LIMIT-fog);g.addColorStop(0,"rgba(32,22,42,.78)");g.addColorStop(1,"rgba(32,22,42,0)");ctx.fillStyle=g;if(edge<2)ctx.fillRect(edge===0?-WORLD_LIMIT:WORLD_LIMIT-fog,-WORLD_LIMIT,fog,WORLD_LIMIT*2);else ctx.fillRect(-WORLD_LIMIT,edge===2?-WORLD_LIMIT:WORLD_LIMIT-fog,WORLD_LIMIT*2,fog);}ctx.restore();

  const drawPillar = (x: number, y: number, scale = 1) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(0,0,0,.42)";
    ctx.beginPath(); ctx.ellipse(2, 13, 19, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#171320"; ctx.strokeStyle = biome.stone; ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(-13,10); ctx.lineTo(-10,-25); ctx.lineTo(-4,-32); ctx.lineTo(11,-29); ctx.lineTo(14,-23); ctx.lineTo(12,11); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#383047";
    ctx.beginPath(); ctx.moveTo(-16,-27); ctx.lineTo(-7,-35); ctx.lineTo(14,-32); ctx.lineTo(17,-25); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = biome.glow + "3d";
    ctx.beginPath(); ctx.moveTo(-2,-20); ctx.lineTo(4,-25); ctx.lineTo(5,5); ctx.lineTo(-1,9); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(238,218,255,.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-8,-15); ctx.lineTo(-3,-7); ctx.lineTo(-7,0); ctx.moveTo(8,-18); ctx.lineTo(4,-10); ctx.stroke();
    ctx.restore();
  };
  const drawCrystal = (x: number, y: number, size: number, color: string) => {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = color; ctx.strokeStyle = "rgba(245,225,255,.72)"; ctx.lineWidth = 1;
    const shard = (offsetX: number, offsetY: number, scale: number) => {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY - size * scale);
      ctx.lineTo(offsetX + size * .42 * scale, offsetY - size * .16 * scale);
      ctx.lineTo(offsetX + size * .27 * scale, offsetY + size * .75 * scale);
      ctx.lineTo(offsetX - size * .28 * scale, offsetY + size * .75 * scale);
      ctx.lineTo(offsetX - size * .42 * scale, offsetY - size * .16 * scale);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.22)";
      ctx.beginPath(); ctx.moveTo(offsetX, offsetY - size * scale); ctx.lineTo(offsetX, offsetY + size * .65 * scale);
      ctx.lineTo(offsetX - size * .28 * scale, offsetY + size * .75 * scale); ctx.closePath(); ctx.fill();
      ctx.fillStyle = color;
    };
    shard(0, 0, 1); shard(-size * .5, size * .22, .58); shard(size * .48, size * .27, .48);
    ctx.restore();
  };

  for(const prop of game.obstacles){if(prop.x<cameraX-90||prop.x>cameraX+viewWidth+90||prop.y<cameraY-90||prop.y>cameraY+viewHeight+90)continue;ctx.save();ctx.translate(prop.x,prop.y);
    {const sh=prop.kind==="mausoleum"?[60,18]:[22,8];ctx.fillStyle="rgba(0,0,0,.45)";ctx.beginPath();ctx.ellipse(0,prop.radius*.55,sh[0],sh[1],0,0,Math.PI*2);ctx.fill();}
    if(prop.kind==="torch"){const pulse=1+Math.sin(game.elapsed*4.2+prop.x*.02)*.12;const glow=ctx.createRadialGradient(0,-22,2,0,-22,60*pulse);glow.addColorStop(0,"rgba(255,190,110,.35)");glow.addColorStop(1,"rgba(255,150,60,0)");ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,-22,60*pulse,0,Math.PI*2);ctx.fill();}
    const spr=prop.kind==="mausoleum"?[mausoleumImg,140,40]:prop.kind==="cross"?[crossImg,62,22]:prop.kind==="torch"?[candlesImg,58,20]:[gravestoneImg,60,22];
    if(drawSprite(ctx,spr[0] as string,spr[1] as number,spr[2] as number)){ctx.restore();continue;}
    if(prop.kind==="torch"){const pulse=1+Math.sin(game.elapsed*3.8+prop.x*.02)*.12;const glow=ctx.createRadialGradient(0,-14,2,0,-14,42*pulse);glow.addColorStop(0,"rgba(193,117,255,.42)");glow.addColorStop(.45,"rgba(128,67,190,.16)");glow.addColorStop(1,"rgba(128,67,190,0)");ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,-14,42*pulse,0,Math.PI*2);ctx.fill();ctx.fillStyle="#292333";ctx.strokeStyle="#746181";ctx.fillRect(-5,-4,10,21);ctx.strokeRect(-5,-4,10,21);ctx.fillStyle="#d8a8ff";ctx.beginPath();ctx.moveTo(0,-31);ctx.quadraticCurveTo(13,-18,2,-8);ctx.quadraticCurveTo(-10,-15,0,-31);ctx.fill();ctx.fillStyle="#ffd99a";ctx.beginPath();ctx.arc(0,-17,3,0,Math.PI*2);ctx.fill();}
    else if(prop.kind==="mausoleum"){ctx.fillStyle="rgba(0,0,0,.45)";ctx.beginPath();ctx.ellipse(0,18,54,17,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#25212d";ctx.strokeStyle="#75677e";ctx.lineWidth=3;ctx.fillRect(-42,-22,84,42);ctx.strokeRect(-42,-22,84,42);ctx.beginPath();ctx.moveTo(-48,-22);ctx.lineTo(-35,-48);ctx.lineTo(35,-48);ctx.lineTo(48,-22);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle="#100e17";ctx.fillRect(-12,-5,24,25);ctx.strokeStyle="#9a83a5";ctx.strokeRect(-12,-5,24,25);}
    else if(prop.kind==="cross"){ctx.fillStyle="#272330";ctx.strokeStyle="#786a83";ctx.lineWidth=3;ctx.fillRect(-4,-23,8,43);ctx.fillRect(-14,-14,28,7);ctx.strokeRect(-4,-23,8,43);ctx.strokeRect(-14,-14,28,7);}
    else{ctx.fillStyle="rgba(0,0,0,.4)";ctx.beginPath();ctx.ellipse(2,15,21,8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#282330";ctx.strokeStyle="#81758a";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-16,13);ctx.lineTo(-13,-13);ctx.lineTo(-8,-23);ctx.lineTo(8,-23);ctx.lineTo(15,-12);ctx.lineTo(16,13);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle="#9c83a9";ctx.fillRect(-10,-17,20,3);}ctx.restore();}
  // Objetos decorativos saem do passe crítico durante ondas cheias.
  if (!crowded) {
    const propSpacing = 320;
    const propColStart = Math.floor(cameraX / propSpacing) - 1;
    const propColEnd = Math.ceil((cameraX + viewWidth) / propSpacing) + 1;
    const propRowStart = Math.floor(cameraY / propSpacing) - 1;
    const propRowEnd = Math.ceil((cameraY + viewHeight) / propSpacing) + 1;
    for (let row = propRowStart; row <= propRowEnd; row++) {
      for (let col = propColStart; col <= propColEnd; col++) {
        const roll = hash(col + 103, row - 67);
        const x = col * propSpacing + 34 + hash(col + 11, row + 4) * 235;
        const y = row * propSpacing + 30 + hash(col - 9, row + 19) * 250;
        if (roll > 0.91) drawPillar(x, y, 0.62 + hash(col, row + 8) * 0.55);
        else if (roll > 0.78) drawCrystal(x, y, 9 + hash(col + 5, row) * 12, biome.crystal);
        else if (roll > 0.67) {
          ctx.save(); ctx.translate(x, y); ctx.rotate(hash(col + 2, row + 2) * Math.PI);
          ctx.fillStyle = "rgba(8,7,15,.72)"; ctx.strokeStyle = biome.stone + "99"; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(-18,8); ctx.lineTo(-11,-8); ctx.lineTo(4,-13); ctx.lineTo(18,2); ctx.lineTo(11,12); ctx.closePath();
          ctx.fill(); ctx.stroke(); ctx.fillStyle = biome.glow + "30"; ctx.fillRect(-4,-6,7,4); ctx.restore();
        }
      }
    }
  }

  if (game.challengeEvent?.id === 1) {
    const event = game.challengeEvent;
    const pulse = 1 + Math.sin(game.elapsed * 3.5) * 0.035;
    ctx.save();
    ctx.translate(event.x, event.y);
    ctx.scale(pulse, pulse);
    const halo = ctx.createRadialGradient(0, 0, 24, 0, 0, event.radius);
    halo.addColorStop(0, "rgba(174,121,255,.12)");
    halo.addColorStop(.72, "rgba(119,77,180,.07)");
    halo.addColorStop(1, "rgba(119,77,180,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, event.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(206,166,255,.78)";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -game.elapsed * 22;
    ctx.beginPath();
    ctx.arc(0, 0, event.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(241,213,255,.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, event.radius - 9, 0, Math.PI * 2);
    ctx.stroke();
    const sentinel = sprites.elite;
    if (sentinel?.complete && sentinel.naturalWidth > 0) {
      ctx.shadowColor = "#bd8cff";
      ctx.shadowBlur = 22;
      ctx.drawImage(sentinel, -35, -44, 70, 82);
    }
    ctx.shadowBlur = 0;
    ctx.font = "900 10px Inter, ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f0ddff";
    ctx.shadowColor = "#6f3eb1";
    ctx.shadowBlur = 0;
    ctx.fillText("ANOMALIA " + String(event.id).padStart(2, "0"), 0, -event.radius - 18);
    ctx.restore();
  }

  for(const urn of game.urns){if(urn.broken||urn.x<cameraX-35||urn.x>cameraX+viewWidth+35||urn.y<cameraY-35||urn.y>cameraY+viewHeight+35)continue;ctx.save();ctx.translate(urn.x,urn.y);
    {const catI=cemImg(catUrnImg);if(catI){const pulse=.7+Math.sin(game.elapsed*2.4+urn.id)*.3;const aura=ctx.createRadialGradient(0,-4,4,0,-4,30);aura.addColorStop(0,`rgba(255,215,120,${.28*pulse})`);aura.addColorStop(1,"rgba(255,200,90,0)");ctx.fillStyle=aura;ctx.beginPath();ctx.arc(0,-4,30,0,Math.PI*2);ctx.fill();ctx.fillStyle="rgba(0,0,0,.4)";ctx.beginPath();ctx.ellipse(0,13,14,5,0,0,Math.PI*2);ctx.fill();ctx.drawImage(catI,-19,-24,38,38);if(urn.hp<urn.maxHp){ctx.fillStyle="#3a2a10";ctx.fillRect(-10,-30,20,3);ctx.fillStyle="#f2c460";ctx.fillRect(-10,-30,20*(urn.hp/urn.maxHp),3);}ctx.restore();continue;}}
    ctx.fillStyle="rgba(0,0,0,.4)";ctx.beginPath();ctx.ellipse(0,13,17,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#514454";ctx.strokeStyle="#b49ab7";ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(-11,-9);ctx.lineTo(-8,-17);ctx.lineTo(8,-17);ctx.lineTo(11,-9);ctx.lineTo(9,10);ctx.quadraticCurveTo(0,17,-9,10);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle="#241d2b";ctx.fillRect(-9,-10,18,4);ctx.strokeStyle="#d8c0d7";ctx.beginPath();ctx.moveTo(-5,-5);ctx.lineTo(5,7);ctx.moveTo(5,-5);ctx.lineTo(-5,7);ctx.stroke();ctx.fillStyle="#efb6ff";ctx.fillRect(-10,-25,20,3);ctx.fillStyle="#8c4ca8";ctx.fillRect(-10,-25,20*(urn.hp/urn.maxHp),3);ctx.restore();}
  game.gems.forEach((gem) => {
    if (gem.x < cameraX - 30 || gem.x > cameraX + viewWidth + 30 || gem.y < cameraY - 30 || gem.y > cameraY + viewHeight + 30) return;
    if (gem.previousX !== undefined && gem.previousY !== undefined) {
      const trail = ctx.createLinearGradient(gem.previousX, gem.previousY, gem.x, gem.y);
      trail.addColorStop(0, "rgba(167,139,250,0)"); trail.addColorStop(.55, "rgba(167,139,250,.48)"); trail.addColorStop(1, "rgba(56,189,248,.95)");
      ctx.save(); ctx.strokeStyle = trail; ctx.lineWidth = 2.5; ctx.shadowColor = "#38bdf8"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.moveTo(gem.previousX, gem.previousY); ctx.lineTo(gem.x, gem.y); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.translate(gem.x, gem.y);
    const pulse = 1 + Math.sin(game.elapsed * 6 + gem.x * 0.03) * 0.08;
    if(gem.runeCrystal){const glow=ctx.createRadialGradient(0,0,1,0,0,20);glow.addColorStop(0,"rgba(255,210,255,.8)");glow.addColorStop(.35,"rgba(217,70,239,.42)");glow.addColorStop(1,"rgba(217,70,239,0)");ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,20,0,Math.PI*2);ctx.fill();ctx.fillStyle="#d946ef";ctx.rotate(Math.PI/4);ctx.fillRect(-6,-6,12,12);ctx.fillStyle="#fff0ff";ctx.fillRect(-2,-2,4,4);ctx.restore();return;}
    ctx.scale(pulse, pulse);
    const icon = sprites.xpGem;
    if (icon?.complete && icon.naturalWidth > 0) {
      ctx.shadowColor = "#a78bfa"; ctx.shadowBlur = 0;
      ctx.drawImage(icon, -gem.radius * 0.95, -gem.radius * 0.95, gem.radius * 1.9, gem.radius * 1.9);
    } else {
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#9ee6c1"; ctx.shadowColor = "#7df0b0"; ctx.shadowBlur = 0;
      ctx.fillRect(-gem.radius / 2, -gem.radius / 2, gem.radius, gem.radius);
    }
    ctx.restore();
  });
  game.specialDrops.forEach((drop) => {
    if (drop.x < cameraX - 45 || drop.x > cameraX + viewWidth + 45 || drop.y < cameraY - 45 || drop.y > cameraY + viewHeight + 45) return;
    ctx.save(); ctx.translate(drop.x, drop.y);
    const pulse = 1 + Math.sin(game.elapsed * 7 + drop.y * 0.02) * 0.09;
    const size = drop.radius * 2.8 * pulse;
    if(drop.kind==="food"||drop.kind==="void"){ctx.font="25px serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(drop.kind==="food"?"🍔":"🌀",0,0);ctx.restore();return;}
    const icon = drop.kind === "area" ? sprites.specialArea : drop.kind === "experience" ? sprites.specialXP : drop.kind === "projectile_range" ? sprites.specialRange : sprites.specialProjectiles;
    ctx.globalAlpha = 0.9 + Math.sin(game.elapsed * 5 + drop.x * 0.02) * 0.1;
    ctx.shadowColor = drop.kind === "area" ? "#e9c46a" : "#b78cff";
    ctx.shadowBlur = 0;
    if (icon?.complete && icon.naturalWidth > 0) {
      ctx.drawImage(icon, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = drop.kind === "area" ? "#67d9e8" : "#b58cff";
      ctx.beginPath(); ctx.arc(0, 0, drop.radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });
  ctx.save(); ctx.lineCap = "round";
  game.shots.forEach((shot) => {
    if(shot.x<cameraX-80||shot.x>cameraX+viewWidth+80||shot.y<cameraY-80||shot.y>cameraY+viewHeight+80)return;
    const speed = Math.hypot(shot.vx, shot.vy) || 1; const len = 34;
    const tx = shot.x - shot.vx / speed * len, ty = shot.y - shot.vy / speed * len;
    const trail = ctx.createLinearGradient(tx, ty, shot.x, shot.y);
    if (shot.isChainLightning) {
      trail.addColorStop(0, "rgba(34,211,238,0)");
      trail.addColorStop(1, "rgba(207,250,254,.98)");
      ctx.strokeStyle = trail; ctx.lineWidth = 3.5;
    } else {
      trail.addColorStop(0, "rgba(183,122,255,0)");
      trail.addColorStop(1, "rgba(226,196,255,.75)");
      ctx.strokeStyle = trail; ctx.lineWidth = 5;
    }
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(shot.x, shot.y); ctx.stroke();
  });
  game.rings?.forEach((ring) => { ctx.globalAlpha = clamp(ring.life * 2.4, 0, 1); ctx.strokeStyle = ring.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2); ctx.stroke(); });
  ctx.restore();
  game.shots.forEach((shot) => {
    if(shot.x<cameraX-80||shot.x>cameraX+viewWidth+80||shot.y<cameraY-80||shot.y>cameraY+viewHeight+80)return;
    ctx.save(); ctx.translate(shot.x, shot.y); ctx.rotate(Math.atan2(shot.vy, shot.vx));
    const fade = clamp(shot.life / Math.max(0.01, game.player.projectileLife), 0.25, 1);
    ctx.globalAlpha = fade;
    const projectile = sprites.projectile;
    if (shot.isChainLightning) {
      ctx.shadowColor = "#67e8f9"; ctx.shadowBlur = 12;
      ctx.fillStyle = "#a5f3fc";
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(2, -2); ctx.lineTo(4, -7); ctx.lineTo(-7, 1); ctx.lineTo(-1, 2); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill();
    } else if (projectile?.complete && projectile.naturalWidth > 0) {
      ctx.shadowColor = "#b77aff"; ctx.shadowBlur = 0;
      ctx.drawImage(projectile, -15, -9, 30, 18);
    } else {
      ctx.shadowColor = "#b77aff"; ctx.shadowBlur = 0; ctx.fillStyle = "#c39aff";
      ctx.beginPath(); ctx.moveTo(9,0); ctx.lineTo(0,-4); ctx.lineTo(-10,0); ctx.lineTo(0,4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff1ce"; ctx.beginPath(); ctx.moveTo(5,0); ctx.lineTo(0,-1.5); ctx.lineTo(-5,0); ctx.lineTo(0,1.5); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  });
  game.enemies.forEach((enemy) => {
    if (enemy.x < cameraX - 88 || enemy.x > cameraX + viewWidth + 88 || enemy.y < cameraY - 100 || enemy.y > cameraY + viewHeight + 100) return;
    ctx.save();
    const motionPhase = game.elapsed * (enemy.dashTime > 0 ? 19 : enemy.type === "boss" ? 5 : 10) + enemy.x * 0.017 + enemy.y * 0.013;
    const distortion = Math.sin(motionPhase);
    const secondaryWave = Math.cos(motionPhase * 0.67);
    const hover = enemy.type === "wraith" || enemy.type === "elite" ? secondaryWave * 1.7 : Math.abs(distortion) * 0.55;
    ctx.translate(enemy.x, enemy.y + hover);
    ctx.transform(1 + distortion * 0.035, secondaryWave * 0.028, Math.sin(motionPhase * 0.43) * 0.022, 1 - distortion * 0.03, 0, 0);
    if(enemy.isExecutioner){const aura=ctx.createRadialGradient(0,0,8,0,0,76);aura.addColorStop(0,"rgba(58,17,83,.62)");aura.addColorStop(.55,"rgba(104,38,143,.25)");aura.addColorStop(1,"rgba(104,38,143,0)");ctx.fillStyle=aura;ctx.beginPath();ctx.arc(0,0,76,0,Math.PI*2);ctx.fill();ctx.strokeStyle="rgba(197,142,255,.8)";ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,38+Math.sin(game.elapsed*7)*4,0,Math.PI*2);ctx.stroke();ctx.strokeStyle="#d8c4ff";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(14,-8);ctx.lineTo(42,-40);ctx.stroke();ctx.fillStyle="#e9d5ff";ctx.beginPath();ctx.moveTo(42,-40);ctx.lineTo(49,-55);ctx.lineTo(37,-45);ctx.closePath();ctx.fill();}
    const bossInFury = enemy.type === "boss" && enemy.hp <= enemy.maxHp * 0.30;
    if (bossInFury) {
      const firePulse = 1 + Math.sin(game.elapsed * 17) * 0.08;
      const fireAura = ctx.createRadialGradient(0, 0, 12, 0, 0, 78 * firePulse);
      fireAura.addColorStop(0, "rgba(255,75,65,.28)"); fireAura.addColorStop(.55, "rgba(151,18,42,.24)"); fireAura.addColorStop(1, "rgba(151,18,42,0)");
      ctx.fillStyle = fireAura; ctx.beginPath(); ctx.arc(0, 0, 78 * firePulse, 0, Math.PI * 2); ctx.fill();
      for (let flame = 0; flame < 6; flame++) { const angle = game.elapsed * 2.8 + flame * Math.PI / 3; const radius = 49 + Math.sin(game.elapsed * 13 + flame) * 8; ctx.fillStyle = "rgba(255,75,55,.72)"; ctx.beginPath(); ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 3 + (flame % 2), 0, Math.PI * 2); ctx.fill(); }
    }
    if (enemy.type === "charger" && enemy.dashTime > 0) {
      ctx.rotate(Math.atan2(enemy.targetY, enemy.targetX) * 0.12);
      ctx.scale(1.12, 0.9);
    } else if (enemy.type === "brute" && enemy.windup > 0) {
      ctx.scale(1.06, 0.9);
    } else if (enemy.type === "boss" && enemy.windup > 0) {
      ctx.scale(1.04, 0.96);
    }
    if (enemy.type === "boss" && enemy.windup > 0) { ctx.save(); ctx.globalAlpha = 0.25 + Math.sin(game.elapsed * 18) * 0.08; ctx.strokeStyle = "#d8b5ff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(enemy.targetX - enemy.x, enemy.targetY - enemy.y, 88, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "rgba(177,112,220,.12)"; ctx.beginPath(); ctx.arc(enemy.targetX - enemy.x, enemy.targetY - enemy.y, 88, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    if (enemy.type === "brute" && enemy.windup > 0) { ctx.save(); ctx.globalAlpha = .25 + Math.sin(game.elapsed * 20) * .2; ctx.strokeStyle = "#ffb36b"; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(0, 0, 78, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "rgba(255,150,75,.13)"; ctx.fill(); ctx.restore(); }
    if (enemy.type === "charger" && enemy.windup > 0) { ctx.save(); ctx.rotate(Math.atan2(enemy.targetY - enemy.y, enemy.targetX - enemy.x)); ctx.globalAlpha = .55 + Math.sin(game.elapsed * 24) * .2; ctx.strokeStyle = "#ffc477"; ctx.lineWidth = 3; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(125, 0); ctx.stroke(); ctx.restore(); }
    if (enemy.type === "elite") { ctx.save(); ctx.globalAlpha = .18 + Math.sin(game.elapsed * 4) * .06; ctx.strokeStyle = "#d69cff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 105, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    const hurt = enemy.flash > 0;
    const enemySprite = enemy.type === "boss" ? sprites.boss : enemy.type === "elite" ? sprites.elite : enemy.type === "wraith" ? sprites.wraith : enemy.type === "charger" ? sprites.charger : sprites.brute;
    if (enemySprite?.complete && enemySprite.naturalWidth > 0) {
      ctx.save();
      const dimensions: Record<Enemy["type"], [number, number, number]> = {
        boss: [78, 98, 0.68], elite: [46, 52, 0.68], wraith: [34, 52, 0.62],
        charger: [46, 48, 0.66], brute: [56, 64, 0.68],
      };
      const [spriteWidth, spriteHeight, anchor] = dimensions[enemy.type];
      ctx.globalAlpha = hurt ? 0.78 : 1;
      ctx.filter = hurt ? "brightness(2.35) saturate(.35)" : bossInFury ? "brightness(1.15) sepia(1) saturate(4) hue-rotate(315deg)" : "none";
      ctx.shadowColor = bossInFury ? "#d41438" : enemy.type === "brute" ? "#9b7bce" : enemy.type === "charger" ? "#b58cff" : "#8b68ff";
      ctx.shadowBlur = 0;
      ctx.drawImage(enemySprite, -spriteWidth / 2, -spriteHeight * anchor, spriteWidth, spriteHeight);
      ctx.restore();
    } else if (enemy.type === "wraith") {
      ctx.shadowColor = enemy.color; ctx.shadowBlur = 0; ctx.fillStyle = hurt ? "#fff" : "#827394";
      ctx.beginPath(); ctx.moveTo(-enemy.radius, 3); ctx.quadraticCurveTo(-enemy.radius * 1.2, -enemy.radius, 0, -enemy.radius * 1.1); ctx.quadraticCurveTo(enemy.radius * 1.2, -enemy.radius, enemy.radius, 3); ctx.lineTo(enemy.radius * .55, enemy.radius * .45); ctx.lineTo(0, enemy.radius * .12); ctx.lineTo(-enemy.radius * .55, enemy.radius * .45); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#d9b8ff"; ctx.fillRect(-4, -3, 3, 4); ctx.fillRect(2, -3, 3, 4);
    } else if (enemy.type === "charger") {
      ctx.rotate(Math.atan2(enemy.targetY - enemy.y, enemy.targetX - enemy.x));
      ctx.shadowColor = "#f0a75d"; ctx.shadowBlur = 0; ctx.fillStyle = hurt ? "#fff" : "#b46f42";
      ctx.beginPath(); ctx.moveTo(enemy.radius * 1.35, 0); ctx.lineTo(-enemy.radius * .8, -enemy.radius * .85); ctx.lineTo(-enemy.radius * .4, 0); ctx.lineTo(-enemy.radius * .8, enemy.radius * .85); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffe0a1"; ctx.fillRect(enemy.radius * .25, -2, 4, 4);
    } else if (enemy.type === "brute") {
      ctx.shadowColor = "#a8a6b7"; ctx.shadowBlur = 0; ctx.fillStyle = hurt ? "#fff" : "#57586b";
      ctx.beginPath(); ctx.moveTo(-enemy.radius, -enemy.radius * .55); ctx.lineTo(-enemy.radius * .55, -enemy.radius); ctx.lineTo(enemy.radius * .65, -enemy.radius * .9); ctx.lineTo(enemy.radius, -enemy.radius * .2); ctx.lineTo(enemy.radius * .8, enemy.radius); ctx.lineTo(-enemy.radius * .8, enemy.radius); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#b4a8c9"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#e0a5ff"; ctx.fillRect(-4, -4, 8, 6);
    } else if (enemy.type === "elite") {
      ctx.rotate(game.elapsed * .35); ctx.shadowColor = "#d69cff"; ctx.shadowBlur = 0; ctx.fillStyle = hurt ? "#fff" : "#6f4c8c";
      ctx.beginPath(); for (let i=0;i<8;i++){const a=i*Math.PI/4;const rr=i%2===0?enemy.radius*1.2:enemy.radius*.72;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);} ctx.closePath();ctx.fill();
      ctx.strokeStyle="#e5c5ff";ctx.lineWidth=2;ctx.stroke();ctx.fillStyle="#fff0ff";ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();
    } else {
      ctx.shadowColor = "#b78bff"; ctx.shadowBlur = 0; ctx.fillStyle = hurt ? "#fff" : "#33233f";
      ctx.beginPath(); ctx.moveTo(-enemy.radius*.9, enemy.radius*.65); ctx.lineTo(-enemy.radius*.8,-enemy.radius*.7); ctx.lineTo(-enemy.radius*.35,-enemy.radius*1.15); ctx.lineTo(enemy.radius*.35,-enemy.radius*1.15); ctx.lineTo(enemy.radius*.8,-enemy.radius*.7); ctx.lineTo(enemy.radius*.9,enemy.radius*.65); ctx.lineTo(0,enemy.radius*1.05); ctx.closePath();ctx.fill();
      ctx.strokeStyle="#d7b5ff";ctx.lineWidth=3;ctx.stroke();
      ctx.fillStyle="#08060d";ctx.beginPath();ctx.ellipse(0,-enemy.radius*.15,enemy.radius*.42,enemy.radius*.55,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#caa1ff";ctx.shadowColor="#c17cff";ctx.shadowBlur=18;ctx.fillRect(-enemy.radius*.25,-enemy.radius*.2,enemy.radius*.16,4);ctx.fillRect(enemy.radius*.1,-enemy.radius*.2,enemy.radius*.16,4);
      ctx.strokeStyle="rgba(211,166,255,.65)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-enemy.radius*.7,enemy.radius*.6);ctx.lineTo(-enemy.radius*1.3,enemy.radius*1.3);ctx.moveTo(enemy.radius*.7,enemy.radius*.6);ctx.lineTo(enemy.radius*1.3,enemy.radius*1.3);ctx.stroke();
    }
    ctx.shadowBlur = 0;
    if (enemy.type === "boss" || enemy.isExecutioner || enemy.hp < enemy.maxHp) {
      const barW = enemy.type === "boss" || enemy.isExecutioner ? 86 : 30;
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(-barW / 2, -enemy.radius - 10, barW, 4);
      ctx.fillStyle = enemy.isExecutioner ? "#b56cff" : bossInFury ? "#ef334f" : "#e87979"; ctx.fillRect(-barW / 2, -enemy.radius - 10, barW * clamp(enemy.hp / enemy.maxHp, 0, 1), 4); if(enemy.isExecutioner){ctx.font="900 9px Inter,system-ui";ctx.textAlign="center";ctx.fillStyle="#ead7ff";ctx.fillText("ALGOZ ESPECTRAL",0,-enemy.radius-15);}
    }
    ctx.restore();
  });
  ctx.save();
  const particleGroups = new Map<string, Particle[]>();
  for (const particle of game.particles) {
    if (particle.x < cameraX - 16 || particle.x > cameraX + viewWidth + 16 || particle.y < cameraY - 16 || particle.y > cameraY + viewHeight + 16) continue;
    const group = particleGroups.get(particle.color);
    if (group) group.push(particle);
    else particleGroups.set(particle.color, [particle]);
  }
  for (const [color, group] of particleGroups) {
    ctx.beginPath();
    for (const particle of group) {
      const size = 1.2 + clamp(particle.life * 2, 0, 1) * 2.1;
      const angle = Math.atan2(particle.vy, particle.vx);
      const dx = Math.cos(angle) * size, dy = Math.sin(angle) * size;
      const px = -dy * 0.38, py = dx * 0.38;
      ctx.moveTo(particle.x - dx, particle.y - dy);
      ctx.lineTo(particle.x + px, particle.y + py);
      ctx.lineTo(particle.x + dx, particle.y + dy);
      ctx.lineTo(particle.x - px, particle.y - py);
      ctx.closePath();
    }
    ctx.fillStyle = color; ctx.globalAlpha = 0.78; ctx.fill();
  }
  ctx.restore(); ctx.globalAlpha = 1;

  if (showDamageNumbers) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 15px Inter, ui-sans-serif, system-ui, sans-serif";
    ctx.lineJoin = "round";
    for (const number of game.damageNumbers) {
      const progress = 1 - number.life / number.maxLife;
      const alpha = clamp(number.life / number.maxLife, 0, 1);
      const label = `−${Math.max(1, Math.round(number.value))}`;
      const y = number.y - progress * 13;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "rgba(20,7,17,.92)";
      ctx.shadowColor = "rgba(255,53,89,.9)";
      ctx.shadowBlur = 0;
      ctx.strokeText(label, number.x, y);
      ctx.fillStyle = "#fff4ed";
      ctx.fillText(label, number.x, y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Protagonista chibi: mistura os quadros antigos e novos para transições suaves.
  ctx.save(); ctx.translate(player.x, player.y);
  const bob = Math.sin(game.elapsed * (player.moving ? 13 : 3.4)) * (player.moving ? 1.6 : 0.8);
  ctx.fillStyle = "rgba(0,0,0,.42)";
  ctx.beginPath(); ctx.ellipse(0, 13, 17, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, bob);
  const auraPulse = 0.94 + Math.sin(game.elapsed * 4.4) * 0.07;
  const hitIntensity = clamp(player.hitFlash / 0.3, 0, 1);
  const auraColor = hitIntensity > 0.02 ? "rgba(248,36,63,.22)" : "rgba(166,111,237,.18)";
  ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = auraColor;
  ctx.beginPath();
  ctx.ellipse(0, 2, (25 + hitIntensity * 6) * auraPulse, (31 + hitIntensity * 6) * auraPulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hitIntensity > 0.02 ? "rgba(255,76,99,.46)" : "rgba(204,163,255,.28)";
  ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.ellipse(0, 2, 28 * auraPulse, 34 * auraPulse, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  if (player.moving) {
    const runWave = Math.sin(game.elapsed * 16 + player.facing * 0.8);
    ctx.transform(1 + runWave * 0.018, runWave * 0.012, -runWave * 0.015, 1 - runWave * 0.014, 0, 0);
  }
  const getPlayerSheet = (action: PlayerVisualAction) =>
    action === "cast" ? sprites.playerCast : action === "move" ? sprites.playerMove : sprites.playerIdle;
  const isPlayerSheetReady = (sheet?: HTMLImageElement) =>
    !!sheet?.complete && sheet.naturalWidth >= 384 && sheet.naturalHeight >= 64;
  const currentSheet = getPlayerSheet(player.spriteAction);
  const previousSheet = getPlayerSheet(player.previousSpriteAction);
  const currentReady = isPlayerSheetReady(currentSheet);
  const previousReady = isPlayerSheetReady(previousSheet);
  if (currentReady) {
    const baseAlpha = player.invuln > 0 && Math.floor(game.elapsed * 14) % 2 === 0 ? 0.62 : 1;
    ctx.filter = hitIntensity > 0.02 ? "brightness(1.75) sepia(.8) saturate(4) hue-rotate(300deg)" : player.invuln > 0 ? "brightness(1.25) saturate(1.2)" : "none";
    ctx.shadowColor = hitIntensity > 0.02 ? "#ff2448" : player.invuln > 0 ? "#ff7182" : "#a75cff";
    ctx.shadowBlur = 0;
    const blend = previousReady ? clamp(player.spriteBlend, 0, 1) : 1;
    if (previousReady && blend < 1) {
      ctx.globalAlpha = baseAlpha * (1 - blend);
      ctx.drawImage(previousSheet!, player.previousSpriteDirection * 48, 0, 48, 64, -25, -34, 50, 68);
    }
    ctx.globalAlpha = baseAlpha * (previousReady ? blend : 1);
    ctx.drawImage(currentSheet!, player.spriteDirection * 48, 0, 48, 64, -25, -34, 50, 68);
    ctx.filter = "none"; ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    if (player.spriteAction === "cast" && player.castTimer > 0) {
      const aim = PLAYER_DIRECTION_VECTORS[player.spriteDirection] ?? PLAYER_DIRECTION_VECTORS[0];
      ctx.save(); ctx.translate(aim.x * 19, aim.y * 16 - 2);
      ctx.globalAlpha = clamp(player.castTimer / 0.24, 0.35, 1);
      ctx.shadowColor = "#c28aff"; ctx.shadowBlur = 0; ctx.fillStyle = "#f0dcff";
      ctx.beginPath(); ctx.arc(0, 0, 3.2 + Math.sin(game.elapsed * 46) * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(216,175,255,.9)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  } else {
    // Fallback vetorial enquanto as imagens carregam ou em caso de falha de rede.
    ctx.shadowColor = hitIntensity > 0.02 ? "#ff2448" : player.invuln > 0 ? "#ff7182" : "#a75cff"; ctx.shadowBlur = 0;
    ctx.fillStyle = "#292039"; ctx.beginPath(); ctx.moveTo(-12, -3); ctx.lineTo(-9, -13); ctx.lineTo(0, -19); ctx.lineTo(9, -13); ctx.lineTo(13, 8); ctx.lineTo(7, 14); ctx.lineTo(-9, 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#8d65b5"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#4a315e"; ctx.beginPath(); ctx.moveTo(-10,-7);ctx.lineTo(-5,-17);ctx.lineTo(2,-20);ctx.lineTo(10,-12);ctx.lineTo(7,1);ctx.lineTo(0,9);ctx.lineTo(-8,2);ctx.closePath();ctx.fill();
    ctx.fillStyle = player.invuln > 0 && Math.floor(game.elapsed * 14) % 2 === 0 ? "#fff" : "#e5c9a0";
    ctx.beginPath(); ctx.ellipse(0,-7,6.5,8,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#17121f";ctx.beginPath();ctx.moveTo(-8,-9);ctx.lineTo(0,-20);ctx.lineTo(9,-10);ctx.lineTo(4,-8);ctx.lineTo(-5,-7);ctx.closePath();ctx.fill();
    ctx.fillStyle="#d9c4ff";ctx.fillRect(-4,-7,2.5,2);ctx.fillRect(2,-7,2.5,2);
    ctx.strokeStyle="#d7b5ff";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(8,-1);ctx.lineTo(17,-12);ctx.stroke();
    ctx.fillStyle="#d5a7ff";ctx.shadowColor="#bd7cff";ctx.shadowBlur=16;ctx.beginPath();ctx.arc(18,-13,3.5,0,Math.PI*2);ctx.fill();
  }
  ctx.shadowBlur=0; ctx.globalAlpha=1;
  if (showPlayerHp) {
    const barW = 42, barY = -44, ratio = clamp(player.hp / Math.max(1, player.maxHp), 0, 1);
    ctx.fillStyle = "rgba(8,6,15,.82)"; ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, 6);
    ctx.fillStyle = "rgba(104,33,55,.95)"; ctx.fillRect(-barW / 2, barY, barW, 4);
    ctx.fillStyle = "#f06480"; ctx.fillRect(-barW / 2, barY, barW * ratio, 4);
    ctx.strokeStyle = "rgba(255,225,232,.68)"; ctx.lineWidth = 0.7; ctx.strokeRect(-barW / 2, barY, barW, 4);
  }
  ctx.restore();
  game.pickupLabels.forEach((label) => {
    const alpha = clamp(label.life / label.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "900 13px Inter, ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "rgba(12,7,20,.94)";
    ctx.shadowColor = "rgba(228,190,255,.85)";
    ctx.shadowBlur = 0;
    ctx.strokeText(label.text, label.x, label.y);
    ctx.fillStyle = "#ffe6ae";
    ctx.fillText(label.text, label.x, label.y);
    ctx.restore();
  });
  ctx.restore();

  if (corruption > 0) {
    ctx.fillStyle = `rgba(139, 76, 190, ${0.025 + corruption * 0.012})`;
    ctx.fillRect(0, 0, width, height);
  }
}

export function FractalArena({ isMaster = false }: { isMaster?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const queryClient = useQueryClient();
  const gameRef = useRef<GameState | null>(null);
  const keysRef = useRef(new Set<string>());
  const joystickRef = useRef<{ x: number; y: number } | null>(null);
  const eventRewardRemainingRef = useRef(0);
  const [missionId, setMissionId] = useState(1);
  const [missionPickerOpen, setMissionPickerOpen] = useState(false);
  const [exchangeAmount, setExchangeAmount] = useState("10");
  const [coinBalance, setCoinBalance] = useState(0);
  const [corruption, setCorruption] = useState(0);
  const [running, setRunning] = useState(false);
  const [preparingArena, setPreparingArena] = useState(false);
  const preparingArenaRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [levelChoices, setLevelChoices] = useState<Upgrade[]>([]);
  const [selectedUpgrade, setSelectedUpgrade] = useState<Upgrade | null>(null);
  const [flippedCardId, setFlippedCardId] = useState<string | null>(null);
  const [eventRewardStep, setEventRewardStep] = useState(0);
  const [hud, setHud] = useState({ hp: 100, maxHp: 100, xp: 0, nextXp: 12, level: 1, kills: 0, elapsed: 0, moveSpeed: 205, fps: 0, visibleEnemies: 0, phase: "Exploração", pressure: 0, event: null as null | { id: number; remaining: number; progress: number; inside: boolean }, runes: [] as { id: string; name: string; count: number; rarity: string }[] });
  const [stats, setStats] = useState({ totalDamageDealt: 0, crystalsCollected: 0, highestLevel: 1 });
  const [result, setResult] = useState<"victory" | "defeat" | null>(null);
  const [bossMessage, setBossMessage] = useState(false);
  const [pausePanel, setPausePanel] = useState<"main" | "attributes">("main");
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2 | 3>(1);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [fractalBalance, setFractalBalance] = useState(0);
  const [unlockedCorruption, setUnlockedCorruption] = useState(0);
  const [completedCorruptions, setCompletedCorruptions] = useState<number[]>([]);
  const [purchases, setPurchases] = useState<PurchaseState>(DEFAULT_PURCHASES);
  const [showPlayerHp, setShowPlayerHp] = useState(true);
  const [showDamageNumbers, setShowDamageNumbers] = useState(true);
  const [shopSection, setShopSection] = useState<"permanent" | "relics" | "weapons" | "omens">("permanent");
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponId>("void_revolver");
  const [selectedOmen, setSelectedOmen] = useState<OmenId | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(() => fractalAudio.isMuted());
  const [earnedFractals, setEarnedFractals] = useState<number | null>(null);
  const [rewardStatus, setRewardStatus] = useState<"pending" | "confirmed" | "error">("pending");
  const [shopBusy, setShopBusy] = useState(false);
  const [shopOpen, setShopOpen] = useState(true);
  const [shopError, setShopError] = useState<string | null>(null);
  const toggleAudio = () => {
    const nextMute = fractalAudio.toggleMute();
    setIsMuted(nextMute);
    toast.info(nextMute ? "Áudio desativado" : "Efeitos sonoros ativados");
  };
  const spritesRef = useRef<SpriteMap>({});
  useEffect(() => {
    let cancelled = false;
    const assets: Record<SpriteKey, string> = {
      playerIdle: "/fractals/sprites/player-idle-8dir.png",
      playerMove: "/fractals/sprites/player-move-8dir.png",
      playerCast: "/fractals/sprites/player-cast-8dir.png",
      boss: "/fractals/sprites/enemies/boss.svg",
      elite: "/fractals/sprites/enemies/elite.svg",
      wraith: "/fractals/sprites/enemies/wraith.svg",
      charger: "/fractals/sprites/enemies/charger.svg",
      brute: "/fractals/sprites/enemies/brute.svg",
      xpGem: "/fractals/sprites/drops/xp-gem.svg",
      specialXP: "/fractals/sprites/drops/special-xp.svg",
      specialArea: "/fractals/sprites/drops/special-area.svg",
      specialRange: "/fractals/sprites/drops/special-range.svg",
      specialProjectiles: "/fractals/sprites/drops/special-projectiles.svg",
      projectile: "/fractals/sprites/projectile.svg",
    };
    (Object.entries(assets) as [SpriteKey, string][]).forEach(([key, src]) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => { if (!cancelled) spritesRef.current[key] = image; };
      image.src = src;
    });
    return () => { cancelled = true; };
  }, []);

  // Baixa e decodifica o cenário antes da primeira partida, evitando a troca tardia do piso e dos sprites.
  useEffect(() => { void preloadCemeteryImages(); }, []);

  const refreshFractalState = useCallback(async () => {
    const { data, error } = await (supabase.rpc as any)("get_fractal_state");
    if (error) { setShopError("Aplique as migrações SQL 0005 e 0006 para ativar a loja e a progressão."); return; }
    setFractalBalance(Number(data?.fractals ?? 0));
    setCoinBalance(Number(data?.coins ?? 0));
    setUnlockedCorruption(Number(data?.corruptionUnlocked ?? 0));
    setCompletedCorruptions(Array.isArray(data?.completedCorruptions) ? data.completedCorruptions : []);
    setPurchases(parsePurchaseState(data?.purchasedUpgrades));
  }, []);

  useEffect(() => { void refreshFractalState(); }, [refreshFractalState]);

  const purchaseUpgrade = async (upgrade: string) => {
    setShopBusy(true);
    try {
      const { data, error } = await (supabase.rpc as any)("purchase_fractal_upgrade", { _upgrade: upgrade });
      if (error) throw error;
      setFractalBalance(Number(data?.fractals ?? 0));
      setCoinBalance(Number(data?.coins ?? coinBalance));
      setPurchases(parsePurchaseState(data?.purchasedUpgrades));
      toast.success("Melhoria comprada permanentemente.");
    } catch (error: any) { toast.error(error?.message ?? "Não foi possível comprar."); }
    finally { setShopBusy(false); }
  };

  const exchangeFractals = async () => {
    const amount = Number(exchangeAmount);
    if (!Number.isInteger(amount) || amount < 10 || amount % 10 !== 0) {
      toast.error("Escolha uma quantidade em múltiplos de 10 fractais.");
      return;
    }
    if (amount > fractalBalance) {
      toast.error("Você não possui fractais suficientes.");
      return;
    }
    setShopBusy(true);
    try {
      const { data, error } = await (supabase.rpc as any)("exchange_fractals_for_coins", { _fractals: amount });
      if (error) throw error;
      setFractalBalance(Number(data?.fractals ?? 0));
      setCoinBalance(Number(data?.coins ?? 0));
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success(amount.toLocaleString("pt-BR") + " fractais convertidos em " + (amount / 10).toLocaleString("pt-BR") + " moedas.");
    } catch (error: any) {
      if (error?.code === "PGRST202") toast.error("Aplique a migração SQL 0007 para habilitar a troca por moedas.");
      else toast.error(error?.message ?? "Não foi possível converter os fractais.");
    } finally {
      setShopBusy(false);
    }
  };

  const start = useCallback(async () => {
    if (preparingArenaRef.current) return;
    preparingArenaRef.current = true;
    setPreparingArena(true);
    fractalAudio.unlock();
    setEarnedFractals(null);
    setRewardStatus("pending");
    try {
      // A partida só começa quando as imagens do cenário estão prontas (ou falharam e usarão o fallback vetorial).
      await preloadCemeteryImages();
      const { data: newRunId, error: runError } = await (supabase.rpc as any)("start_fractal_run", { _corruption: corruption, _weapon: selectedWeapon, _omen: selectedOmen });
      if (runError) { toast.error(runError.message); return; }
      setRunId(newRunId);
      const rect = canvasRef.current?.getBoundingClientRect();
      const width = Math.max(320, rect?.width ?? 760);
      const height = Math.max(380, rect?.height ?? 520);
      const game = makeGame(width, height, purchases, selectedWeapon, selectedOmen);
      spawnCemeteryUrns(game, 12);
      gameRef.current = game;
      eventRewardRemainingRef.current = 0;
      setEventRewardStep(0);
      setHud({ hp: game.player.hp, maxHp: game.player.maxHp, xp: 0, nextXp: 12, level: 1, kills: 0, elapsed: 0, moveSpeed: Math.round(game.player.speed), fps: 0, visibleEnemies: 0, phase: "Exploração", pressure: 0, event: null, runes: [] });
      setStats({ totalDamageDealt: 0, crystalsCollected: 0, highestLevel: 1 });
      setLevelChoices([]); setSelectedUpgrade(null); setFlippedCardId(null); setPaused(false); setResult(null); setBossMessage(false); setRunning(true);
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível preparar o cenário.");
    } finally {
      preparingArenaRef.current = false;
      setPreparingArena(false);
    }
  }, [corruption, purchases, selectedWeapon, selectedOmen]);

  const finishRun = useCallback((victory: boolean) => {
    if (!runId) {
      setRewardStatus("error");
      toast.error("Não foi possível localizar a expedição para validar as recompensas.");
      return;
    }

    setRewardStatus("pending");
    setEarnedFractals(null);

    void (supabase.rpc as any)("finish_fractal_run", { _run_id: runId, _victory: victory })
      .then(({ data, error }: any) => {
        if (error) {
          setRewardStatus("error");
          toast.error(error.message);
          return;
        }

        if (data?.earnedFractals === undefined) {
          setRewardStatus("error");
          toast.error("Aplique a migração 0008 para ativar a economia de recompensas dos Fractais.");
          return;
        }

        const earned = Number(data.earnedFractals ?? 0);
        const safeEarned = Number.isFinite(earned) ? Math.max(0, earned) : 0;
        setEarnedFractals(safeEarned);
        setRewardStatus("confirmed");
        setFractalBalance(Number(data?.fractals ?? 0));
        setCoinBalance(Number(data?.coins ?? 0));

        if (victory) {
          setUnlockedCorruption(Number(data?.corruptionUnlocked ?? 0));
          setCompletedCorruptions(Array.isArray(data?.completedCorruptions) ? data.completedCorruptions : []);
          toast.success(safeEarned > 0 ? `Expedição vitoriosa! Você conquistou ${safeEarned} fractais.` : "Corrupção concluída. O próximo nível foi liberado.");
        } else if (safeEarned > 0) {
          toast.info(`Você sobreviveu bravamente e resgatou ${safeEarned} fractais.`);
        } else {
          toast.info("Expedição encerrada. Não houve fractais extras nesta tentativa.");
        }
      })
      .catch((error: unknown) => {
        setRewardStatus("error");
        toast.error(error instanceof Error ? error.message : "Não foi possível validar as recompensas.");
      });
  }, [runId]);

  const chooseUpgrade = useCallback((upgrade: Upgrade) => {
    setSelectedUpgrade(null);
    setFlippedCardId(null);
    const game = gameRef.current;
    if (!game) return;
    const rarityPower = getUpgradeRarityMultiplier(upgrade.rarity);
    const existingRune = game.upgradeCounts[upgrade.id];
    game.upgradeCounts[upgrade.id] = { name: upgrade.name, count: (existingRune?.count ?? 0) + 1, rarity: upgrade.rarity ?? existingRune?.rarity ?? "normal" };
    if (upgrade.id === "special_area" && game.player.specialAreaStacks < 5) { game.player.specialAreaStacks += 1; game.player.pickupRadius = 85 * (1 + game.player.specialAreaStacks * 0.10); }
    if (upgrade.id === "special_experience" && game.player.specialExperienceStacks < 6) { game.player.specialExperienceStacks += 1; game.player.xpMultiplier = 1 + game.player.specialExperienceStacks * 0.05; }
    if (upgrade.id === "special_projectile_range" && game.player.projectileRangeStacks < 5) { game.player.projectileRangeStacks += 1; game.player.projectileRangeMultiplier = 1 + game.player.projectileRangeStacks * 0.10; }
    if (upgrade.id === "special_projectiles" && game.player.projectileStacks < MAX_EXTRA_PROJECTILES) game.player.projectileStacks += 1;
    if (upgrade.id === "weapon_mastery" && game.weaponLevel < 10) {
      game.weaponLevel += 1;
      game.player.damage *= 1 + 0.045 * rarityPower;
      game.player.fireRate /= 1 + 0.0125 * rarityPower;
      game.pickupLabels.push({ x: game.player.x, y: game.player.y - 28, text: `Arma nível ${game.weaponLevel}/10`, life: 1.4, maxLife: 1.4 });
    }
    if (upgrade.id === "weapon_evolution" && game.weaponLevel >= 10 && purchases[weaponProjectKey(game.weaponId)]) {
      game.evolved = true;
      game.player.damage *= 1.35;
      game.player.fireRate /= 1.10;
      game.rings = [...(game.rings ?? []), { x: game.player.x, y: game.player.y, r: 12, max: 230, life: 1.2, color: "#fbbf24" }];
      toast.success(`${WEAPON_CONFIG[game.weaponId].evolutionName} despertou!`);
    }
    if (upgrade.id === "anchor_soul" && purchases.anchor_soul && !game.anchorReviveUsed) {
      game.anchorReviveAvailable = true;
      game.pickupLabels.push({ x: game.player.x, y: game.player.y - 28, text: "Âncora da Alma vinculada", life: 1.5, maxLife: 1.5 });
    }
    if (upgrade.id === "power") game.player.damage *= 1 + 0.30 * rarityPower;
    // Attack speed uses a direct rate multiplier, so the displayed bonus matches the real effect.
    if (upgrade.id === "haste") game.player.fireRate /= 1 + 0.18 * rarityPower;
    if (upgrade.id === "vitality") {
      const previousMaxHp = game.player.maxHp;
      game.player.maxHp = previousMaxHp * (1 + 0.15 * rarityPower);
      game.player.hp = Math.min(game.player.maxHp, game.player.hp + previousMaxHp * 0.25 * rarityPower);
    }
    if (upgrade.id === "swift") game.player.speed *= 1 + 0.10 * rarityPower;
    if (eventRewardRemainingRef.current > 0) {
      eventRewardRemainingRef.current -= 1;
      if (eventRewardRemainingRef.current > 0) {
        setEventRewardStep(2);
        setSelectedUpgrade(null);
        setFlippedCardId(null);
        setLevelChoices(buildLevelChoices(game, purchases));
        return;
      }
      setEventRewardStep(0);
    }
    setLevelChoices([]);
  }, [purchases]);

  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;
    let lastHud = 0;
    let fpsFrames = 0;
    let fpsWindowStart = 0;
    let measuredFps = 0;
    let bossNotified = false;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const compactDevice = window.matchMedia("(max-width: 680px)").matches;
      const dpr = Math.min(window.devicePixelRatio || 1, compactDevice ? 1 : 1.25);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = compactDevice ? "low" : "medium";
      const game = gameRef.current;
      if (game) { game.width = rect.width; game.height = rect.height; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const onKeyDown = (event: KeyboardEvent) => { if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault(); keysRef.current.add(event.key.toLowerCase()); if (event.key.toLowerCase() === "p" || event.key === "Escape") setPaused((v) => !v); };
    const onKeyUp = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp);

    const tick = (now: number) => {
      const game = gameRef.current;
      if (!game) return;
      if (!game.last) game.last = now;
      const rawDt = Math.min(0.033, (now - game.last) / 1000);
      const dt = rawDt * speedMultiplier;
      game.last = now;
      if (!game.ended && !paused && levelChoices.length === 0) {
        game.elapsed += dt;
        game.player.invuln = Math.max(0, game.player.invuln - dt);
        game.player.hitFlash = Math.max(0, game.player.hitFlash - dt);
        game.damageNumbers.forEach((number) => { number.life -= dt; number.y -= 24 * dt; number.x += number.drift * dt; });
        game.damageNumbers = game.damageNumbers.filter((number) => number.life > 0);
        game.pickupLabels.forEach((label) => { label.life -= dt; label.y -= 18 * dt; });
        game.pickupLabels = game.pickupLabels.filter((label) => label.life > 0);
        game.player.castTimer = Math.max(0, game.player.castTimer - dt);
        const keys = keysRef.current;
        let dx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
        let dy = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
        if (joystickRef.current) { dx = joystickRef.current.x; dy = joystickRef.current.y; }
        game.player.moving = Math.hypot(dx, dy) > 0.05;
        if (game.player.moving) game.player.facing = directionFromVector(dx, dy);
        const mag = Math.hypot(dx, dy) || 1;
        const movedPlayer = resolveCemeteryCollision(game.player.x + (dx / mag) * game.player.speed * dt, game.player.y + (dy / mag) * game.player.speed * dt, 14, game.obstacles);
        game.player.x = movedPlayer.x;
        game.player.y = movedPlayer.y;

        if (!game.challengeEvent && game.nextChallengeEvent < CHALLENGE_EVENT_TIMES.length && game.elapsed >= CHALLENGE_EVENT_TIMES[game.nextChallengeEvent]) {
          const eventId = (game.nextChallengeEvent + 1) as 1 | 2;
          game.nextChallengeEvent += 1;
          if (eventId === 1) {
            const angle = Math.random() * Math.PI * 2;
            const offset = 175;
            game.challengeEvent = { id: 1, x: clamp(game.player.x + Math.cos(angle) * offset, -WORLD_LIMIT + 130, WORLD_LIMIT - 130), y: clamp(game.player.y + Math.sin(angle) * offset, -WORLD_LIMIT + 130, WORLD_LIMIT - 130), radius: 110, remaining: RITUAL_WINDOW, progress: 0 };
            toast.info("Ritual da Fenda Rúnica! Acumule 25 segundos dentro do círculo em até 50 segundos.");
          } else {
            const angle = Math.random() * Math.PI * 2;
            const ex = clamp(game.player.x + Math.cos(angle) * 360, -WORLD_LIMIT + 80, WORLD_LIMIT - 80);
            const ey = clamp(game.player.y + Math.sin(angle) * 360, -WORLD_LIMIT + 80, WORLD_LIMIT - 80);
            game.enemies.push({ x: ex, y: ey, hp: 1850, maxHp: 1850, speed: 62, radius: 30, damage: 22, color: "#8b45b5", xp: 0, type: "elite", attack: 1.2, flash: 0, windup: 0, targetX: ex, targetY: ey, dashTime: 0, summonedAtHalf: false, furyTriggered: false, isExecutioner: true });
            game.challengeEvent = { id: 2, x: ex, y: ey, radius: 0, remaining: EXECUTIONER_WINDOW, progress: 0 };
            toast.warning("Caçada do Algoz Espectral! Derrote-o em 60 segundos.");
          }
        }

        const activeEvent = game.challengeEvent;
        if (activeEvent) {
          activeEvent.remaining = Math.max(0, activeEvent.remaining - dt);
          if (activeEvent.id === 1) {
            const insideEvent = distance(game.player.x, game.player.y, activeEvent.x, activeEvent.y) <= activeEvent.radius;
            if (insideEvent) activeEvent.progress = Math.min(RITUAL_DURATION, activeEvent.progress + dt);
            if (activeEvent.progress >= RITUAL_DURATION) {
              const centerX = activeEvent.x, centerY = activeEvent.y;
              for (const enemy of game.enemies) {
                const d = distance(centerX, centerY, enemy.x, enemy.y);
                if (d < 275 && enemy.type !== "boss" && enemy.hp > 0) { enemy.hp = 0; game.kills += 1; }
                else if (d < 430) { const push = (430 - d) * 0.8; const angle = Math.atan2(enemy.y - centerY, enemy.x - centerX); enemy.x = clamp(enemy.x + Math.cos(angle) * push, -WORLD_LIMIT + enemy.radius, WORLD_LIMIT - enemy.radius); enemy.y = clamp(enemy.y + Math.sin(angle) * push, -WORLD_LIMIT + enemy.radius, WORLD_LIMIT - enemy.radius); }
              }
              game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);
              game.rings = [...(game.rings ?? []), { x: centerX, y: centerY, r: 12, max: 460, life: 1.1, color: "#c084fc" }];
              game.shake = Math.max(game.shake ?? 0, 13);
              for(let i=0;i<42;i++){const a=Math.random()*Math.PI*2,sp=70+Math.random()*260;game.particles.push({x:centerX,y:centerY,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.5+Math.random()*.5,color:i%2?"#d8b4fe":"#f0abfc"});}
              game.challengeEvent = null; eventRewardRemainingRef.current = 2; setEventRewardStep(1); setSelectedUpgrade(null); setFlippedCardId(null);
              setLevelChoices(buildLevelChoices(game,purchases));
              toast.success("Ritual da Fenda Rúnica concluído! A onda de choque rompeu a horda. Duas dádivas aguardam.");
            } else if (activeEvent.remaining <= 0) {
              game.challengeEvent = null; toast.error("O Ritual da Fenda Rúnica se dissipou antes de ser concluído.");
            }
          } else if (activeEvent.remaining <= 0) {
            game.enemies = game.enemies.filter((enemy) => !enemy.isExecutioner);
            game.challengeEvent = null; toast.error("O Algoz Espectral escapou para o Vazio.");
          }
        }

        const snapshot = getDifficultySnapshot(missionId, game.elapsed, corruption);
        const eventDensityBonus = game.challengeEvent ? 2 : 0;
        const spawnInterval = clamp(1.18 / (snapshot.enemySpawnScale * game.omenSpawnMultiplier + eventDensityBonus), 0.22, 1.35);
        game.spawnTimer -= dt;
        if (game.spawnTimer <= 0 && game.enemies.length < 50 && game.elapsed < RUN_DURATION_SECONDS) {
          spawnEnemy(game, missionId, game.elapsed, corruption);
          game.spawnTimer = spawnInterval * (0.78 + Math.random() * 0.45);
        }
        // O Guardião só desperta ao fim dos 12 minutos completos.
        game.shotTimer -= dt;
        if (game.shotTimer <= 0 && game.enemies.length > 0) {
          const targets = [...game.enemies].filter((enemy) => enemy.hp > 0).sort((a, b) => {
            const da = distance(game.player.x, game.player.y, a.x, a.y);
            const db = distance(game.player.x, game.player.y, b.x, b.y);
            const pa = a.type === "boss" ? 95 : a.type === "elite" ? 28 : a.type === "charger" ? 12 : 0;
            const pb = b.type === "boss" ? 95 : b.type === "elite" ? 28 : b.type === "charger" ? 12 : 0;
            return da - pa - (db - pb);
          });
          const target = targets[0];
          const d = Math.max(1, distance(game.player.x, game.player.y, target.x, target.y));
          const baseAngle = Math.atan2(target.y - game.player.y, target.x - game.player.x);
          const weaponPower = (1 + (game.weaponLevel - 1) * 0.055) * (game.evolved ? 1.15 : 1);
          const weaponDamage = game.player.damage * weaponPower;
          const pushShot = (x: number, y: number, enemy: Enemy, damage: number, speed: number, options: Partial<Shot> = {}) => {
            const dx = enemy.x - x, dy = enemy.y - y, length = Math.max(1, Math.hypot(dx, dy));
            game.shots.push({
              x, y, vx: dx / length * speed, vy: dy / length * speed, damage,
              life: Math.max(0.18, length / speed + 0.24), hitTargets: [], bouncesRemaining: 0, piercesRemaining: 0,
              isChainLightning: true, targetEnemy: enemy, ...options,
            });
          };
          game.player.castFacing = directionFromVector(target.x - game.player.x, target.y - game.player.y);
          game.player.castTimer = 0.24;

          if (game.weaponId === "spectral_scythe") {
            const radius = game.evolved ? 255 : 205;
            const count = game.evolved ? 5 : Math.min(3, 1 + Math.floor(game.weaponLevel / 4));
            const nearby = targets.filter((enemy) => distance(game.player.x, game.player.y, enemy.x, enemy.y) <= radius).slice(0, count);
            for (const enemy of nearby.length ? nearby : [target]) pushShot(game.player.x, game.player.y, enemy, weaponDamage * (game.evolved ? 1.05 : 0.9), 900);
            game.rings = [...(game.rings ?? []), { x: game.player.x, y: game.player.y, r: 22, max: radius, life: 0.22, color: "#c4b5fd" }];
          } else if (game.weaponId === "orbital_swords") {
            const count = Math.min(8, 2 + Math.floor(game.weaponLevel / 2) + (game.evolved ? 2 : 0));
            const nearby = targets.filter((enemy) => distance(game.player.x, game.player.y, enemy.x, enemy.y) <= (game.evolved ? 185 : 145)).slice(0, count);
            nearby.forEach((enemy, index) => {
              const angle = game.elapsed * 2.8 + index * Math.PI * 2 / count;
              const sx = game.player.x + Math.cos(angle) * 66, sy = game.player.y + Math.sin(angle) * 66;
              pushShot(sx, sy, enemy, weaponDamage * 0.72, 760);
            });
            game.rings = [...(game.rings ?? []), { x: game.player.x, y: game.player.y, r: 62, max: 86, life: 0.18, color: "#a78bfa" }];
          } else if (game.weaponId === "gravity_shackle") {
            const radius = game.evolved ? 300 : 235;
            const nearby = targets.filter((enemy) => distance(game.player.x, game.player.y, enemy.x, enemy.y) <= radius).slice(0, game.evolved ? 7 : 5);
            for (const enemy of nearby) {
              const dx = game.player.x - enemy.x, dy = game.player.y - enemy.y, length = Math.max(1, Math.hypot(dx, dy));
              const pull = Math.min(game.evolved ? 72 : 48, length * 0.28);
              enemy.x += dx / length * pull; enemy.y += dy / length * pull;
              pushShot(game.player.x, game.player.y, enemy, weaponDamage * (game.evolved ? 0.88 : 0.68), 680);
            }
            game.rings = [...(game.rings ?? []), { x: game.player.x, y: game.player.y, r: 18, max: radius, life: 0.42, color: "#67e8f9" }];
          } else if (game.weaponId === "rune_sentinels") {
            const count = Math.min(5, 2 + Math.floor(game.weaponLevel / 3) + (game.evolved ? 1 : 0));
            for (let index = 0; index < count; index++) {
              const enemy = targets[index % targets.length];
              const angle = game.elapsed * 0.7 + index * Math.PI * 2 / count;
              const sx = game.player.x + Math.cos(angle) * 62, sy = game.player.y + Math.sin(angle) * 62;
              pushShot(sx, sy, enemy, weaponDamage * 0.64, 520);
              game.particles.push({ x: sx, y: sy, vx: 0, vy: 0, life: 0.18, color: "#fbbf24" });
            }
          } else {
            const isNucleus = game.weaponId === "unstable_core";
            const projectileCount = game.weaponId === "void_revolver" ? (game.evolved ? 6 : 1 + game.player.projectileStacks) : 1;
            const spread = projectileCount === 1 ? [0] : game.evolved && game.weaponId === "void_revolver"
              ? Array.from({ length: projectileCount }, (_, index) => (index - (projectileCount - 1) / 2) * 0.11)
              : projectileCount === 2 ? [-0.095, 0.095] : [-0.16, 0, 0.16];
            const speed = (isNucleus ? 310 : 440) * game.player.projectileRangeMultiplier;
            const damageScale = game.weaponId === "void_revolver" && projectileCount > 1 ? 0.68 : isNucleus ? 1.45 : 1;
            for (const angleOffset of spread) {
              const angle = baseAngle + angleOffset;
              game.shots.push({
                x: game.player.x, y: game.player.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                damage: weaponDamage * damageScale, life: game.player.projectileLife * (isNucleus ? 1.15 : 1),
                hitTargets: [], bouncesRemaining: purchases.ricochet, piercesRemaining: purchases.piercing,
              });
            }
          }
          fractalAudio.shoot();
          game.shotTimer = game.player.fireRate * (game.weaponId === "gravity_shackle" ? 1.18 : game.weaponId === "unstable_core" ? 1.12 : 1);
        }
        const desiredAction: PlayerVisualAction = game.player.castTimer > 0 ? "cast" : game.player.moving ? "move" : "idle";
        const desiredDirection = desiredAction === "cast" ? game.player.castFacing : game.player.facing;
        if (desiredAction !== game.player.spriteAction || desiredDirection !== game.player.spriteDirection) {
          game.player.previousSpriteAction = game.player.spriteAction;
          game.player.previousSpriteDirection = game.player.spriteDirection;
          game.player.spriteAction = desiredAction;
          game.player.spriteDirection = desiredDirection;
          game.player.spriteBlend = 0;
        } else if (game.player.spriteBlend < 1) {
          game.player.spriteBlend = Math.min(1, game.player.spriteBlend + dt / 0.12);
        }
        game.shots.forEach((shot) => {
          if (shot.targetEnemy) {
            if (shot.targetEnemy.hp <= 0) { shot.life = 0; return; }
            const dx = shot.targetEnemy.x - shot.x, dy = shot.targetEnemy.y - shot.y;
            const d = Math.max(1, Math.hypot(dx, dy));
            const speed = Math.max(1, Math.hypot(shot.vx, shot.vy));
            shot.vx = (dx / d) * speed;
            shot.vy = (dy / d) * speed;
          }
          shot.x += shot.vx * dt;
          shot.y += shot.vy * dt;
          shot.life -= dt;
        });
        const currentZoom = zoomRef.current;
        const cameraLeft = game.player.x - game.width / (2 * currentZoom), cameraTop = game.player.y - game.height / (2 * currentZoom);
        game.shots = game.shots.filter((shot) => shot.life > 0 && shot.x > cameraLeft - 20 && shot.x < cameraLeft + game.width / currentZoom + 20 && shot.y > cameraTop - 20 && shot.y < cameraTop + game.height / currentZoom + 20);
        const movementGrid = game.enemies.length < 20 ? buildEnemySpatialGrid(game.enemies) : null;
        for (const enemy of game.enemies) {
          const d = Math.max(1, distance(game.player.x, game.player.y, enemy.x, enemy.y));
          enemy.flash = Math.max(0, enemy.flash - dt);
          enemy.attack = Math.max(0, enemy.attack - dt);
          if (enemy.type === "boss") {
            const inFury = enemy.hp <= enemy.maxHp * 0.30;
            if (inFury && !enemy.furyTriggered) {
              enemy.furyTriggered = true;
              game.shake = 14;
              for (let i = 0; i < 26; i++) { const angle = Math.random() * Math.PI * 2; const speed = 70 + Math.random() * 190; game.particles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.45 + Math.random() * 0.45, color: i % 2 ? "#ff4b55" : "#ff9a54" }); }
              toast.error("O GUARDIÃO ENTROU EM FÚRIA!");
            }
            if (enemy.windup > 0) {
              enemy.windup -= dt;
              if (enemy.windup <= 0 && distance(game.player.x, game.player.y, enemy.targetX, enemy.targetY) < 101 && game.player.invuln <= 0) {
                game.player.hp = Math.max(0, game.player.hp - 28); game.player.invuln = 0.85; game.player.hitFlash = 0.3; game.shake = Math.max(game.shake ?? 0, 7);
              }
            } else if (enemy.attack <= 0) {
              const phaseTwo = enemy.hp <= enemy.maxHp * 0.5;
              enemy.targetX = game.player.x; enemy.targetY = game.player.y; enemy.windup = (phaseTwo ? 0.82 : 1.05) * (inFury ? 0.75 : 1); enemy.attack = (phaseTwo ? 3.8 : 5.1) * (inFury ? 0.75 : 1);
            }
            if (enemy.hp <= enemy.maxHp * 0.5 && !enemy.summonedAtHalf) {
              enemy.summonedAtHalf = true;
              for (let i = 0; i < 3; i++) {
                const angle = (Math.PI * 2 * i) / 3;
                game.enemies.push({ x: enemy.x + Math.cos(angle) * 58, y: enemy.y + Math.sin(angle) * 58, hp: 34, maxHp: 34, speed: 62, radius: 10, damage: 8, color: "#9b91b4", xp: 2, type: "wraith", attack: 0, flash: 0, windup: 0, targetX: 0, targetY: 0, dashTime: 0, summonedAtHalf: false, furyTriggered: false });
              }
            }
            const separation = movementGrid ? getEnemySeparation(enemy, movementGrid) : NO_ENEMY_SEPARATION;
            const steerX = (game.player.x - enemy.x) / d + separation.x * 0.28;
            const steerY = (game.player.y - enemy.y) / d + separation.y * 0.28;
            const steerLength = Math.max(1, Math.hypot(steerX, steerY));
            const phaseTwoSpeed = inFury ? 1.35 : enemy.hp <= enemy.maxHp * 0.5 ? 1.16 : 1;
            enemy.x += (steerX / steerLength) * enemy.speed * phaseTwoSpeed * dt;
            enemy.y += (steerY / steerLength) * enemy.speed * phaseTwoSpeed * dt;
          } else if (enemy.type === "charger") {
            if (enemy.dashTime > 0) {
              enemy.dashTime = Math.max(0, enemy.dashTime - dt);
              enemy.x += enemy.targetX * 390 * dt; enemy.y += enemy.targetY * 390 * dt;
              const dashDistance = distance(game.player.x, game.player.y, enemy.x, enemy.y);
              if (dashDistance < enemy.radius + 20 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - enemy.damage); game.player.invuln = .65; game.player.hitFlash = 0.3; game.shake = Math.max(game.shake ?? 0, 7); enemy.dashTime = 0; }
            } else if (enemy.windup > 0) {
              enemy.windup = Math.max(0, enemy.windup - dt);
              if (enemy.windup === 0) { enemy.dashTime = .34; enemy.attack = 2.25; }
            } else if (enemy.attack <= 0 && d < 245) {
              const predictedX = game.player.x + dx * game.player.speed * 0.18;
              const predictedY = game.player.y + dy * game.player.speed * 0.18;
              const aimDistance = Math.max(1, distance(enemy.x, enemy.y, predictedX, predictedY));
              enemy.targetX = (predictedX - enemy.x) / aimDistance; enemy.targetY = (predictedY - enemy.y) / aimDistance;
              enemy.windup = .52;
            } else {
              const separation = movementGrid ? getEnemySeparation(enemy, movementGrid) : NO_ENEMY_SEPARATION;
              const steerX = (game.player.x - enemy.x) / d + separation.x * 0.22;
              const steerY = (game.player.y - enemy.y) / d + separation.y * 0.22;
              const steerLength = Math.max(1, Math.hypot(steerX, steerY));
              enemy.x += (steerX / steerLength) * enemy.speed * dt;
              enemy.y += (steerY / steerLength) * enemy.speed * dt;
              if (d < enemy.radius + 15 && enemy.attack <= 0 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - enemy.damage); game.player.invuln = .65; game.player.hitFlash = 0.3; game.shake = Math.max(game.shake ?? 0, 7); enemy.attack = 1.1; }
            }
          } else if (enemy.type === "brute") {
            if (enemy.windup > 0) {
              enemy.windup = Math.max(0, enemy.windup - dt);
              if (enemy.windup === 0) {
                if (distance(game.player.x, game.player.y, enemy.x, enemy.y) < 78 + 12 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - enemy.damage * 1.35); game.player.invuln = .8; game.player.hitFlash = 0.3; game.shake = Math.max(game.shake ?? 0, 7); }
                for (let i=0;i<5;i++) { const a=i*Math.PI*2/5; game.particles.push({x:enemy.x,y:enemy.y,vx:Math.cos(a)*105,vy:Math.sin(a)*105,life:.35,color:"#e7a56d"}); }
                enemy.attack = 2.7;
              }
            } else {
              if (d < 112 && enemy.attack <= 0) enemy.windup = .72;
              else {
                const separation = movementGrid ? getEnemySeparation(enemy, movementGrid) : NO_ENEMY_SEPARATION;
                const approach = d < 88 ? 0.32 : 1;
                const steerX = (game.player.x - enemy.x) / d * approach + separation.x * 0.26;
                const steerY = (game.player.y - enemy.y) / d * approach + separation.y * 0.26;
                const steerLength = Math.max(1, Math.hypot(steerX, steerY));
                enemy.x += (steerX / steerLength) * enemy.speed * dt;
                enemy.y += (steerY / steerLength) * enemy.speed * dt;
              }
              if (d < enemy.radius + 15 && enemy.attack <= 0 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - enemy.damage); game.player.invuln = .72; game.player.hitFlash = 0.3; game.shake = Math.max(game.shake ?? 0, 7); enemy.attack = 1.2; }
            }
          } else {
            const separation = movementGrid ? getEnemySeparation(enemy, movementGrid) : NO_ENEMY_SEPARATION;
            const ux = (game.player.x - enemy.x) / d, uy = (game.player.y - enemy.y) / d;
            if (enemy.type === "wraith") {
              const side = Math.sin(enemy.x * 0.026 + enemy.y * 0.019) >= 0 ? 1 : -1;
              const tangentX = -uy * side, tangentY = ux * side;
              const approach = d < 62 ? 0.34 : d > 150 ? 1 : 0.72;
              const steerX = ux * approach + tangentX * 0.34 + separation.x * 0.48;
              const steerY = uy * approach + tangentY * 0.34 + separation.y * 0.48;
              const steerLength = Math.max(1, Math.hypot(steerX, steerY));
              enemy.x += (steerX / steerLength) * enemy.speed * dt;
              enemy.y += (steerY / steerLength) * enemy.speed * dt;
            } else {
              const targetRadius = 92;
              const approach = clamp((d - targetRadius) / 65, -0.42, 0.72);
              const side = Math.sin(enemy.x * 0.017 - enemy.y * 0.023) >= 0 ? 1 : -1;
              const steerX = ux * approach - uy * side * 0.48 + separation.x * 0.38;
              const steerY = uy * approach + ux * side * 0.48 + separation.y * 0.38;
              const steerLength = Math.max(1, Math.hypot(steerX, steerY));
              enemy.x += (steerX / steerLength) * enemy.speed * dt;
              enemy.y += (steerY / steerLength) * enemy.speed * dt;
            }
            if (enemy.type === "elite" && enemy.attack <= 0) {
              if (d < 105 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - 7); game.player.invuln = 0.35; game.player.hitFlash = 0.3; game.shake = Math.max(game.shake ?? 0, 7); }
              enemy.attack = 1.7;
            }
            if (enemy.type === "wraith" && d < enemy.radius + 15 && enemy.attack <= 0 && game.player.invuln <= 0) {
              game.player.hp = Math.max(0, game.player.hp - enemy.damage); game.player.invuln = 0.72; game.player.hitFlash = 0.3; game.shake = Math.max(game.shake ?? 0, 7); enemy.attack = 0.8;
            }
          }
        }
        for (const enemy of game.enemies) { const resolved = resolveCemeteryCollision(enemy.x, enemy.y, enemy.radius, game.obstacles); enemy.x = resolved.x; enemy.y = resolved.y; }
        const collisionGrid = buildEnemySpatialGrid(game.enemies);
        for (const shot of game.shots) {
          for (const enemy of getNearbyEnemies(shot.x, shot.y, collisionGrid)) {
            if (shot.hitTargets.includes(enemy)) continue;
            if (shot.targetEnemy && shot.targetEnemy !== enemy) continue;
            const hitRadius = enemy.radius + 5;
            const hitX = shot.x - enemy.x;
            const hitY = shot.y - enemy.y;
            if (enemy.hp > 0 && hitX * hitX + hitY * hitY < hitRadius * hitRadius) {
              const appliedDamage = Math.min(enemy.hp, shot.damage);
              enemy.hp -= shot.damage; game.totalDamageDealt += appliedDamage; enemy.flash = 0.09; for (let k = 0; k < 2; k++) game.particles.push({ x: shot.x, y: shot.y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.22, color: shot.isChainLightning ? "#67e8f9" : "#f3dcff" });
              game.damageNumbers.push({ x: enemy.x + (Math.random() - 0.5) * 10, y: enemy.y - enemy.radius - 8, value: shot.damage, life: 0.82, maxLife: 0.82, drift: (Math.random() - 0.5) * 14 });
              if (game.damageNumbers.length > 20) game.damageNumbers.shift();
              shot.hitTargets.push(enemy);

              // Núcleo Instável: o impacto libera estilhaços explosivos contra até três alvos próximos.
              if (game.weaponId === "unstable_core" && !shot.isSplash) {
                const radius = game.evolved ? 190 : 135;
                const splashTargets = game.enemies
                  .filter((candidate) => candidate !== enemy && candidate.hp > 0 && distance(enemy.x, enemy.y, candidate.x, candidate.y) <= radius)
                  .sort((a, b) => distance(enemy.x, enemy.y, a.x, a.y) - distance(enemy.x, enemy.y, b.x, b.y))
                  .slice(0, game.evolved ? 5 : 3);
                for (const candidate of splashTargets) {
                  const splashDistance = Math.max(1, distance(enemy.x, enemy.y, candidate.x, candidate.y));
                  const splashSpeed = 780;
                  game.shots.push({ x: enemy.x, y: enemy.y, vx: (candidate.x - enemy.x) / splashDistance * splashSpeed, vy: (candidate.y - enemy.y) / splashDistance * splashSpeed, damage: shot.damage * (game.evolved ? 0.68 : 0.52), life: splashDistance / splashSpeed + 0.22, hitTargets: [enemy], bouncesRemaining: 0, piercesRemaining: 0, isChainLightning: true, isSplash: true, targetEnemy: candidate });
                }
                game.rings = [...(game.rings ?? []), { x: enemy.x, y: enemy.y, r: 12, max: radius, life: 0.35, color: "#d8b4fe" }];
              }

              // Descarga em cadeia: cada impacto do projétil original pode chamar alvos extras.
              if (!shot.isChainLightning && purchases.chain_lightning > 0) {
                const chainLevel = Math.min(3, purchases.chain_lightning);
                const chainCount = chainLevel;
                const chainDamage = [0, 0.55, 0.65, 0.75][chainLevel];
                const chainRange = [0, 180, 215, 250][chainLevel];
                const chainSpeed = 720;
                const chainTargets = game.enemies
                  .filter((candidate) => candidate !== enemy && candidate.hp > 0 && !shot.hitTargets.includes(candidate) && distance(enemy.x, enemy.y, candidate.x, candidate.y) <= chainRange)
                  .sort((a, b) => distance(enemy.x, enemy.y, a.x, a.y) - distance(enemy.x, enemy.y, b.x, b.y))
                  .slice(0, chainCount);
                for (const chainTarget of chainTargets) {
                  const chainDistance = Math.max(1, distance(enemy.x, enemy.y, chainTarget.x, chainTarget.y));
                  game.shots.push({
                    x: enemy.x, y: enemy.y,
                    vx: ((chainTarget.x - enemy.x) / chainDistance) * chainSpeed,
                    vy: ((chainTarget.y - enemy.y) / chainDistance) * chainSpeed,
                    damage: Math.max(1, Math.round(shot.damage * chainDamage)),
                    life: chainDistance / chainSpeed + 0.2,
                    hitTargets: [...shot.hitTargets],
                    bouncesRemaining: 0,
                    piercesRemaining: 0,
                    isChainLightning: true,
                    targetEnemy: chainTarget,
                  });
                }
              }

              if (enemy.hp <= 0) {
                game.kills += 1;
                fractalAudio.kill(enemy.type === "boss" || enemy.type === "elite");
                if (enemy.type !== "boss") {
                  game.gems.push({ x: enemy.x, y: enemy.y, value: enemy.xp, radius: 5 });
                  const fortuneBonus = [0, 0.10, 0.20, 0.30][Math.max(0, Math.min(3, purchases.fortune))];
                  const specialDropChance = purchases.fortune > 0 ? Math.min(0.12, 0.025 * (1 + fortuneBonus) * game.omenRewardMultiplier) : 0;
                  if (!enemy.isExecutioner && (enemy.type === "elite" || enemy.type === "brute") && specialDropChance > 0 && Math.random() < specialDropChance) {
                    const eligible: SpecialDrop["kind"][] = [];
                    if (purchases.area >= 1 && game.player.specialAreaStacks < 5) eligible.push("area");
                    if (purchases.experience >= 1 && game.player.specialExperienceStacks < 6) eligible.push("experience");
                    if (purchases.projectile_range >= 1 && game.player.projectileRangeStacks < 5) eligible.push("projectile_range");
                    if (purchases.projectiles >= 1 && game.player.projectileStacks < MAX_EXTRA_PROJECTILES) eligible.push("projectiles");
                    if (eligible.length) game.specialDrops.push({ x: enemy.x, y: enemy.y, kind: eligible[Math.floor(Math.random() * eligible.length)], radius: 13 });
                  }
                  if(enemy.isExecutioner){
                    game.specialDrops.push({x:enemy.x-18,y:enemy.y,kind:"food",radius:15},{x:enemy.x+18,y:enemy.y,kind:"void",radius:15});
                    game.challengeEvent=null;eventRewardRemainingRef.current=2;setEventRewardStep(1);setSelectedUpgrade(null);setFlippedCardId(null);
                    setLevelChoices(buildLevelChoices(game,purchases));
                    toast.success("Algoz Espectral derrotado! O cemitério reverbera com dádivas!");
                  }
                } else { game.ended = true; setStats({ totalDamageDealt: Math.round(game.totalDamageDealt), crystalsCollected: game.crystalsCollected, highestLevel: game.highestLevel }); setResult("victory"); fractalAudio.victory(); finishRun(true); }
                { const big = enemy.type === "boss" || enemy.type === "elite"; const count = big ? 30 : 12;
                  for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2; const sp = 60 + Math.random() * (big ? 260 : 170); game.particles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + Math.random() * 0.4, color: i % 3 === 0 ? "#fff1ff" : i % 3 === 1 ? "#b98cff" : enemy.color }); }
                  (game.rings ??= []).push({ x: enemy.x, y: enemy.y, r: 6, max: big ? 140 : 46, life: big ? 0.6 : 0.32, color: big ? "#e9c46a" : "#c9a2ff" });
                  if (big) game.shake = Math.max(game.shake ?? 0, enemy.type === "boss" ? 16 : 9); }
              }
              // Perfuração prioriza inimigos alinhados à frente; ricochete busca um novo alvo quando não há alvo alinhado.
              let continued = false;
              const projectileSpeed = Math.max(1, Math.hypot(shot.vx, shot.vy));
              const dirX = shot.vx / projectileSpeed, dirY = shot.vy / projectileSpeed;

              if (!shot.isChainLightning && shot.piercesRemaining > 0) {
                // A perfuração sempre mantém o vetor original; o projétil segue mesmo sem outro alvo alinhado.
                shot.targetEnemy = undefined;
                shot.x = enemy.x + dirX * (enemy.radius + 8);
                shot.y = enemy.y + dirY * (enemy.radius + 8);
                shot.piercesRemaining -= 1;
                shot.life = Math.max(shot.life, 0.6);
                continued = true;
              }

              if (!continued && !shot.isChainLightning && shot.bouncesRemaining > 0) {
                const nextTarget = game.enemies
                  .filter((candidate) => candidate !== enemy && candidate.hp > 0 && !shot.hitTargets.includes(candidate) && distance(enemy.x, enemy.y, candidate.x, candidate.y) <= 280)
                  .sort((a, b) => distance(enemy.x, enemy.y, a.x, a.y) - distance(enemy.x, enemy.y, b.x, b.y))[0];
                if (nextTarget) {
                  const nextDistance = Math.max(1, distance(enemy.x, enemy.y, nextTarget.x, nextTarget.y));
                  shot.x = enemy.x;
                  shot.y = enemy.y;
                  shot.vx = ((nextTarget.x - enemy.x) / nextDistance) * projectileSpeed;
                  shot.vy = ((nextTarget.y - enemy.y) / nextDistance) * projectileSpeed;
                  shot.targetEnemy = nextTarget;
                  shot.bouncesRemaining -= 1;
                  shot.life = Math.max(shot.life, nextDistance / projectileSpeed + 0.18);
                  continued = true;
                }
              }

              if (!continued) shot.life = 0;
              break;
            }
          }
        }
        for (const shot of game.shots) {
          if (shot.life <= 0) continue;
          for (const urn of game.urns) {
            if (urn.broken) continue;
            const dx = shot.x - urn.x, dy = shot.y - urn.y;
            if (dx*dx + dy*dy <= (urn.radius + 6) * (urn.radius + 6)) {
              shot.life = 0; urn.hp -= shot.damage >= 45 ? 2 : 1;
              for(let p=0;p<4;p++){const a=Math.random()*Math.PI*2,sp=25+Math.random()*85;game.particles.push({x:urn.x,y:urn.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.25+Math.random()*.25,color:"#b7a4b9"});}
              if(urn.hp<=0){urn.broken=true;for(let p=0;p<18;p++){const a=Math.random()*Math.PI*2,sp=45+Math.random()*170;game.particles.push({x:urn.x,y:urn.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.35+Math.random()*.45,color:p%2?"#c4b5c5":"#8f7b99"});}
                const roll = Math.random();
                const fortuneBonus = [0, 0.10, 0.20, 0.30][Math.max(0, Math.min(3, purchases.fortune))];
                const specialMultiplier = (1 + fortuneBonus) * game.omenRewardMultiplier;
                const foodChance = Math.min(0.18, 0.09 * specialMultiplier);
                const voidChance = Math.min(0.04, 0.01 * specialMultiplier);
                if (roll < 0.20) game.gems.push({ x: urn.x, y: urn.y, value: 15, radius: 8, runeCrystal: true });
                else if (roll < 0.20 + foodChance) game.specialDrops.push({ x: urn.x, y: urn.y, kind: "food", radius: 14 });
                else if (roll < 0.20 + foodChance + voidChance) game.specialDrops.push({ x: urn.x, y: urn.y, kind: "void", radius: 14 });
                // A Fortuna aumenta apenas o peso dos espólios especiais; cristais de XP mantêm 20%.
              }
              break;
            }
          }
        }
        game.enemies = game.enemies.filter((enemy) => enemy.hp > 0 && (enemy.type === "boss" || enemy.isExecutioner || distance(enemy.x, enemy.y, game.player.x, game.player.y) < Math.max(game.width, game.height) / zoomRef.current * 1.45));
        game.gems.forEach((gem) => {
          const previousX = gem.x, previousY = gem.y;
          const d = distance(game.player.x, game.player.y, gem.x, gem.y);
          if (d <= game.player.pickupRadius) {
            const pull = 260 * dt;
            gem.x += ((game.player.x - gem.x) / Math.max(1, d)) * pull;
            gem.y += ((game.player.y - gem.y) / Math.max(1, d)) * pull;
            game.particles.push({ x: gem.x, y: gem.y, vx: (game.player.x - gem.x) * 0.16 + (Math.random() - 0.5) * 22, vy: (game.player.y - gem.y) * 0.16 + (Math.random() - 0.5) * 22, life: 0.22, color: Math.random() > 0.5 ? "#a78bfa" : "#38bdf8" });
            // O rastro é desenhado no Canvas usando a posição anterior e a atual.
            gem.previousX = previousX;
            gem.previousY = previousY;
          }
          if (d < 17) {
            fractalAudio.gem();
            game.player.xp += gem.value * game.player.xpMultiplier;
            game.crystalsCollected += gem.runeCrystal ? 5 : 1;
            gem.value = 0;
          }
        });
        game.gems = game.gems.filter((gem) => gem.value > 0 && distance(gem.x, gem.y, game.player.x, game.player.y) < Math.max(game.width, game.height) * 1.6);
        game.specialDrops.forEach((drop) => {
          const d = distance(game.player.x, game.player.y, drop.x, drop.y);
          if (d < game.player.pickupRadius) { drop.x += ((game.player.x - drop.x) / Math.max(1, d)) * 280 * dt; drop.y += ((game.player.y - drop.y) / Math.max(1, d)) * 280 * dt; }
          if (d < 18) {
            if(drop.kind==="food"){game.player.hp=Math.min(game.player.maxHp,game.player.hp+game.player.maxHp*.4);game.pickupLabels.push({x:game.player.x,y:game.player.y-28,text:"+40% HP! Iguaria Cósmica 🍔",life:1.8,maxLife:1.8});drop.radius=0;fractalAudio.special();return;}
            if(drop.kind==="void"){for(const gem of game.gems){gem.x=game.player.x;gem.y=game.player.y;}game.pickupLabels.push({x:game.player.x,y:game.player.y-28,text:"Vórtice do Vazio! Cristais Sugados!",life:1.8,maxLife:1.8});drop.radius=0;fractalAudio.special();return;}
            fractalAudio.special();
            const specialUpgradeId: UpgradeId = drop.kind === "area" ? "special_area" : drop.kind === "experience" ? "special_experience" : drop.kind === "projectile_range" ? "special_projectile_range" : "special_projectiles";
            const specialUpgrade = SPECIAL_UPGRADES.find((item) => item.id === specialUpgradeId)!;
            const currentRune = game.upgradeCounts[specialUpgradeId];
            game.upgradeCounts[specialUpgradeId] = { name: specialUpgrade.name, count: (currentRune?.count ?? 0) + 1, rarity: "normal" };
            const pickupNames: Record<SpecialDrop["kind"], string> = {
              area: "Ímã de Fragmentos",
              experience: "Eco do Conhecimento",
              projectile_range: "Ressonância de Alcance",
              projectiles: "Coroa de Estilhaços",
              food: "Iguaria de uma Dimensão Perdida",
              void: "Vórtice do Vazio",
            };
            game.pickupLabels.push({ x: drop.x, y: drop.y - 22, text: pickupNames[drop.kind], life: 1.25, maxLife: 1.25 });
            if (drop.kind === "area" && game.player.specialAreaStacks < 5) { game.player.specialAreaStacks += 1; game.player.pickupRadius = 85 * (1 + game.player.specialAreaStacks * 0.10); }
            if (drop.kind === "experience" && game.player.specialExperienceStacks < 6) { game.player.specialExperienceStacks += 1; game.player.xpMultiplier = 1 + game.player.specialExperienceStacks * 0.05; }
            if (drop.kind === "projectile_range" && game.player.projectileRangeStacks < 5) { game.player.projectileRangeStacks += 1; game.player.projectileRangeMultiplier = 1 + game.player.projectileRangeStacks * 0.10; }
            if (drop.kind === "projectiles" && game.player.projectileStacks < MAX_EXTRA_PROJECTILES) game.player.projectileStacks += 1;
            drop.radius = 0;
          }
        });
        game.specialDrops = game.specialDrops.filter((drop) => drop.radius > 0 && distance(drop.x, drop.y, game.player.x, game.player.y) < Math.max(game.width, game.height) * 1.6);
        game.urns = game.urns.filter((urn) => !urn.broken);
        if(Math.floor(game.elapsed/60)>=game.nextUrnMinute){spawnCemeteryUrns(game,8+Math.floor(Math.random()*5));game.nextUrnMinute=Math.floor(game.elapsed/60)+1;}
        game.particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
        game.particles = game.particles.filter((p) => p.life > 0);
        if (game.particles.length > 140) game.particles.splice(0, game.particles.length - 140);
        game.shake = Math.max(0, (game.shake ?? 0) - dt * 30);
        if (game.rings) { game.rings.forEach((ring) => { ring.life -= dt; ring.r += (ring.max - ring.r) * Math.min(1, dt * 9); }); game.rings = game.rings.filter((ring) => ring.life > 0).slice(-20); }
        if (game.gems.length > 70) {
          const nearby: Gem[] = [];
          const clusters = new Map<string, Gem>();
          for (const gem of game.gems) {
            if (gem.runeCrystal || distance(gem.x, gem.y, game.player.x, game.player.y) < 240) { nearby.push(gem); continue; }
            const cellX = Math.floor(gem.x / 180), cellY = Math.floor(gem.y / 180), key = cellX + ":" + cellY;
            const cluster = clusters.get(key);
            if (cluster) cluster.value += gem.value;
            else clusters.set(key, { x: cellX * 180 + 90, y: cellY * 180 + 90, value: gem.value, radius: 7 });
          }
          game.gems = [...nearby, ...clusters.values()];
        }
        if (game.player.xp >= game.player.nextXp && !game.ended && eventRewardRemainingRef.current === 0) {
          game.player.xp -= game.player.nextXp; game.player.level += 1; game.highestLevel = Math.max(game.highestLevel, game.player.level); fractalAudio.levelUp(); game.player.nextXp = Math.floor(game.player.nextXp * 1.32 + 5);
          
          setSelectedUpgrade(null);
              setFlippedCardId(null);
              setLevelChoices(buildLevelChoices(game, purchases));
        }
        if (game.omenId === "revenge") {
          game.omenRevengeCooldown = Math.max(0, game.omenRevengeCooldown - dt);
          if (game.player.hp < game.lastObservedHp && game.omenRevengeCooldown <= 0) {
            const radius = 145;
            const targets = game.enemies.filter((enemy) => enemy.hp > 0 && distance(game.player.x, game.player.y, enemy.x, enemy.y) <= radius).slice(0, 10);
            for (const enemy of targets) {
              const hitDistance = Math.max(1, distance(game.player.x, game.player.y, enemy.x, enemy.y));
              game.shots.push({ x: game.player.x, y: game.player.y, vx: (enemy.x - game.player.x) / hitDistance * 850, vy: (enemy.y - game.player.y) / hitDistance * 850, damage: game.player.damage * 0.55, life: hitDistance / 850 + 0.25, hitTargets: [], bouncesRemaining: 0, piercesRemaining: 0, isChainLightning: true, targetEnemy: enemy });
            }
            game.rings = [...(game.rings ?? []), { x: game.player.x, y: game.player.y, r: 18, max: radius, life: 0.35, color: "#fb7185" }];
            game.omenRevengeCooldown = 4;
          }
          game.lastObservedHp = game.player.hp;
        }
        if (game.player.hp <= 0 && game.anchorReviveAvailable && !game.anchorReviveUsed) {
          game.anchorReviveAvailable = false;
          game.anchorReviveUsed = true;
          game.player.hp = Math.max(1, game.player.maxHp * 0.40);
          game.player.invuln = 3;
          game.rings = [...(game.rings ?? []), { x: game.player.x, y: game.player.y, r: 10, max: 220, life: 1.1, color: "#fbbf24" }];
          for (let i = 0; i < 32; i++) {
            const angle = Math.random() * Math.PI * 2, speed = 45 + Math.random() * 180;
            game.particles.push({ x: game.player.x, y: game.player.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.45 + Math.random() * 0.55, color: i % 2 ? "#fbbf24" : "#f5d0fe" });
          }
          game.pickupLabels.push({ x: game.player.x, y: game.player.y - 35, text: "ÂNCORA DA ALMA · RESSURREIÇÃO", life: 2.2, maxLife: 2.2 });
          toast.success("A Âncora da Alma impediu sua queda!");
        }
        if (game.player.hp <= 0 && !game.ended) { game.ended = true; setStats({ totalDamageDealt: Math.round(game.totalDamageDealt), crystalsCollected: game.crystalsCollected, highestLevel: game.highestLevel }); setResult("defeat"); fractalAudio.defeat(); finishRun(false); }
        if (game.elapsed >= RUN_DURATION_SECONDS && !game.ended && !game.bossSpawned) {
          spawnEnemy(game, missionId, game.elapsed, corruption, true);
          game.bossSpawned = true;
          if (!bossNotified) { bossNotified = true; setBossMessage(true); fractalAudio.bossAlert(); window.setTimeout(() => setBossMessage(false), 5200); }
        }
        if (now - lastHud > 100 && game.player.hp > 0 && !game.ended) {
          lastHud = now;
          const halfViewWidth = game.width / (2 * zoomRef.current);
          const halfViewHeight = game.height / (2 * zoomRef.current);
          const visibleEnemies = game.enemies.reduce((count, enemy) =>
            count + Number(enemy.x >= game.player.x - halfViewWidth && enemy.x <= game.player.x + halfViewWidth && enemy.y >= game.player.y - halfViewHeight && enemy.y <= game.player.y + halfViewHeight), 0);
          setHud({ hp: game.player.hp, maxHp: game.player.maxHp, xp: game.player.xp, nextXp: game.player.nextXp, level: game.player.level, kills: game.kills, elapsed: game.elapsed, moveSpeed: Math.round(game.player.speed), fps: measuredFps, visibleEnemies, phase: snapshot.phaseLabel, pressure: snapshot.totalPressure + (game.challengeEvent ? 2 : 0), event: game.challengeEvent ? { id: game.challengeEvent.id, remaining: game.challengeEvent.remaining, progress: game.challengeEvent.progress, inside: distance(game.player.x, game.player.y, game.challengeEvent.x, game.challengeEvent.y) <= game.challengeEvent.radius } : null, runes: Object.entries(game.upgradeCounts).map(([id, rune]) => ({ id, name: rune.name, count: rune.count, rarity: rune.rarity })) });
          setStats({ totalDamageDealt: Math.round(game.totalDamageDealt), crystalsCollected: game.crystalsCollected, highestLevel: game.highestLevel });
        }
      }
      if (!paused && levelChoices.length === 0 && !game.ended) {
        fpsFrames += 1;
        if (!fpsWindowStart) fpsWindowStart = now;
        if (now - fpsWindowStart >= 500) {
          measuredFps = Math.round(fpsFrames * 1000 / (now - fpsWindowStart));
          fpsFrames = 0;
          fpsWindowStart = now;
        }
        drawGame(ctx, game, corruption, missionId, spritesRef.current, showPlayerHp, showDamageNumbers, zoomRef.current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [running, paused, levelChoices.length, missionId, corruption, speedMultiplier, finishRun, purchases, showPlayerHp, showDamageNumbers]);

  const pointerStart = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    joystickRef.current = { x: clamp((event.clientX - rect.left - rect.width / 2) / 55, -1, 1), y: clamp((event.clientY - rect.top - rect.height / 2) / 55, -1, 1) };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!joystickRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    joystickRef.current = { x: clamp((event.clientX - rect.left - rect.width / 2) / 55, -1, 1), y: clamp((event.clientY - rect.top - rect.height / 2) / 55, -1, 1) };
  };
  const pointerEnd = () => { joystickRef.current = null; };
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
  const mission = FRACTAL_MISSIONS.find((item) => item.id === missionId)!;
  const exchangeValue = Number(exchangeAmount);
  const exchangeValid = Number.isInteger(exchangeValue) && exchangeValue >= 10 && exchangeValue % 10 === 0 && exchangeValue <= fractalBalance;
  const toggleFullscreen = async () => {
    const target = canvasRef.current?.closest("[data-fractal-arena]") as HTMLElement | null;
    try { if (!document.fullscreenElement) await target?.requestFullscreen(); else await document.exitFullscreen(); } catch { /* Fullscreen may be unavailable in embedded browsers. */ }
  };

  return (
    <div className="fractals-hub" data-fractal-arena>
      {missionPickerOpen && !running && !result && (
        <div className="fractals-mission-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMissionPickerOpen(false); }}>
          <section className="fractals-mission-picker" role="dialog" aria-modal="true" aria-labelledby="fractals-mission-picker-title">
            <header className="fractals-mission-picker__header">
              <div><p>MAPAS DA FENDA · 01 / 05 DISPONÍVEL</p><h3 id="fractals-mission-picker-title">Escolha sua expedição</h3><span>Cada região guarda uma história e uma ameaça próprias.</span></div>
              <button type="button" aria-label="Fechar seleção de missão" onClick={() => setMissionPickerOpen(false)}>×</button>
            </header>
            <div className="fractals-mission-picker__grid">
              {FRACTAL_MISSIONS.map((item) => {
                const available = item.id === 1;
                const MissionIcon = item.id === 1 ? MapPin : item.id === 2 ? Flame : item.id === 3 ? Leaf : item.id === 4 ? Snowflake : Orbit;
                return (
                  <button key={item.id} type="button" disabled={!available} onClick={() => { setMissionId(item.id); setMissionPickerOpen(false); }} className={`fractals-mission-card ${available ? "is-available" : "is-locked"} ${missionId === item.id ? "is-current" : ""}`}>
                    <div className="fractals-mission-card__top">
                      <span className="fractals-mission-card__icon"><MissionIcon/></span>
                      {available ? <span className="fractals-mission-card__status">DISPONÍVEL</span> : <span className="fractals-mission-card__chains"><Link2/><Lock/><Link2/></span>}
                    </div>
                    <strong>{item.name}</strong>
                    <small>{item.pathName}</small>
                    <p>{item.lore}</p>
                    <span className="fractals-mission-card__footer">{available ? "ENTRAR NESTA REGIÃO →" : "EM BREVE · REGIÃO SELADA"}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
      {!running && !result && (
        <Card className="fractals-gold-frame fractals-gold-corners relative overflow-hidden rounded-2xl p-3 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] sm:p-5">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-500/[0.08] blur-3xl" />
          <div className="relative space-y-4">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-200">
                  <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_10px_#f59e0b]" />
                  Sobrevivência roguelike
                </div>
                <h2 className="font-display text-2xl font-black tracking-wide text-white sm:text-3xl">ECOS <span className="text-amber-300">DOS</span> FRACTAIS</h2>
                <p className="mt-1 text-xs text-white/65 sm:text-sm">Atravesse a fenda, reúna fragmentos e sobreviva ao despertar do guardião.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-amber-300/25 bg-amber-400/10 px-3 py-2">
                  <GemIcon className="h-5 w-5 text-amber-300" />
                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-100/75">Seu saldo</p>
                    <p className="font-mono text-lg font-black leading-tight text-amber-200">{fractalBalance.toLocaleString("pt-BR")} <span className="text-xs">FR</span></p>
                  </div>
                </div>
                <button type="button" onClick={toggleAudio} className="rounded border border-purple-500/30 bg-purple-950/40 p-1.5 text-purple-300 transition-colors hover:text-amber-300" title={isMuted ? "Ativar som" : "Desativar som"} aria-label={isMuted ? "Ativar efeitos sonoros" : "Desativar efeitos sonoros"}>
                  {isMuted ? <VolumeX className="h-4 w-4 text-zinc-500" /> : <Volume2 className="h-4 w-4 text-amber-400" />}
                </button>
              </div>
            </header>

            <section className="fractals-gold-frame fractals-gold-corners rounded-xl p-3 text-center sm:p-4">
              <p className="mb-2 text-xs text-white/75 sm:text-sm">Sobreviva por 12 minutos. O guardião desperta ao final da incursão.</p>
              <Button onClick={start} disabled={preparingArena} aria-busy={preparingArena} className="mx-auto h-12 w-full max-w-xl rounded-xl bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 font-display text-base font-black tracking-wider text-[#21170b] shadow-[0_0_28px_rgba(245,158,11,0.3)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-80">
                <Play className="mr-2 h-5 w-5 fill-current" /> {preparingArena ? "PREPARANDO CENÁRIO..." : "ENTRAR NA FENDA"}
              </Button>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">

              <section className="fractals-gold-frame fractals-gold-corners flex min-w-0 flex-col rounded-xl p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded border border-rose-400/40 bg-rose-950/60 text-rose-300"><Skull className="h-3.5 w-3.5" /></span>
                    <span className="text-[11px] font-black uppercase tracking-wider text-rose-200">Risco da Fenda</span>
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${corruption === 0 ? "border-emerald-400/40 bg-emerald-950/40 text-emerald-200" : corruption >= 4 ? "border-rose-400/50 bg-rose-950/60 text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.3)]" : "border-amber-400/40 bg-amber-950/40 text-amber-200"}`}>
                    {corruption === 0 ? "Paz Relativa" : "Nível " + corruption + " · " + CORRUPTION_LEVELS[corruption].name}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-white/70">{CORRUPTION_LEVELS[corruption].description}</p>
                <div className="fractals-corruption-bar" role="radiogroup" aria-label="Níveis de corrupção da fenda">
                  {CORRUPTION_LEVELS.map((level) => {
                    const locked = level.level > unlockedCorruption;
                    const active = corruption === level.level;
                    const isDanger = level.level >= 4;
                    return (
                      <button key={level.level} type="button" role="radio" aria-checked={active} disabled={locked}
                        onClick={() => setCorruption(level.level)}
                        title={locked ? "Nível " + level.level + " bloqueado (vença a dificuldade anterior)" : "Selecionar " + level.level + ": " + level.name}
                        className={`fractals-corruption-node ${active ? "is-active" : ""} ${isDanger ? "is-danger" : ""} ${locked ? "is-locked" : ""}`}>
                        <span className="fractals-corruption-pip" />
                        <span className="text-[10px] font-black">{locked ? <Lock className="inline h-2.5 w-2.5" /> : level.level}</span>
                        <span className="text-[8px] font-semibold uppercase tracking-wider opacity-80">{level.level === 0 ? "Base" : "N" + level.level}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-emerald-400/20 bg-emerald-950/25 p-2.5">
                    <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-300"><Sparkles className="h-3 w-3" /> Recompensas</p>
                    <p className="mt-1 text-[11px] font-medium leading-snug text-emerald-100/90">
                      {corruption === 0 ? <>Vitória: <b className="text-emerald-300">25 FR</b> base<br /><span className="text-[10px] text-emerald-200/70">Derrota: +2 FR por minuto</span></> : <>Vitória: <b className="text-emerald-300">{25 + corruption * 15} FR</b> (+{corruption * 15} extra)<br /><span className="text-[10px] text-emerald-200/70">Derrota: +{2 + corruption} FR por minuto</span></>}
                    </p>
                  </div>
                  <div className="rounded-lg border border-rose-400/20 bg-rose-950/25 p-2.5">
                    <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-rose-300"><AlertTriangle className="h-3 w-3" /> Ameaça do Vazio</p>
                    <p className="mt-1 text-[11px] font-medium leading-snug text-rose-100/90">
                      {corruption === 0 ? <>Sem reforços do Vazio.<br /><span className="text-[10px] text-rose-200/70">Inimigos em densidade padrão.</span></> :
                       corruption === 1 ? <>Presença inquieta.<br /><span className="text-[10px] text-rose-200/70">Inimigos +10% mais densos.</span></> :
                       corruption === 2 ? <>Surgimento de Elites acelerado.<br /><span className="text-[10px] text-rose-200/70">Pressão constante na arena.</span></> :
                       corruption === 3 ? <>O Vazio avança com fúria.<br /><span className="text-[10px] text-rose-200/70">Invasões massivas e rápidas.</span></> :
                       corruption === 4 ? <>Ruptura abissal.<br /><span className="text-[10px] text-rose-200/70">Elites ferozes dominam a arena.</span></> :
                       <>Pesadelo Irreversível.<br /><span className="text-[10px] text-rose-200/70">Agressividade e hordas máximas.</span></>}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-white/40">
                  {unlockedCorruption < 5 ? "Nível " + (unlockedCorruption + 1) + " será desbloqueado ao derrotar o Guardião no Nível " + unlockedCorruption + "." : "✦ Todos os selos de corrupção foram rompidos."}
                </p>
              </section>
            </div>

            <section className="fractals-gold-frame fractals-gold-corners fractals-forge-panel rounded-xl p-3.5 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="fractals-shop-item__slot !h-11 !w-11">
                    <ShoppingBag className="h-5 w-5 text-amber-200" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-bold uppercase tracking-wider text-amber-100 sm:text-lg">Arsenal de Fractais</h3>
                    <p className="text-xs text-violet-200/70">Melhorias permanentes e relíquias rúnicas de expedição.</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShopOpen((value) => !value)} className="h-9 border-amber-300/40 bg-amber-400/10 px-4 text-xs font-black uppercase tracking-wider text-amber-100 shadow-[0_0_12px_rgba(245,158,11,0.15)] hover:bg-amber-400/20">
                  {shopOpen ? "Fechar Arsenal" : "Abrir Arsenal"}
                  <ChevronDown className={shopOpen ? "ml-2 h-4 w-4 rotate-180 transition-transform duration-300" : "ml-2 h-4 w-4 transition-transform duration-300"} />
                </Button>
              </div>

              {shopError && <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/15 p-2.5 text-xs text-rose-200">{shopError}</p>}

              {shopOpen && (
                <div className="mt-4 space-y-4 border-t border-amber-300/20 pt-4">
                  <div className="flex flex-col justify-between gap-3 rounded-lg border border-amber-300/25 bg-black/40 p-3 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-200"><Coins className="h-4 w-4 text-amber-300" /> Troca de Moedas</div>
                      <p className="mt-1 text-xs text-white/65">Converta 10 fractais em 1 moeda de ouro. Saldo: <strong className="text-amber-300">{coinBalance.toLocaleString("pt-BR")} moedas</strong></p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="number" min={10} max={fractalBalance} step={10} inputMode="numeric" value={exchangeAmount} onChange={(event) => setExchangeAmount(event.target.value)} aria-label="Quantidade de fractais para converter" className="h-9 w-20 rounded border border-amber-300/30 bg-black/60 px-2 text-center text-xs font-bold text-amber-100 focus:outline-none focus:ring-1 focus:ring-amber-300" placeholder="FR" />
                      <span className="text-xs font-semibold text-amber-200/80">= {Math.floor(Math.max(0, exchangeValue) / 10).toLocaleString("pt-BR")} moedas</span>
                      <Button size="sm" disabled={shopBusy || !exchangeValid} onClick={() => void exchangeFractals()} className="h-9 border border-amber-300 bg-gradient-to-b from-amber-300 to-amber-500 px-3 text-xs font-black text-black hover:brightness-110">CONVERTER</Button>
                    </div>
                  </div>

                  <div className="fractals-shop-tabs grid grid-cols-2 gap-2" role="tablist" aria-label="Categorias do Arsenal">
                    <button type="button" role="tab" aria-selected={shopSection === "permanent"} onClick={() => setShopSection("permanent")} className={shopSection === "permanent" ? "is-active" : ""}><Crown className="h-4 w-4 text-amber-300" /> Forja Permanente</button>
                    <button type="button" role="tab" aria-selected={shopSection === "relics"} onClick={() => setShopSection("relics")} className={shopSection === "relics" ? "is-active" : ""}><Sparkles className="h-4 w-4 text-amber-300" /> Relíquias de Campo</button>
                  </div>

                  {shopSection === "permanent" && (
                    <div className="fractals-shop-grid">
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Heart className="h-5 w-5 text-rose-300" /></div>
                        <div className="min-w-0">
                          <p className="fractals-shop-item__name">Vida Reforçada</p>
                          <p className="fractals-shop-item__description">+10 de vida máxima permanente por nível.</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.health + " de 5"}>{Array.from({ length: 5 }).map((_, i) => <i key={i} className={i < purchases.health ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.health}/5</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.health >= 5 || (!isMaster && fractalBalance < FRACTAL_SHOP.health[purchases.health]?.cost)} onClick={() => void purchaseUpgrade("health")}>{purchases.health >= 5 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.health[purchases.health]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Timer className="h-5 w-5 text-sky-300" /></div>
                        <div className="min-w-0">
                          <p className="fractals-shop-item__name">Duração de Projéteis</p>
                          <p className="fractals-shop-item__description">Disparos permanecem ativos por mais tempo.</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.projectile_duration + " de 3"}>{Array.from({ length: 3 }).map((_, i) => <i key={i} className={i < purchases.projectile_duration ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.projectile_duration}/3</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.projectile_duration >= 3 || (!isMaster && fractalBalance < FRACTAL_SHOP.projectile_duration[purchases.projectile_duration]?.cost)} onClick={() => void purchaseUpgrade("projectile_duration")}>{purchases.projectile_duration >= 3 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.projectile_duration[purchases.projectile_duration]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><GemIcon className="h-5 w-5 text-fuchsia-300" /></div>
                        <div className="min-w-0">
                          <p className="fractals-shop-item__name">Ressonância Rara</p>
                          <p className="fractals-shop-item__description">Aumenta as chances de dádivas Raras e Épicas.</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.rarity + " de 3"}>{Array.from({ length: 3 }).map((_, i) => <i key={i} className={i < purchases.rarity ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.rarity}/3</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.rarity >= 3 || (!isMaster && fractalBalance < FRACTAL_SHOP.rarity[purchases.rarity]?.cost)} onClick={() => void purchaseUpgrade("rarity")}>{purchases.rarity >= 3 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.rarity[purchases.rarity]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Gauge className="h-5 w-5 text-emerald-300" /></div>
                        <div className="min-w-0">
                          <p className="fractals-shop-item__name">Aceleração 2x</p>
                          <p className="fractals-shop-item__description">Habilita velocidade 2x nas expedições.</p>
                          <span className="fractals-shop-item__status">{purchases.speed_2x ? "Desbloqueado" : "Nível 0/1 · 1.000 FR"}</span>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.speed_2x || (!isMaster && fractalBalance < FRACTAL_SHOP.speed.double.cost)} onClick={() => void purchaseUpgrade("speed_2x")}>{purchases.speed_2x ? "ADQUIRIDO" : isMaster ? "GRÁTIS" : "1.000 FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Flame className="h-5 w-5 text-amber-300" /></div>
                        <div className="min-w-0">
                          <p className="fractals-shop-item__name">Aceleração 3x</p>
                          <p className="fractals-shop-item__description">Habilita velocidade 3x. Requer 2x.</p>
                          <span className="fractals-shop-item__status">{purchases.speed_3x ? "Desbloqueado" : purchases.speed_2x ? "Nível 0/1 · 2.000 FR" : "Bloqueado · requer 2x"}</span>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.speed_3x || (!isMaster && (!purchases.speed_2x || fractalBalance < FRACTAL_SHOP.speed.triple.cost))} onClick={() => void purchaseUpgrade("speed_3x")}>{purchases.speed_3x ? "ADQUIRIDO" : isMaster ? "GRÁTIS" : "2.000 FR"}</button>
                      </article>
                    </div>
                  )}

                  {shopSection === "relics" && (
                    <div className="fractals-shop-grid">
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Orbit className="h-5 w-5 text-violet-300" /></div>
                        <div className="min-w-0">
                          <p className="fractals-shop-item__name">Vórtice Coletor</p>
                          <p className="fractals-shop-item__description">Amplia o raio de atração de fragmentos.</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.area + " de 3"}>{Array.from({ length: 3 }).map((_, i) => <i key={i} className={i < purchases.area ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.area}/3</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.area >= 3 || (!isMaster && fractalBalance < FRACTAL_SHOP.area[purchases.area]?.cost)} onClick={() => void purchaseUpgrade("area")}>{purchases.area >= 3 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.area[purchases.area]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Sparkles className="h-5 w-5 text-amber-300" /></div>
                        <div className="min-w-0">
                          <p className="fractals-shop-item__name">Afinidade de XP</p>
                          <p className="fractals-shop-item__description">+5% de XP por fragmento coletado.</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.experience + " de 3"}>{Array.from({ length: 3 }).map((_, i) => <i key={i} className={i < purchases.experience ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.experience}/3</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.experience >= 3 || (!isMaster && fractalBalance < FRACTAL_SHOP.experience[purchases.experience]?.cost)} onClick={() => void purchaseUpgrade("experience")}>{purchases.experience >= 3 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.experience[purchases.experience]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Target className="h-5 w-5 text-teal-300" /></div>
                        <div className="min-w-0">
                          <p className="fractals-shop-item__name">Alcance Arcano</p>
                          <p className="fractals-shop-item__description">Disparos alcançam inimigos mais distantes.</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.projectile_range + " de 3"}>{Array.from({ length: 3 }).map((_, i) => <i key={i} className={i < purchases.projectile_range ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.projectile_range}/3</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.projectile_range >= 3 || (!isMaster && fractalBalance < FRACTAL_SHOP.projectile_range[purchases.projectile_range]?.cost)} onClick={() => void purchaseUpgrade("projectile_range")}>{purchases.projectile_range >= 3 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.projectile_range[purchases.projectile_range]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Swords className="h-5 w-5 text-indigo-300" /></div>
                        <div className="min-w-0">
                          <p className="fractals-shop-item__name">Coroa de Estilhaços</p>
                          <p className="fractals-shop-item__description">Libera até +2 projéteis extras simultâneos.</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.projectiles + " de 3"}>{Array.from({ length: 3 }).map((_, i) => <i key={i} className={i < purchases.projectiles ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.projectiles}/3</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.projectiles >= 3 || (!isMaster && fractalBalance < FRACTAL_SHOP.projectiles[purchases.projectiles]?.cost)} onClick={() => void purchaseUpgrade("projectiles")}>{purchases.projectiles >= 3 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.projectiles[purchases.projectiles]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><RotateCw className="h-5 w-5 text-cyan-300" /></div>
                        <div className="min-w-0">
                          <p className="fractals-shop-item__name">Ricochete Arcano</p>
                          <p className="fractals-shop-item__description">I: +1 alvo · II: +2 · III: +3 alvos por ricochete.</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.ricochet + " de 3"}>{Array.from({ length: 3 }).map((_, i) => <i key={i} className={i < purchases.ricochet ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.ricochet}/3</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.ricochet >= 3 || (!isMaster && fractalBalance < FRACTAL_SHOP.ricochet[purchases.ricochet]?.cost)} onClick={() => void purchaseUpgrade("ricochet")}>{purchases.ricochet >= 3 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.ricochet[purchases.ricochet]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Target className="h-5 w-5 text-violet-300" /></div>
                        <div className="min-w-0">
                          <p className="fractals-shop-item__name">Perfuração Espectral</p>
                          <p className="fractals-shop-item__description">I: atravessa +1 alvo · II: +2 · III: +3, mantendo o dano.</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.piercing + " de 3"}>{Array.from({ length: 3 }).map((_, i) => <i key={i} className={i < purchases.piercing ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.piercing}/3</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.piercing >= 3 || (!isMaster && fractalBalance < FRACTAL_SHOP.piercing[purchases.piercing]?.cost)} onClick={() => void purchaseUpgrade("piercing")}>{purchases.piercing >= 3 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.piercing[purchases.piercing]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Zap className="h-5 w-5 text-sky-300" /></div>
                        <div className="min-w-0">
                          <p className="fractals-shop-item__name">Descarga em Cadeia</p>
                          <p className="fractals-shop-item__description">I: 1 alvo/55% · II: 2/65% · III: 3/75% de dano.</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.chain_lightning + " de 3"}>{Array.from({ length: 3 }).map((_, i) => <i key={i} className={i < purchases.chain_lightning ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.chain_lightning}/3</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.chain_lightning >= 3 || (!isMaster && fractalBalance < FRACTAL_SHOP.chain_lightning[purchases.chain_lightning]?.cost)} onClick={() => void purchaseUpgrade("chain_lightning")}>{purchases.chain_lightning >= 3 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.chain_lightning[purchases.chain_lightning]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </Card>
      )}

      {(running || result) && (
        <Card className="fractals-game-shell overflow-hidden border-border/70 bg-[#11111a] text-white">
          <div className="fractals-arena-frame relative">
            <canvas ref={canvasRef} className="block h-[min(78vh,720px)] min-h-[430px] w-full touch-none" onPointerDown={pointerStart} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} aria-label="Arena de sobrevivência. Use WASD, setas ou arraste o dedo para mover." />
            <section className="fractals-hud-bar absolute inset-x-0 top-0" aria-label="Status da expedição">
              <div className="fractals-hud-zone fractals-hud-zone--left">
                <div className="fractals-hud-meter">
                  <span className="fractals-hud-label"><Heart/> VIDA</span>
                  <b>{Math.ceil(hud.hp)}<i>/{Math.ceil(hud.maxHp)}</i></b>
                  <span className="fractals-hud-track"><i className="is-life" style={{width:`${clamp(hud.hp / Math.max(1, hud.maxHp), 0, 1) * 100}%`}}/></span>
                </div>
                <div className="fractals-hud-meter">
                  <span className="fractals-hud-label"><Sparkles/> NV.{hud.level} · XP</span>
                  <b>{Math.floor(hud.xp)}<i>/{Math.floor(hud.nextXp)}</i></b>
                  <span className="fractals-hud-track"><i className="is-xp" style={{width:`${clamp(Math.floor(hud.xp) / Math.max(1, Math.floor(hud.nextXp)), 0, 1) * 100}%`}}/></span>
                </div>
                <div className="fractals-hud-kills"><Skull/><b>{hud.kills}</b><small>ABATES</small></div>
              </div>
              <div className="fractals-hud-zone fractals-hud-zone--center">
                <div className="fractals-hud-clock"><Timer/><b>{formatTime(hud.elapsed)}</b><small>/ 12:00</small></div>
                <div className="fractals-hud-density"><span className="fractals-live-dot"/><b>{hud.pressure.toFixed(1)}</b><small>DENSIDADE</small></div>
                <div className="fractals-hud-performance"><b>{hud.fps}</b><small>FPS</small><i>{hud.visibleEnemies}/50</i></div>
                {hud.event && <div className="fractals-hud-event"><Target/> {hud.event.id === 1 ? "RITUAL RÚNICO" : "CAÇADA DO ALGOZ"} · {Math.ceil(hud.event.remaining)}s {hud.event.id === 1 ? "· " + Math.floor(hud.event.progress) + "/25s" : ""}</div>}
              </div>
              <div className="fractals-hud-zone fractals-hud-zone--right">
                <div className="fractals-hud-mission"><b>{mission.name}</b><small>{mission.pathName} · {CORRUPTION_LEVELS[corruption].name}</small></div>
                <div className="fractals-hud-control-group" aria-label="Velocidade da expedição">
                  <small>RITMO</small>
                  <button type="button" aria-label="Diminuir velocidade" disabled={speedMultiplier === 1} onClick={() => setSpeedMultiplier((value) => value === 3 ? 2 : 1)}>−</button>
                  <b>{speedMultiplier}×</b>
                  <button type="button" aria-label="Aumentar velocidade" disabled={speedMultiplier === 3 || (!isMaster && (speedMultiplier === 1 ? !purchases.speed_2x : !purchases.speed_3x))} onClick={() => setSpeedMultiplier((value) => value === 1 ? 2 : 3)}>+</button>
                </div>
                <div className="fractals-hud-control-group" aria-label="Zoom da fase">
                  <button type="button" aria-label="Diminuir zoom" disabled={zoom <= 0.75} onClick={() => { const next = clamp(zoomRef.current - 0.1, 0.75, 1.35); zoomRef.current = next; setZoom(next); }}><ZoomOut/></button>
                  <b>{Math.round(zoom * 100)}%</b>
                  <button type="button" aria-label="Aumentar zoom" disabled={zoom >= 1.35} onClick={() => { const next = clamp(zoomRef.current + 0.1, 0.75, 1.35); zoomRef.current = next; setZoom(next); }}><ZoomIn/></button>
                </div>
                {!result && <Button size="sm" variant="outline" className="fractals-hud-pause" onClick={() => setPaused((value) => !value)}><Pause/></Button>}
              </div>
            </section>

            <div className="fractals-arena-hint pointer-events-none absolute bottom-3 left-3"><b>NECRÓPOLE DOS ESQUECIDOS</b> · WASD / setas / toque para mover</div>
            {bossMessage && !result && <div className="fractals-boss-alert pointer-events-none absolute inset-x-0 top-1/2 z-30 -translate-y-1/2 px-3 text-center"><span>⚠ ALERTA DE FENDA: O GUARDIÃO DESPERTOU ⚠</span></div>}
            {paused && !result && levelChoices.length === 0 && <div className="fractals-pause-overlay absolute inset-0 grid place-items-center overflow-y-auto p-3 sm:p-5">
 <div className="fractals-pause-panel relative w-full max-w-md overflow-hidden p-4 sm:p-5">
  <div className="fractals-pause-header mb-4 flex items-center justify-between pb-3"><div><p className="text-[9px] font-bold uppercase tracking-[.24em] text-violet-200/70">Ecos dos Fractais · Refúgio</p><h3 className="mt-1 font-display text-2xl text-white">Expedição pausada</h3></div><div className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-200/20 bg-amber-200/10 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.12)]"><Pause className="h-5 w-5"/></div></div>
  {pausePanel === "main" ? <>
   <div className="fractals-pause-actions grid grid-cols-2 gap-2"><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={() => setPausePanel("attributes")}><UserRound className="h-4 w-4"/> Atributos</Button><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={toggleFullscreen}><Maximize className="h-4 w-4"/> Tela cheia</Button><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={() => setShowPlayerHp((v) => !v)}><Heart className="h-4 w-4 text-rose-300"/> HP: {showPlayerHp ? "visível" : "oculto"}</Button><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={() => setShowDamageNumbers((v) => !v)}><Swords className="h-4 w-4 text-amber-200"/> Dano: {showDamageNumbers ? "visível" : "oculto"}</Button></div>
   <Button variant="destructive" className="mt-3 h-10 w-full border border-rose-300/25 bg-rose-950/55 font-bold text-rose-100 hover:bg-rose-900/70" onClick={() => { const game = gameRef.current; if (!game || game.ended) return; game.ended = true; setStats({ totalDamageDealt: Math.round(game.totalDamageDealt), crystalsCollected: game.crystalsCollected, highestLevel: game.highestLevel }); setResult("defeat"); setPaused(false); setPausePanel("main"); fractalAudio.defeat(); finishRun(false); }}><Skull className="mr-2 h-4 w-4"/> Desistir da partida</Button>
    <div className="fractals-pause-speed mt-3 rounded-2xl p-3"><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/75"><Gauge className="h-4 w-4"/> Velocidade da expedição</div><div className="grid grid-cols-3 gap-2">{([1,2,3] as const).map((speed) => <Button key={speed} size="sm" variant={speedMultiplier===speed?"default":"outline"} disabled={!isMaster && (speed===2 ? !purchases.speed_2x : speed===3 ? !purchases.speed_3x : false)} className={!isMaster && speed>1?"border-white/10 opacity-45":""} onClick={()=>setSpeedMultiplier(speed)}>{speed}x{!isMaster && (speed===2 ? !purchases.speed_2x : speed===3 ? !purchases.speed_3x : false)?" 🔒":""}</Button>)}</div>{!isMaster && <p className="mt-2 text-[10px] text-white/45">Desbloqueie 2x e 3x na loja de fractais.</p>}{isMaster && <><p className="mt-2 text-[10px] text-emerald-200/70">Acesso de mestre: todas as velocidades liberadas para testes.</p><Button variant="outline" size="sm" className="mt-2 h-8 w-full border-emerald-200/25 bg-emerald-400/[0.07] text-[10px] text-emerald-100 hover:bg-emerald-400/15" onClick={() => { const game = gameRef.current; if (!game) return; game.enemies = Array.from({length:50},(_,index) => { const angle = index / 50 * Math.PI * 2; const ring = 46 + (index % 3) * 29; const x = game.player.x + Math.cos(angle) * ring; const y = game.player.y + Math.sin(angle) * ring; return { x, y, hp: 100000, maxHp: 100000, speed: 22, radius: 10, damage: 0, color: "#9b91b4", xp: 0, type: "wraith" as const, attack: 0, flash: 0, windup: 0, targetX: x, targetY: y, dashTime: 0, summonedAtHalf: false, furyTriggered: false }; }); game.spawnTimer = Number.MAX_SAFE_INTEGER; game.bossSpawned = true; setPaused(false); toast.info("Teste de carga ativo: 50 monstros na arena. Confira o FPS e o contador 50/50 no topo."); }}>TESTE DE CARGA · 50 MONSTROS</Button></>}</div>
   <Button className="fractals-pause-resume mt-3 h-11 w-full font-bold" onClick={() => {setPausePanel("main");setPaused(false)}}><Play className="mr-2 h-4 w-4"/> Retomar expedição</Button>
  </> : <>
   <div className="mb-3 grid grid-cols-2 gap-2">{[["Vida",`${Math.ceil(gameRef.current?.player.hp ?? hud.hp)} / ${Math.ceil(gameRef.current?.player.maxHp ?? hud.maxHp)}`],["Dano",`${(gameRef.current?.player.damage ?? 0).toFixed(1)}`],["Velocidade",`${(gameRef.current?.player.speed ?? 0).toFixed(0)}`],["Intervalo de ataque",`${(gameRef.current?.player.fireRate ?? 0).toFixed(2)}s`],["Nível",`${gameRef.current?.player.level ?? hud.level}`],["Projéteis",`${1 + (gameRef.current?.player.projectileStacks ?? 0)}`],["Alcance",`+${Math.round((gameRef.current?.player.projectileRangeMultiplier ?? 1) * 100 - 100)}%`],["Experiência",`${Math.floor(gameRef.current?.player.xp ?? hud.xp)} / ${Math.floor(gameRef.current?.player.nextXp ?? hud.nextXp)}`],["Abates",`${gameRef.current?.kills ?? hud.kills}`],["Multiplicador",`${speedMultiplier}x`]].map(([label,value])=><div key={label} className="rounded-lg border border-white/10 bg-white/5 p-2"><p className="text-[10px] text-white/45">{label}</p><p className="text-sm font-semibold tabular-nums text-white">{value}</p></div>)}</div>
   <section className="mt-3 rounded-xl border border-violet-300/20 bg-violet-950/20 p-3">
    <div className="mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-200"/><h4 className="text-xs font-black uppercase tracking-wider text-violet-100">Dádivas &amp; Runas Ativas</h4></div>
    {Object.entries(gameRef.current?.upgradeCounts ?? {}).length > 0 ? <div className="grid grid-cols-1 gap-1.5">
      {Object.entries(gameRef.current?.upgradeCounts ?? {}).map(([id,rune])=><div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-violet-400/10 text-sm">{id==="power"?"⚔":id==="haste"?"⚡":id==="vitality"?"✚":id==="swift"?"➤":id==="special_area"?"🧲":id==="special_experience"?"🔮":id==="special_projectile_range"?"🏹":"✦"}</span><div className="min-w-0"><p className="truncate text-[11px] font-bold text-white">{rune.name}</p><p className="text-[9px] uppercase tracking-wider text-violet-200/65">{rune.rarity==="epic"?"Épica":rune.rarity==="rare"?"Rara":"Comum"}</p></div></div>
        <strong className="shrink-0 text-xs tabular-nums text-amber-200">x{rune.count}</strong>
      </div>)}
    </div> : <p className="text-[10px] text-white/45">Nenhuma dádiva acumulada nesta expedição.</p>}
   </section>
   <Button variant="outline" className="w-full border-white/15 text-white hover:bg-white/10" onClick={()=>setPausePanel("main")}><ArrowLeft className="mr-2 h-4 w-4"/> Voltar ao menu</Button>
  </>}
 </div>
</div>}
            {levelChoices.length > 0 && (
              <div className="fractals-upgrade-overlay absolute inset-0 z-50 grid place-items-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(91,46,133,0.38),rgba(5,4,10,0.96)_75%)] p-2 backdrop-blur-md sm:p-4">
                <div className="fractals-upgrade-panel w-full max-w-xl space-y-3 rounded-2xl border border-violet-200/20 bg-[#14101d]/95 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.75)] sm:p-4">
                  <div className="text-center">
                    <p className="text-[8px] font-black uppercase tracking-[.22em] text-violet-200/70 sm:text-[9px]">
                      {eventRewardStep > 0 ? `DESAFIO DA FENDA · DÁDIVA ${eventRewardStep}/2` : "O FRACTAL DESPERTA"}
                    </p>
                    <h3 className="mt-0.5 font-display text-lg text-white sm:text-2xl">
                      {eventRewardStep > 0 ? "Escolha sua recompensa" : "Selecione uma Dádiva"}
                    </h3>
                    <p className="text-[9px] text-white/45">Toque para selecionar · Use o ícone de giro para ler os detalhes</p>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
                    {levelChoices.map((upgrade) => {
                      const Icon = upgrade.icon;
                      const rarity = upgrade.rarity ?? "normal";
                      const isSelected = selectedUpgrade?.id === upgrade.id;
                      const isFlipped = flippedCardId === upgrade.id;

                      const rarityBorder = rarity === "epic"
                        ? "border-fuchsia-400/50 bg-gradient-to-b from-fuchsia-500/15 to-[#1c1226]"
                        : rarity === "rare"
                        ? "border-sky-300/40 bg-gradient-to-b from-sky-500/10 to-[#101724]"
                        : "border-amber-200/20 bg-gradient-to-b from-white/[0.05] to-[#181420]";

                      const rarityTag = rarity === "epic"
                        ? "text-fuchsia-200 border-fuchsia-300/30 bg-fuchsia-400/10"
                        : rarity === "rare"
                        ? "text-sky-200 border-sky-300/30 bg-sky-400/10"
                        : "text-amber-100/70 border-white/10 bg-white/5";

                      const iconStyle = rarity === "epic"
                        ? "border-fuchsia-300/40 bg-fuchsia-400/20 text-fuchsia-100"
                        : rarity === "rare"
                        ? "border-sky-300/40 bg-sky-400/20 text-sky-100"
                        : "border-amber-200/20 bg-amber-200/10 text-amber-100";

                      return (
                        <div
                          key={upgrade.id}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          onClick={() => setSelectedUpgrade(upgrade)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedUpgrade(upgrade);
                            }
                          }}
                          className={`group relative flex min-h-[140px] cursor-pointer select-none flex-col justify-between rounded-xl border p-2 text-left transition-all duration-200 sm:min-h-[160px] ${rarityBorder} ${
                            isSelected
                              ? "ring-2 ring-amber-300 scale-[1.02] shadow-[0_0_20px_rgba(252,211,77,0.35)] -translate-y-1 brightness-110"
                              : "hover:border-white/30 hover:-translate-y-0.5"
                          }`}
                        >
                          <button
                            type="button"
                            title={isFlipped ? "Ver frente" : "Ver descrição do efeito"}
                            aria-label={isFlipped ? "Ver frente da carta" : "Ver verso da carta"}
                            onClick={(e) => {
                              e.stopPropagation();
                              fractalAudio.cardFlip();
                               setFlippedCardId(isFlipped ? null : upgrade.id);
                            }}
                            className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white/70 backdrop-blur-sm transition hover:bg-white/20 hover:text-white"
                          >
                            <RotateCw className={`h-3 w-3 transition-transform duration-300 ${isFlipped ? "rotate-180 text-amber-300" : ""}`} />
                          </button>

                          {isSelected && (
                            <div className="absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-black shadow-md">
                              <Check className="h-3 w-3 stroke-[3]" />
                            </div>
                          )}

                          {!isFlipped ? (
                            <div className="my-auto flex flex-col items-center justify-center pt-2 text-center">
                              <div className={`mb-2 grid h-10 w-10 place-items-center rounded-xl border shadow-inner ${iconStyle}`}>
                                <Icon className="h-5 w-5" />
                              </div>
                              <p className="line-clamp-2 text-xs font-bold leading-tight text-white sm:text-sm">
                                {upgrade.name}
                              </p>
                              <span className={`mt-2 rounded-full border px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider sm:text-[8px] ${rarityTag}`}>
                                {rarity === "epic" ? "Épica" : rarity === "rare" ? "Rara" : "Normal"}
                              </span>
                            </div>
                          ) : (
                            <div className="my-auto flex flex-col justify-between pt-4 text-center">
                              <p className="text-[10px] leading-relaxed text-white/90 sm:text-xs">
                                {getUpgradeDescription(upgrade)}
                              </p>
                              <span className="mt-2 text-[7px] font-bold uppercase tracking-wider text-amber-200/80 sm:text-[8px]">
                                {rarity === "epic" ? "+50% Potência" : rarity === "rare" ? "+25% Potência" : "100% Padrão"}
                              </span>
                            </div>
                          )}

                          <div className="mt-1 border-t border-white/10 pt-1 text-center">
                            <span className="text-[8px] font-semibold uppercase tracking-wider text-white/40">
                              {isSelected ? "Selecionado" : "Tocar p/ escolher"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2">
                    <Button
                      disabled={!selectedUpgrade}
                      onClick={() => {
                        if (selectedUpgrade) {
                          chooseUpgrade(selectedUpgrade);
                          setSelectedUpgrade(null);
                          setFlippedCardId(null);
                        }
                      }}
                      className={`h-11 w-full rounded-xl font-display text-sm font-bold uppercase tracking-wider transition-all duration-200 ${
                        selectedUpgrade
                          ? "bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-black shadow-[0_0_25px_rgba(245,158,11,0.4)] hover:brightness-110 active:scale-[0.98]"
                          : "cursor-not-allowed border border-white/10 bg-white/5 text-white/30"
                      }`}
                    >
                      {selectedUpgrade ? "Reivindicar Dádiva Selecionada" : "Selecione uma dádiva"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {result && <div className="fractals-result-overlay absolute inset-0 grid place-items-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(91,46,133,0.28),rgba(5,4,10,0.95)_72%)] p-4 backdrop-blur-md"><div className="fractals-result-panel w-full max-w-sm rounded-[1.6rem] border border-violet-200/20 bg-[#171320]/95 p-5 text-center shadow-[0_30px_100px_rgba(0,0,0,0.7)]"><div className="fractals-result-icon mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl border border-amber-200/20 bg-gradient-to-br from-amber-200/15 via-violet-400/15 to-violet-950/70 shadow-[0_0_36px_rgba(167,139,250,0.18)]">{result==="victory"?<Sparkles className="h-7 w-7 text-amber-200"/>:<Skull className="h-7 w-7 text-rose-300"/>}</div><p className="fractals-result-kicker text-xs uppercase tracking-[.22em] text-violet-200">{result==="victory"?"Guardião derrotado":"Expedição encerrada"}</p><h3 className="fractals-result-title mt-1 font-display text-2xl">{result==="victory"?"O fractal silenciou":"O Vazio prevaleceu"}</h3><div className="fractals-result-stats mt-4 grid grid-cols-2 gap-2 text-left">
  <div className="fractals-stat-tile"><Skull/><span>Inimigos abatidos</span><b>{hud.kills.toLocaleString("pt-BR")}</b></div>
  <div className="fractals-stat-tile"><Swords/><span>Dano infligido</span><b>{stats.totalDamageDealt.toLocaleString("pt-BR")}</b></div>
  <div className="fractals-stat-tile"><GemIcon/><span>Fragmentos colhidos</span><b>{stats.crystalsCollected.toLocaleString("pt-BR")}</b></div>
  <div className="fractals-stat-tile"><Timer/><span>Tempo sobrevivido</span><b>{formatTime(hud.elapsed)}</b></div>
 </div><p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-amber-100/60">Nível máximo alcançado: {stats.highestLevel}</p><p className="fractals-result-note mt-3 rounded-lg border border-amber-300/30 bg-amber-400/10 p-3 text-sm font-bold text-amber-100">✦ RECOMPENSA DA FENDA · {earnedFractals !== null ? earnedFractals.toLocaleString("pt-BR") : "—"} FR</p><p className="fractals-result-note mt-2 text-xs text-amber-100/80">{rewardStatus === "pending" ? "Validando as recompensas com o servidor..." : rewardStatus === "error" ? "Não foi possível confirmar as recompensas desta expedição." : earnedFractals !== null && earnedFractals > 0 ? `Você recebeu ${earnedFractals.toLocaleString("pt-BR")} fractais nesta expedição.` : result === "victory" ? "Vitória registrada. O próximo nível foi liberado." : "Nenhum fractal extra foi concedido nesta tentativa."}</p><Button className="fractals-result-button mt-4 gap-2" onClick={()=>{setRunning(false);setResult(null);setBossMessage(false);gameRef.current=null;}}><RotateCcw className="h-4 w-4"/> Voltar à expedição</Button></div></div>}
          </div>
          <div className="fractals-arena-footer flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-[10px] text-white/45 sm:px-4"><span>Arma automática: projétil perseguidor</span><span>Recompensas e progressão validadas no servidor</span></div>
        </Card>
      )}
      <div className="fractals-lore-note flex items-start gap-2 rounded-xl border border-amber-300/15 bg-gradient-to-r from-amber-500/[0.07] to-transparent p-3 text-xs text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"/><p>Último Silêncio apresenta Ecos errantes, Enlutados resistentes, Vigias de elite com aura de drenagem e o Pranteador Sem Rosto, que marca uma área antes de liberar uma onda de lamento e convoca ecos quando perde metade da vida. A loja e a progressão de corrupção já usam o estado persistente da conta; a concessão de recompensas de fim de expedição é validada e creditada pelo servidor.</p></div>
    </div>
  );
}
