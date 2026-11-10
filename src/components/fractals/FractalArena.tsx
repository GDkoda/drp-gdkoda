import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Heart, Move, Pause, Play, RotateCcw, Shield, Skull, Sparkles, Swords, Zap, Maximize, UserRound, Gauge, ArrowLeft, ShoppingBag, Crown, Gem as GemIcon, MapPin, Flame, Leaf, Snowflake, Orbit, Lock, Link2, ChevronDown, Coins, Timer, Target, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDifficultySnapshot } from "@/lib/fractals/difficulty";
import { CORRUPTION_LEVELS, FRACTAL_MISSIONS, RUN_DURATION_SECONDS } from "@/lib/fractals/config";
import { FRACTAL_SHOP, FRACTAL_RARITY_TIERS } from "@/lib/fractals/economy";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import "./fractal-arena.css";

type UpgradeId = "power" | "haste" | "vitality" | "swift" | "special_area" | "special_experience" | "special_projectile_range" | "special_projectiles";
type Upgrade = { id: UpgradeId; name: string; description: string; icon: typeof Zap; rarity?: "normal" | "rare" | "epic" };

type Enemy = { x: number; y: number; hp: number; maxHp: number; speed: number; radius: number; damage: number; color: string; xp: number; type: "wraith" | "brute" | "charger" | "elite" | "boss"; attack: number; flash: number; windup: number; targetX: number; targetY: number; dashTime: number; summonedAtHalf: boolean };
type Shot = { x: number; y: number; vx: number; vy: number; damage: number; life: number };
type Gem = { x: number; y: number; value: number; radius: number };
type SpecialDrop = { x: number; y: number; kind: "area" | "experience" | "projectile_range" | "projectiles"; radius: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type DamageNumber = { x: number; y: number; value: number; life: number; maxLife: number; drift: number };
type PickupLabel = { x: number; y: number; text: string; life: number; maxLife: number };
type ChallengeEvent = { id: 1 | 2; x: number; y: number; radius: number; remaining: number; progress: number };
type SpriteKey = "boss" | "elite" | "wraith" | "charger" | "brute" | "playerIdle" | "playerMove" | "playerCast" | "xpGem" | "specialXP" | "specialArea" | "specialRange" | "specialProjectiles" | "projectile";
type SpriteMap = Partial<Record<SpriteKey, HTMLImageElement>>;
type PlayerVisualAction = "idle" | "move" | "cast";
type PurchaseState = {
  area: number; experience: number; rarity: number; speed_2x: boolean; speed_3x: boolean;
  health: number; projectile_duration: number; projectile_range: number; projectiles: number;
};
const DEFAULT_PURCHASES: PurchaseState = {
  area: 0, experience: 0, rarity: 0, speed_2x: false, speed_3x: false,
  health: 0, projectile_duration: 0, projectile_range: 0, projectiles: 0,
};
const PROJECTILE_DURATION_MULTIPLIERS = [1, 1.25, 1.5, 2] as const;
const PROJECTILE_BASE_LIFE = 0.8;
const MAX_EXTRA_PROJECTILES = 2;
const CHALLENGE_EVENT_TIMES = [240, 480] as const;
const CHALLENGE_EVENT_DURATION = 60;
function parsePurchaseState(raw: any): PurchaseState {
  return {
    area: Number(raw?.area ?? 0), experience: Number(raw?.experience ?? 0), rarity: Number(raw?.rarity ?? 0),
    speed_2x: !!raw?.speed_2x, speed_3x: !!raw?.speed_3x,
    health: Number(raw?.health ?? 0), projectile_duration: Number(raw?.projectile_duration ?? 0),
    projectile_range: Number(raw?.projectile_range ?? 0), projectiles: Number(raw?.projectiles ?? 0),
  };
}

type GameState = {
  width: number; height: number; last: number; elapsed: number; spawnTimer: number; shotTimer: number; bossSpawned: boolean;
  player: { x: number; y: number; hp: number; maxHp: number; speed: number; damage: number; fireRate: number; invuln: number; hitFlash: number; xp: number; nextXp: number; level: number; pickupRadius: number; xpMultiplier: number; specialAreaStacks: number; specialExperienceStacks: number; projectileRangeStacks: number; projectileRangeMultiplier: number; projectileStacks: number; projectileLife: number; facing: number; castFacing: number; castTimer: number; moving: boolean; spriteAction: PlayerVisualAction; spriteDirection: number; previousSpriteAction: PlayerVisualAction; previousSpriteDirection: number; spriteBlend: number };
  enemies: Enemy[]; shots: Shot[]; gems: Gem[]; specialDrops: SpecialDrop[]; particles: Particle[]; damageNumbers: DamageNumber[]; pickupLabels: PickupLabel[]; challengeEvent: ChallengeEvent | null; nextChallengeEvent: number; kills: number; ended: boolean;
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

function buildLevelChoices(game: GameState, areaLevel: number, experienceLevel: number, rangeLevel: number, projectilesLevel: number, rarityTier: number): Upgrade[] {
  const core = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
  const available = SPECIAL_UPGRADES.filter((item) => {
    if (item.id === "special_area") return areaLevel >= 1 && game.player.specialAreaStacks < 5;
    if (item.id === "special_experience") return experienceLevel >= 1 && game.player.specialExperienceStacks < 6;
    if (item.id === "special_projectile_range") return rangeLevel >= 1 && game.player.projectileRangeStacks < 5;
    return projectilesLevel >= 1 && game.player.projectileStacks < MAX_EXTRA_PROJECTILES;
  });
  if (available.length && Math.random() < 0.18) {
    const special = available[Math.floor(Math.random() * available.length)];
    return [...core.slice(0, 2), special].map((upgrade) => ({ ...upgrade, rarity: upgrade.id.startsWith("special_") ? undefined : rollUpgradeRarity(rarityTier) }));
  }
  return core.map((upgrade) => ({ ...upgrade, rarity: rollUpgradeRarity(rarityTier) }));
}

function rollUpgradeRarity(tier: number): "normal" | "rare" | "epic" {
  const odds = FRACTAL_RARITY_TIERS[Math.max(0, Math.min(3, tier))];
  const roll = Math.random() * 100;
  if (roll < odds.epic) return "epic";
  if (roll < odds.epic + odds.rare) return "rare";
  return "normal";
}

const UPGRADE_RARITY_MULTIPLIERS = { normal: 1, rare: 1.25, epic: 1.5 } as const;
function getUpgradeRarityMultiplier(rarity: Upgrade["rarity"]): number {
  return UPGRADE_RARITY_MULTIPLIERS[rarity ?? "normal"];
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

function makeGame(width: number, height: number, purchases: PurchaseState): GameState {
  const maxHp = 100 + purchases.health * 10;
  const projectileLife = PROJECTILE_BASE_LIFE * PROJECTILE_DURATION_MULTIPLIERS[clamp(purchases.projectile_duration, 0, 3)];
  return {
    width, height, last: 0, elapsed: 0, spawnTimer: 0.4, shotTimer: 0.25, bossSpawned: false,
    player: { x: 0, y: 0, hp: maxHp, maxHp, speed: 205, damage: 22, fireRate: 0.72, invuln: 0, hitFlash: 0, xp: 0, nextXp: 12, level: 1, pickupRadius: 85, xpMultiplier: 1, specialAreaStacks: 0, specialExperienceStacks: 0, projectileRangeStacks: 0, projectileRangeMultiplier: 1, projectileStacks: 0, projectileLife, facing: 0, castFacing: 0, castTimer: 0, moving: false, spriteAction: "idle", spriteDirection: 0, previousSpriteAction: "idle", previousSpriteDirection: 0, spriteBlend: 1 },
    enemies: [], shots: [], gems: [], specialDrops: [], particles: [], damageNumbers: [], pickupLabels: [], challengeEvent: null, nextChallengeEvent: 0, kills: 0, ended: false,
  };
}

function spawnEnemy(game: GameState, missionId: number, elapsed: number, corruption: number, boss = false) {
  const side = Math.floor(Math.random() * 4);
  const margin = 30;
  const centerX = game.player.x, centerY = game.player.y;
  const x = side === 0 ? centerX - game.width / 2 - margin : side === 1 ? centerX + game.width / 2 + margin : centerX + (Math.random() - 0.5) * game.width;
  const y = side === 2 ? centerY - game.height / 2 - margin : side === 3 ? centerY + game.height / 2 + margin : centerY + (Math.random() - 0.5) * game.height;
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
  game.enemies.push({ x, y, ...stats, maxHp: stats.hp, type, attack: type === "boss" ? 2.2 : 0, flash: 0, windup: 0, targetX: x, targetY: y, dashTime: 0, summonedAtHalf: false });
  // Spawn pressure is bounded. It affects encounter density, not enemy HP directly.
  if (!boss && pressure.enemySpawnScale > 1.25 && game.enemies.length < 48 && Math.random() < 0.18) {
    game.enemies.push({ x: x + (Math.random() - 0.5) * 70, y: y + (Math.random() - 0.5) * 70, ...stats, maxHp: stats.hp, type, attack: 0, flash: 0, windup: 0, targetX: x, targetY: y, dashTime: 0, summonedAtHalf: false });
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
  if (floorPattern) { ctx.fillStyle = floorPattern; ctx.fillRect(cameraX, cameraY, viewWidth, viewHeight); }

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

  if (game.challengeEvent) {
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

  game.gems.forEach((gem) => {
    if (gem.x < cameraX - 30 || gem.x > cameraX + viewWidth + 30 || gem.y < cameraY - 30 || gem.y > cameraY + viewHeight + 30) return;
    ctx.save(); ctx.translate(gem.x, gem.y);
    const pulse = 1 + Math.sin(game.elapsed * 6 + gem.x * 0.03) * 0.08;
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
    const speed = Math.hypot(shot.vx, shot.vy) || 1; const len = 34;
    const tx = shot.x - shot.vx / speed * len, ty = shot.y - shot.vy / speed * len;
    const trail = ctx.createLinearGradient(tx, ty, shot.x, shot.y);
    trail.addColorStop(0, "rgba(183,122,255,0)"); trail.addColorStop(1, "rgba(226,196,255,.75)");
    ctx.strokeStyle = trail; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(shot.x, shot.y); ctx.stroke();
  });
  game.rings?.forEach((ring) => { ctx.globalAlpha = clamp(ring.life * 2.4, 0, 1); ctx.strokeStyle = ring.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2); ctx.stroke(); });
  ctx.restore();
  game.shots.forEach((shot) => {
    ctx.save(); ctx.translate(shot.x, shot.y); ctx.rotate(Math.atan2(shot.vy, shot.vx));
    const fade = clamp(shot.life / Math.max(0.01, game.player.projectileLife), 0.25, 1);
    ctx.globalAlpha = fade;
    const projectile = sprites.projectile;
    if (projectile?.complete && projectile.naturalWidth > 0) {
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
      ctx.filter = hurt ? "brightness(2.35) saturate(.35)" : "none";
      ctx.shadowColor = enemy.type === "brute" ? "#9b7bce" : enemy.type === "charger" ? "#b58cff" : "#8b68ff";
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
    if (enemy.type === "boss" || enemy.hp < enemy.maxHp) {
      const barW = enemy.type === "boss" ? 86 : 30;
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(-barW / 2, -enemy.radius - 10, barW, 4);
      ctx.fillStyle = "#e87979"; ctx.fillRect(-barW / 2, -enemy.radius - 10, barW * clamp(enemy.hp / enemy.maxHp, 0, 1), 4);
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
  const [corruptionExpanded, setCorruptionExpanded] = useState(false);
  const [exchangeAmount, setExchangeAmount] = useState("10");
  const [coinBalance, setCoinBalance] = useState(0);
  const [corruption, setCorruption] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [levelChoices, setLevelChoices] = useState<Upgrade[]>([]);
  const [eventRewardStep, setEventRewardStep] = useState(0);
  const [hud, setHud] = useState({ hp: 100, maxHp: 100, xp: 0, nextXp: 12, level: 1, kills: 0, elapsed: 0, moveSpeed: 205, fps: 0, visibleEnemies: 0, phase: "Exploração", pressure: 0, event: null as null | { id: number; remaining: number; progress: number; inside: boolean } });
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
  const [shopSection, setShopSection] = useState<"permanent" | "relics">("permanent");
  const [runId, setRunId] = useState<string | null>(null);
  const [shopBusy, setShopBusy] = useState(false);
  const [shopOpen, setShopOpen] = useState(true);
  const [shopError, setShopError] = useState<string | null>(null);
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
    const { data: newRunId, error: runError } = await (supabase.rpc as any)("start_fractal_run", { _corruption: corruption });
    if (runError) { toast.error(runError.message); return; }
    setRunId(newRunId);
    const rect = canvasRef.current?.getBoundingClientRect();
    const width = Math.max(320, rect?.width ?? 760);
    const height = Math.max(380, rect?.height ?? 520);
    const game = makeGame(width, height, purchases);
    gameRef.current = game;
    eventRewardRemainingRef.current = 0;
    setEventRewardStep(0);
    setHud({ hp: game.player.hp, maxHp: game.player.maxHp, xp: 0, nextXp: 12, level: 1, kills: 0, elapsed: 0, moveSpeed: Math.round(game.player.speed), fps: 0, visibleEnemies: 0, phase: "Exploração", pressure: 0, event: null });
    setLevelChoices([]); setPaused(false); setResult(null); setBossMessage(false); setRunning(true);
  }, [corruption, purchases]);

  const chooseUpgrade = useCallback((upgrade: Upgrade) => {
    const game = gameRef.current;
    if (!game) return;
    const rarityPower = getUpgradeRarityMultiplier(upgrade.rarity);
    if (upgrade.id === "special_area" && game.player.specialAreaStacks < 5) { game.player.specialAreaStacks += 1; game.player.pickupRadius = 85 * (1 + game.player.specialAreaStacks * 0.10); }
    if (upgrade.id === "special_experience" && game.player.specialExperienceStacks < 6) { game.player.specialExperienceStacks += 1; game.player.xpMultiplier = 1 + game.player.specialExperienceStacks * 0.05; }
    if (upgrade.id === "special_projectile_range" && game.player.projectileRangeStacks < 5) { game.player.projectileRangeStacks += 1; game.player.projectileRangeMultiplier = 1 + game.player.projectileRangeStacks * 0.10; }
    if (upgrade.id === "special_projectiles" && game.player.projectileStacks < MAX_EXTRA_PROJECTILES) game.player.projectileStacks += 1;
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
        setLevelChoices(buildLevelChoices(game, purchases.area, purchases.experience, purchases.projectile_range, purchases.projectiles, purchases.rarity));
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
        game.player.x += (dx / mag) * game.player.speed * dt;
        game.player.y += (dy / mag) * game.player.speed * dt;

        if (!game.challengeEvent && game.nextChallengeEvent < CHALLENGE_EVENT_TIMES.length && game.elapsed >= CHALLENGE_EVENT_TIMES[game.nextChallengeEvent]) {
          const eventId = (game.nextChallengeEvent + 1) as 1 | 2;
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.min(150, Math.max(108, Math.min(game.width, game.height) * 0.29));
          const offset = radius * 0.55;
          game.challengeEvent = {
            id: eventId,
            x: game.player.x + Math.cos(angle) * offset,
            y: game.player.y + Math.sin(angle) * offset,
            radius,
            remaining: CHALLENGE_EVENT_DURATION,
            progress: 0,
          };
          game.nextChallengeEvent += 1;
          toast.info(`Anomalia ${eventId} detectada. Permaneça dentro do círculo por 60 segundos.`);
        }

        const activeEvent = game.challengeEvent;
        if (activeEvent) {
          activeEvent.remaining = Math.max(0, activeEvent.remaining - dt);
          const insideEvent = distance(game.player.x, game.player.y, activeEvent.x, activeEvent.y) <= activeEvent.radius;
          activeEvent.progress = insideEvent ? Math.min(CHALLENGE_EVENT_DURATION, activeEvent.progress + dt) : 0;

          if (activeEvent.remaining <= 0) {
            const completed = activeEvent.progress >= CHALLENGE_EVENT_DURATION - 0.5;
            game.challengeEvent = null;
            if (completed) {
              eventRewardRemainingRef.current = 2;
              setEventRewardStep(1);
              setLevelChoices(buildLevelChoices(game, purchases.area, purchases.experience, purchases.projectile_range, purchases.projectiles, purchases.rarity));
              toast.success("Anomalia estabilizada! Escolha dois upgrades, um de cada vez.");
            } else {
              toast.error("A anomalia se dissipou. Você precisa permanecer na área durante todo o minuto.");
            }
          }
        }

        const snapshot = getDifficultySnapshot(missionId, game.elapsed, corruption);
        const eventDensityBonus = game.challengeEvent ? 2 : 0;
        const spawnInterval = clamp(1.18 / (snapshot.enemySpawnScale + eventDensityBonus), 0.22, 1.35);
        game.spawnTimer -= dt;
        if (game.spawnTimer <= 0 && game.enemies.length < 50 && game.elapsed < RUN_DURATION_SECONDS) {
          spawnEnemy(game, missionId, game.elapsed, corruption);
          game.spawnTimer = spawnInterval * (0.78 + Math.random() * 0.45);
        }
        if (game.elapsed >= 660 && !game.bossSpawned) {
          spawnEnemy(game, missionId, game.elapsed, corruption, true); game.bossSpawned = true;
          if (!bossNotified) { bossNotified = true; setBossMessage(true); }
        }
        game.shotTimer -= dt;
        if (game.shotTimer <= 0 && game.enemies.length > 0) {
          let target = game.enemies[0]; let bestScore = Infinity;
          for (const enemy of game.enemies) {
            const d = distance(game.player.x, game.player.y, enemy.x, enemy.y);
            const priority = enemy.type === "boss" ? 95 : enemy.type === "elite" ? 28 : enemy.type === "charger" ? 12 : 0;
            const score = d - priority;
            if (score < bestScore) { bestScore = score; target = enemy; }
          }
          const d = Math.max(1, distance(game.player.x, game.player.y, target.x, target.y));
          const baseAngle = Math.atan2(target.y - game.player.y, target.x - game.player.x);
          const projectileCount = 1 + game.player.projectileStacks;
          const spread = projectileCount === 1 ? [0] : projectileCount === 2 ? [-0.095, 0.095] : [-0.16, 0, 0.16];
          const speed = 440 * game.player.projectileRangeMultiplier;
          const damageScale = projectileCount === 1 ? 1 : 0.68;
          game.player.castFacing = directionFromVector(target.x - game.player.x, target.y - game.player.y);
          game.player.castTimer = 0.24;
          for (const angleOffset of spread) {
            const angle = baseAngle + angleOffset;
            game.shots.push({
              x: game.player.x, y: game.player.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
              damage: game.player.damage * damageScale, life: game.player.projectileLife,
            });
          }
          game.shotTimer = game.player.fireRate;
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
        game.shots.forEach((shot) => { shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt; });
        const currentZoom = zoomRef.current;
        const cameraLeft = game.player.x - game.width / (2 * currentZoom), cameraTop = game.player.y - game.height / (2 * currentZoom);
        game.shots = game.shots.filter((shot) => shot.life > 0 && shot.x > cameraLeft - 20 && shot.x < cameraLeft + game.width / currentZoom + 20 && shot.y > cameraTop - 20 && shot.y < cameraTop + game.height / currentZoom + 20);
        const movementGrid = game.enemies.length < 20 ? buildEnemySpatialGrid(game.enemies) : null;
        for (const enemy of game.enemies) {
          const d = Math.max(1, distance(game.player.x, game.player.y, enemy.x, enemy.y));
          enemy.flash = Math.max(0, enemy.flash - dt);
          enemy.attack = Math.max(0, enemy.attack - dt);
          if (enemy.type === "boss") {
            if (enemy.windup > 0) {
              enemy.windup -= dt;
              if (enemy.windup <= 0 && distance(game.player.x, game.player.y, enemy.targetX, enemy.targetY) < 101 && game.player.invuln <= 0) {
                game.player.hp = Math.max(0, game.player.hp - 28); game.player.invuln = 0.85; game.player.hitFlash = 0.3; game.shake = Math.max(game.shake ?? 0, 7);
              }
            } else if (enemy.attack <= 0) {
              const phaseTwo = enemy.hp <= enemy.maxHp * 0.5;
              enemy.targetX = game.player.x; enemy.targetY = game.player.y; enemy.windup = phaseTwo ? 0.82 : 1.05; enemy.attack = phaseTwo ? 3.8 : 5.1;
            }
            if (enemy.hp <= enemy.maxHp * 0.5 && !enemy.summonedAtHalf) {
              enemy.summonedAtHalf = true;
              for (let i = 0; i < 3; i++) {
                const angle = (Math.PI * 2 * i) / 3;
                game.enemies.push({ x: enemy.x + Math.cos(angle) * 58, y: enemy.y + Math.sin(angle) * 58, hp: 34, maxHp: 34, speed: 62, radius: 10, damage: 8, color: "#9b91b4", xp: 2, type: "wraith", attack: 0, flash: 0, windup: 0, targetX: 0, targetY: 0, dashTime: 0, summonedAtHalf: false });
              }
            }
            const separation = movementGrid ? getEnemySeparation(enemy, movementGrid) : NO_ENEMY_SEPARATION;
            const steerX = (game.player.x - enemy.x) / d + separation.x * 0.28;
            const steerY = (game.player.y - enemy.y) / d + separation.y * 0.28;
            const steerLength = Math.max(1, Math.hypot(steerX, steerY));
            const phaseTwoSpeed = enemy.hp <= enemy.maxHp * 0.5 ? 1.16 : 1;
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
        const collisionGrid = buildEnemySpatialGrid(game.enemies);
        for (const shot of game.shots) {
          for (const enemy of getNearbyEnemies(shot.x, shot.y, collisionGrid)) {
            const hitRadius = enemy.radius + 5;
            const hitX = shot.x - enemy.x;
            const hitY = shot.y - enemy.y;
            if (enemy.hp > 0 && hitX * hitX + hitY * hitY < hitRadius * hitRadius) {
              enemy.hp -= shot.damage; enemy.flash = 0.09; shot.life = 0; for (let k = 0; k < 2; k++) game.particles.push({ x: shot.x, y: shot.y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.22, color: "#f3dcff" });
              game.damageNumbers.push({ x: enemy.x + (Math.random() - 0.5) * 10, y: enemy.y - enemy.radius - 8, value: shot.damage, life: 0.82, maxLife: 0.82, drift: (Math.random() - 0.5) * 14 });
              if (game.damageNumbers.length > 20) game.damageNumbers.shift();
              if (enemy.hp <= 0) {
                game.kills += 1;
                if (enemy.type !== "boss") {
                  game.gems.push({ x: enemy.x, y: enemy.y, value: enemy.xp, radius: 5 });
                  const specialDropTier = Math.max(purchases.area, purchases.experience, purchases.projectile_range, purchases.projectiles);
                  const specialDropChance = specialDropTier >= 3 ? 0.03 : specialDropTier >= 2 ? 0.01 : 0;
                  if ((enemy.type === "elite" || enemy.type === "brute") && specialDropChance > 0 && Math.random() < specialDropChance) {
                    const eligible: SpecialDrop["kind"][] = [];
                    if (purchases.area >= 1 && game.player.specialAreaStacks < 5) eligible.push("area");
                    if (purchases.experience >= 1 && game.player.specialExperienceStacks < 6) eligible.push("experience");
                    if (purchases.projectile_range >= 1 && game.player.projectileRangeStacks < 5) eligible.push("projectile_range");
                    if (purchases.projectiles >= 1 && game.player.projectileStacks < MAX_EXTRA_PROJECTILES) eligible.push("projectiles");
                    if (eligible.length) game.specialDrops.push({ x: enemy.x, y: enemy.y, kind: eligible[Math.floor(Math.random() * eligible.length)], radius: 13 });
                  }
                } else { game.ended = true; setResult("victory"); if (runId) void (supabase.rpc as any)("finish_fractal_run", { _run_id: runId, _victory: true }).then(({ data, error }: any) => { if (error) toast.error(error.message); else { setFractalBalance(Number(data?.fractals ?? 0)); setCoinBalance(Number(data?.coins ?? 0)); setUnlockedCorruption(Number(data?.corruptionUnlocked ?? 0)); setCompletedCorruptions(Array.isArray(data?.completedCorruptions) ? data.completedCorruptions : []); toast.success("Corrupção concluída. O próximo nível foi liberado."); } }); }
                { const big = enemy.type === "boss" || enemy.type === "elite"; const count = big ? 30 : 12;
                  for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2; const sp = 60 + Math.random() * (big ? 260 : 170); game.particles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + Math.random() * 0.4, color: i % 3 === 0 ? "#fff1ff" : i % 3 === 1 ? "#b98cff" : enemy.color }); }
                  (game.rings ??= []).push({ x: enemy.x, y: enemy.y, r: 6, max: big ? 140 : 46, life: big ? 0.6 : 0.32, color: big ? "#e9c46a" : "#c9a2ff" });
                  if (big) game.shake = Math.max(game.shake ?? 0, enemy.type === "boss" ? 16 : 9); }
              }
              break;
            }
          }
        }
        game.enemies = game.enemies.filter((enemy) => enemy.hp > 0 && (enemy.type === "boss" || distance(enemy.x, enemy.y, game.player.x, game.player.y) < Math.max(game.width, game.height) / zoomRef.current * 1.45));
        game.gems.forEach((gem) => {
          const d = distance(game.player.x, game.player.y, gem.x, gem.y);
          if (d < game.player.pickupRadius) { gem.x += ((game.player.x - gem.x) / Math.max(1, d)) * 260 * dt; gem.y += ((game.player.y - gem.y) / Math.max(1, d)) * 260 * dt; }
          if (d < 17) {
            game.player.xp += gem.value * game.player.xpMultiplier; gem.value = 0;
          }
        });
        game.gems = game.gems.filter((gem) => gem.value > 0 && distance(gem.x, gem.y, game.player.x, game.player.y) < Math.max(game.width, game.height) * 1.6);
        game.specialDrops.forEach((drop) => {
          const d = distance(game.player.x, game.player.y, drop.x, drop.y);
          if (d < game.player.pickupRadius) { drop.x += ((game.player.x - drop.x) / Math.max(1, d)) * 280 * dt; drop.y += ((game.player.y - drop.y) / Math.max(1, d)) * 280 * dt; }
          if (d < 18) {
            const pickupNames: Record<SpecialDrop["kind"], string> = {
              area: "Ímã de Fragmentos",
              experience: "Eco do Conhecimento",
              projectile_range: "Ressonância de Alcance",
              projectiles: "Coroa de Estilhaços",
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
        game.particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
        game.particles = game.particles.filter((p) => p.life > 0);
        if (game.particles.length > 140) game.particles.splice(0, game.particles.length - 140);
        game.shake = Math.max(0, (game.shake ?? 0) - dt * 30);
        if (game.rings) { game.rings.forEach((ring) => { ring.life -= dt; ring.r += (ring.max - ring.r) * Math.min(1, dt * 9); }); game.rings = game.rings.filter((ring) => ring.life > 0).slice(-20); }
        if (game.gems.length > 60) {
          const overflow = game.gems.splice(0, game.gems.length - 180);
          const retainedGem = game.gems[0];
          if (retainedGem) retainedGem.value += overflow.reduce((total, gem) => total + gem.value, 0);
        }
        if (game.player.xp >= game.player.nextXp && !game.ended && eventRewardRemainingRef.current === 0) {
          game.player.xp -= game.player.nextXp; game.player.level += 1; game.player.nextXp = Math.floor(game.player.nextXp * 1.32 + 5);
          
          setLevelChoices(buildLevelChoices(game, purchases.area, purchases.experience, purchases.projectile_range, purchases.projectiles, purchases.rarity));
        }
        if (game.player.hp <= 0 && !game.ended) { game.ended = true; setResult("defeat"); if (runId) void (supabase.rpc as any)("finish_fractal_run", { _run_id: runId, _victory: false }).then(({ error }: any) => { if (error) toast.error(error.message); }); }
        if (game.elapsed >= RUN_DURATION_SECONDS && !game.ended && !game.bossSpawned) { spawnEnemy(game, missionId, game.elapsed, corruption, true); game.bossSpawned = true; }
        if (now - lastHud > 100) {
          lastHud = now;
          const halfViewWidth = game.width / (2 * zoomRef.current);
          const halfViewHeight = game.height / (2 * zoomRef.current);
          const visibleEnemies = game.enemies.reduce((count, enemy) =>
            count + Number(enemy.x >= game.player.x - halfViewWidth && enemy.x <= game.player.x + halfViewWidth && enemy.y >= game.player.y - halfViewHeight && enemy.y <= game.player.y + halfViewHeight), 0);
          setHud({ hp: game.player.hp, maxHp: game.player.maxHp, xp: game.player.xp, nextXp: game.player.nextXp, level: game.player.level, kills: game.kills, elapsed: game.elapsed, moveSpeed: Math.round(game.player.speed), fps: measuredFps, visibleEnemies, phase: snapshot.phaseLabel, pressure: snapshot.totalPressure + (game.challengeEvent ? 2 : 0), event: game.challengeEvent ? { id: game.challengeEvent.id, remaining: game.challengeEvent.remaining, progress: game.challengeEvent.progress, inside: distance(game.player.x, game.player.y, game.challengeEvent.x, game.challengeEvent.y) <= game.challengeEvent.radius } : null });
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
  }, [running, paused, levelChoices.length, missionId, corruption, speedMultiplier, runId, purchases, showPlayerHp, showDamageNumbers]);

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
        <Card className="fractals-lobby-card">
          <div className="fractals-lobby">
            <div className="fractals-hero">
              <div className="fractals-hero__copy"><p className="fractals-eyebrow"><span className="fractals-eyebrow__dot"/><span>PROTOCOLO DE SOBREVIVÊNCIA · 01</span><span className="fractals-eyebrow__line"/></p><h2 className="fractals-title">ECOS <span>DOS</span><br/>FRACTAIS</h2><p className="fractals-hero__text">O Vazio abriu uma fenda. Atravesse as ruínas, recolha fragmentos e sobreviva ao despertar do guardião.</p><div className="fractals-hero__tags"><span>ROGUELIKE</span><span>12 MIN</span><span>COMBATE AUTOMÁTICO</span></div></div>
              <div className="fractals-hero__sigil" aria-hidden="true"><div className="fractals-hero__sigil-ring"/><div className="fractals-hero__sigil-core"><Sparkles/><GemIcon/></div><span className="fractals-hero__sigil-caption">NEXUS<br/>FRACTALIS</span></div>
            </div>
            <div className="fractals-lobby-grid">
              <section className="fractals-panel fractals-mission-panel">
                <div className="fractals-panel__label"><span>01 / OPERAÇÃO ATIVA</span><b>MISSÃO</b></div>
                <div className="fractals-mission-heading">
                  <div className="fractals-mission-identity"><span className="fractals-mission-symbol"><MapPin/></span><div><h3>{mission.name}</h3><p>{mission.pathName}</p></div></div>
                  <div className="fractals-mission-actions">
                    <div className="fractals-mission-reward"><GemIcon/><b>{mission.maxFractals}</b><small>FR MÁX.</small></div>
                    <button type="button" className="fractals-mission-select" onClick={() => setMissionPickerOpen(true)}>SELECIONAR MISSÃO <ChevronDown/></button>
                  </div>
                </div>
                <p className="fractals-mission-lore">{mission.lore}</p>
                <p className="fractals-mission-identity-copy">{mission.identity}</p>
              </section>
              <section className="fractals-panel fractals-corruption-panel">
                <button type="button" className="fractals-corruption-heading" aria-expanded={corruptionExpanded} onClick={() => setCorruptionExpanded((value) => !value)}>
                  <span><small>02 / RISCO DA FENDA</small><strong>CORRUPÇÃO</strong></span>
                  <span className="fractals-corruption-active"><small>NÍVEL {String(corruption).padStart(2,"0")}</small><strong>{CORRUPTION_LEVELS[corruption].name}</strong><ChevronDown className={corruptionExpanded ? "is-expanded" : ""}/></span>
                </button>
                {!corruptionExpanded ? (
                  <button type="button" className="fractals-corruption-current" onClick={() => setCorruptionExpanded(true)}>
                    <span className="fractals-corruption-current__sigil"><Shield/></span>
                    <span><strong>{CORRUPTION_LEVELS[corruption].name}</strong><small>{CORRUPTION_LEVELS[corruption].description}</small></span>
                    <span className="fractals-corruption-current__hint">ALTERAR</span>
                  </button>
                ) : (
                  <>
                    <div className="fractals-corruption-grid">
                      {CORRUPTION_LEVELS.map((level) => {
                        const locked = level.level > unlockedCorruption;
                        return <button key={level.level} type="button" disabled={locked} onClick={() => { setCorruption(level.level); setCorruptionExpanded(false); }} className={`fractals-corruption-option ${corruption === level.level ? "is-selected" : ""} ${locked ? "is-locked" : ""}`}>
                          <span className="fractals-corruption-option__index">NÍVEL {String(level.level).padStart(2,"0")}</span><strong>{level.name}</strong><span className="fractals-corruption-option__state">{locked ? "BLOQUEADO" : completedCorruptions.includes(level.level) ? "CONCLUÍDO" : corruption === level.level ? "SELECIONADO" : "DISPONÍVEL"}</span>
                        </button>;
                      })}
                    </div>
                    <p className="fractals-corruption-description">{CORRUPTION_LEVELS[corruption].description}</p>
                    <p className="fractals-corruption-hint">{unlockedCorruption < 5 ? "Vença para romper o próximo selo." : "Todos os selos foram rompidos."}</p>
                  </>
                )}
              </section>
            </div>

            <div className="fractals-launch">
              <div className="fractals-launch__copy"><span>O PORTAL ESTÁ INSTÁVEL</span><h3>O Vazio aguarda.</h3><p>Sobreviva por 12 minutos. O guardião desperta ao final da incursão.</p></div>
              <Button onClick={start} className="fractals-launch__button"><Play className="h-4 w-4"/> ENTRAR NA FENDA <span>↗</span></Button>
            </div>
            <section className="fractals-vault">
              <div className="fractals-vault__header"><div className="fractals-vault__brand"><div className="fractals-vault__icon"><ShoppingBag/><span/></div><div><p className="fractals-vault__eyebrow">LOJA DE PROGRESSÃO</p><h3>ARSENAL <span>DE FRACTAIS</span></h3><p>Compre melhorias permanentes e relíquias para suas expedições.</p></div></div><div className="fractals-wallet"><small>SEU COFRE</small><strong>{fractalBalance.toLocaleString("pt-BR")} <i>FR</i></strong><Button size="sm" variant="outline" className="fractals-vault__toggle" onClick={() => setShopOpen((v) => !v)}>{shopOpen ? "FECHAR LOJA" : "ABRIR LOJA"} <span>{shopOpen ? "−" : "+"}</span></Button></div></div>
              {shopError && <p className="mt-2 text-xs text-amber-300">{shopError}</p>}
              {shopOpen && <div className="fractals-vault__content">
                <div className="fractals-exchange">
                  <div className="fractals-exchange__copy"><strong><Coins/> Troca de moedas</strong><span>10 fractais = 1 moeda de ouro</span></div>
                  <div className="fractals-exchange__balance"><small>MOEDAS</small><b>{coinBalance.toLocaleString("pt-BR")}</b></div>
                  <div className="fractals-exchange__controls">
                    <label><input type="number" min={10} max={fractalBalance} step={10} inputMode="numeric" value={exchangeAmount} onChange={(event) => setExchangeAmount(event.target.value)} aria-label="Quantidade de fractais para converter"/><span>FR</span></label>
                    <span className="fractals-exchange__arrow">→</span>
                    <strong>{Math.floor(Math.max(0, exchangeValue) / 10).toLocaleString("pt-BR")} moedas</strong>
                    <Button size="sm" disabled={shopBusy || !exchangeValid} onClick={() => void exchangeFractals()}>TROCAR</Button>
                  </div>
                </div>
                <div className="fractals-shop-tabs" role="tablist" aria-label="Categorias da loja"><button type="button" role="tab" aria-selected={shopSection === "permanent"} className={shopSection === "permanent" ? "is-active" : ""} onClick={() => setShopSection("permanent")}><Crown/> FORJA PERMANENTE <small>05</small></button><button type="button" role="tab" aria-selected={shopSection === "relics"} className={shopSection === "relics" ? "is-active" : ""} onClick={() => setShopSection("relics")}><Sparkles/> RELÍQUIAS DE CAMPO <small>04</small></button></div>
                {shopSection === "permanent" && <section className="fractals-shop-section"><div className="fractals-shop-section__heading"><span>01</span><div><h4>Melhorias permanentes</h4><p>Benefícios fixos para todas as expedições.</p></div></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="group relative overflow-hidden rounded-xl border border-rose-200/20 bg-gradient-to-br from-rose-400/[0.12] to-[#1b1422] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:-translate-y-0.5 hover:border-rose-200/40"><p className="text-xs font-semibold">Vida reforçada</p><p className="text-[10px] text-muted-foreground">Nível {purchases.health}/5 · +10 de vida máxima por nível.</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.health>=5 || (!isMaster && fractalBalance < FRACTAL_SHOP.health[purchases.health].cost)} onClick={() => void purchaseUpgrade("health")}>{purchases.health>=5 ? "Máximo" : isMaster ? "Melhorar grátis" : "Comprar · " + FRACTAL_SHOP.health[purchases.health].cost.toLocaleString("pt-BR")}</Button></div>
                    <div className="group relative overflow-hidden rounded-xl border border-violet-200/20 bg-gradient-to-br from-violet-400/[0.12] to-[#171425] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:-translate-y-0.5 hover:border-violet-200/40"><p className="text-xs font-semibold">Duração dos projéteis</p><p className="text-[10px] text-muted-foreground">Nível {purchases.projectile_duration}/3 · Projéteis permanecem até 1,6 s.</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.projectile_duration>=3 || (!isMaster && fractalBalance < FRACTAL_SHOP.projectile_duration[purchases.projectile_duration].cost)} onClick={() => void purchaseUpgrade("projectile_duration")}>{purchases.projectile_duration>=3 ? "Máximo" : isMaster ? "Melhorar grátis" : "Comprar · " + FRACTAL_SHOP.projectile_duration[purchases.projectile_duration].cost.toLocaleString("pt-BR")}</Button></div>
                    <div className="group relative overflow-hidden rounded-xl border border-violet-100/15 bg-gradient-to-br from-white/[0.07] to-[#171521] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-100/30 hover:shadow-[0_12px_25px_rgba(0,0,0,0.18)]"><p className="text-xs font-semibold">Ressonância de raridade</p><p className="text-[10px] text-muted-foreground">Tier {purchases.rarity}/3 · Mais chances de ofertas Raras e Épicas.</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.rarity>=3 || (!isMaster && fractalBalance < FRACTAL_SHOP.rarity[purchases.rarity].cost)} onClick={() => void purchaseUpgrade("rarity")}>{purchases.rarity>=3 ? "Máximo" : isMaster ? "Desbloquear grátis" : "Comprar · " + FRACTAL_SHOP.rarity[purchases.rarity].cost.toLocaleString("pt-BR")}</Button></div>
                    <div className="group relative overflow-hidden rounded-xl border border-violet-100/15 bg-gradient-to-br from-white/[0.07] to-[#171521] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-100/30 hover:shadow-[0_12px_25px_rgba(0,0,0,0.18)]"><p className="text-xs font-semibold">Velocidade 2x</p><p className="text-[10px] text-muted-foreground">Desbloqueia permanentemente a velocidade 2x.</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.speed_2x || (!isMaster && fractalBalance < FRACTAL_SHOP.speed.double.cost)} onClick={() => void purchaseUpgrade("speed_2x")}>{purchases.speed_2x ? "Adquirido" : isMaster ? "Grátis" : "Comprar · 1.000"}</Button></div>
                    <div className="group relative overflow-hidden rounded-xl border border-violet-100/15 bg-gradient-to-br from-white/[0.07] to-[#171521] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-100/30 hover:shadow-[0_12px_25px_rgba(0,0,0,0.18)]"><p className="text-xs font-semibold">Velocidade 3x</p><p className="text-[10px] text-muted-foreground">Requer 2x · Desbloqueia a velocidade 3x.</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.speed_3x || (!isMaster && (!purchases.speed_2x || fractalBalance < FRACTAL_SHOP.speed.triple.cost))} onClick={() => void purchaseUpgrade("speed_3x")}>{purchases.speed_3x ? "Adquirido" : isMaster ? "Grátis" : "Comprar · 2.000"}</Button></div>
                  </div>
                </section>}
                {shopSection === "relics" && <section className="fractals-shop-section"><div className="fractals-shop-section__heading"><span>02</span><div><h4>Relíquias de campo</h4><p>Habilite artefatos que podem cair de elites e brutamontes.</p></div></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="group relative overflow-hidden rounded-xl border border-violet-100/15 bg-gradient-to-br from-white/[0.07] to-[#171521] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-100/30 hover:shadow-[0_12px_25px_rgba(0,0,0,0.18)]"><p className="text-xs font-semibold">Área de coleta</p><p className="text-[10px] text-muted-foreground">Nível {purchases.area}/3 · Amplia o raio de coleta e libera relíquias de elite.</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.area>=3 || (!isMaster && fractalBalance < FRACTAL_SHOP.area[purchases.area].cost)} onClick={() => void purchaseUpgrade("area")}>{purchases.area>=3 ? "Máximo" : isMaster ? "Desbloquear grátis" : "Comprar · " + FRACTAL_SHOP.area[purchases.area].cost.toLocaleString("pt-BR")}</Button></div>
                    <div className="group relative overflow-hidden rounded-xl border border-violet-100/15 bg-gradient-to-br from-white/[0.07] to-[#171521] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-100/30 hover:shadow-[0_12px_25px_rgba(0,0,0,0.18)]"><p className="text-xs font-semibold">Afinidade de experiência</p><p className="text-[10px] text-muted-foreground">Nível {purchases.experience}/3 · Mais XP por fragmento coletado.</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.experience>=3 || (!isMaster && fractalBalance < FRACTAL_SHOP.experience[purchases.experience].cost)} onClick={() => void purchaseUpgrade("experience")}>{purchases.experience>=3 ? "Máximo" : isMaster ? "Desbloquear grátis" : "Comprar · " + FRACTAL_SHOP.experience[purchases.experience].cost.toLocaleString("pt-BR")}</Button></div>
                    <div className="group relative overflow-hidden rounded-xl border border-violet-100/15 bg-gradient-to-br from-white/[0.07] to-[#171521] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-100/30 hover:shadow-[0_12px_25px_rgba(0,0,0,0.18)]"><p className="text-xs font-semibold">Alcance dos projéteis</p><p className="text-[10px] text-muted-foreground">Nível {purchases.projectile_range}/3 · Projéteis viajam mais longe; +10% por relíquia.</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.projectile_range>=3 || (!isMaster && fractalBalance < FRACTAL_SHOP.projectile_range[purchases.projectile_range].cost)} onClick={() => void purchaseUpgrade("projectile_range")}>{purchases.projectile_range>=3 ? "Máximo" : isMaster ? "Desbloquear grátis" : "Comprar · " + FRACTAL_SHOP.projectile_range[purchases.projectile_range].cost.toLocaleString("pt-BR")}</Button></div>
                    <div className="group relative overflow-hidden rounded-xl border border-violet-100/15 bg-gradient-to-br from-white/[0.07] to-[#171521] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-100/30 hover:shadow-[0_12px_25px_rgba(0,0,0,0.18)]"><p className="text-xs font-semibold">Coroa de Estilhaços</p><p className="text-[10px] text-muted-foreground">Nível {purchases.projectiles}/3 · Até +2 projéteis extras, um por coleta.</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.projectiles>=3 || (!isMaster && fractalBalance < FRACTAL_SHOP.projectiles[purchases.projectiles].cost)} onClick={() => void purchaseUpgrade("projectiles")}>{purchases.projectiles>=3 ? "Máximo" : isMaster ? "Desbloquear grátis" : "Comprar · " + FRACTAL_SHOP.projectiles[purchases.projectiles].cost.toLocaleString("pt-BR")}</Button></div>
                  </div>
                </section>}
              </div>}
              <p className="fractals-vault__footnote">Relíquias podem surgir nas escolhas de nível ou cair de elites e brutamontes. Seus efeitos duram até o fim da expedição.</p>
            </section>
          </div>
        </Card>
      )}

      {(running || result) && (
        <Card className="overflow-hidden border-border/70 bg-[#11111a] text-white">
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
                {hud.event && <div className="fractals-hud-event"><Target/> ANOMALIA {hud.event.id} · {Math.ceil(hud.event.remaining)}s</div>}
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
            <div className="fractals-arena-hint pointer-events-none absolute bottom-3 left-3">WASD / setas / toque para mover</div>
            {bossMessage && !result && <div className="pointer-events-none absolute inset-x-0 top-14 text-center"><span className="rounded-full border border-violet-300/40 bg-violet-950/80 px-4 py-2 text-xs font-semibold tracking-wider text-violet-100">{mission.bossTitle.toUpperCase()} DESPERTOU</span></div>}
            {paused && !result && levelChoices.length === 0 && <div className="fractals-pause-overlay absolute inset-0 grid place-items-center overflow-y-auto p-3 sm:p-5">
 <div className="fractals-pause-panel relative w-full max-w-md overflow-hidden p-4 sm:p-5">
  <div className="fractals-pause-header mb-4 flex items-center justify-between pb-3"><div><p className="text-[9px] font-bold uppercase tracking-[.24em] text-violet-200/70">Ecos dos Fractais · Refúgio</p><h3 className="mt-1 font-display text-2xl text-white">Expedição pausada</h3></div><div className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-200/20 bg-amber-200/10 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.12)]"><Pause className="h-5 w-5"/></div></div>
  {pausePanel === "main" ? <>
   <div className="fractals-pause-actions grid grid-cols-2 gap-2"><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={() => setPausePanel("attributes")}><UserRound className="h-4 w-4"/> Atributos</Button><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={toggleFullscreen}><Maximize className="h-4 w-4"/> Tela cheia</Button><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={() => setShowPlayerHp((v) => !v)}><Heart className="h-4 w-4 text-rose-300"/> HP: {showPlayerHp ? "visível" : "oculto"}</Button><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={() => setShowDamageNumbers((v) => !v)}><Swords className="h-4 w-4 text-amber-200"/> Dano: {showDamageNumbers ? "visível" : "oculto"}</Button></div>
   <div className="fractals-pause-speed mt-3 rounded-2xl p-3"><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/75"><Gauge className="h-4 w-4"/> Velocidade da expedição</div><div className="grid grid-cols-3 gap-2">{([1,2,3] as const).map((speed) => <Button key={speed} size="sm" variant={speedMultiplier===speed?"default":"outline"} disabled={!isMaster && (speed===2 ? !purchases.speed_2x : speed===3 ? !purchases.speed_3x : false)} className={!isMaster && speed>1?"border-white/10 opacity-45":""} onClick={()=>setSpeedMultiplier(speed)}>{speed}x{!isMaster && (speed===2 ? !purchases.speed_2x : speed===3 ? !purchases.speed_3x : false)?" 🔒":""}</Button>)}</div>{!isMaster && <p className="mt-2 text-[10px] text-white/45">Desbloqueie 2x e 3x na loja de fractais.</p>}{isMaster && <><p className="mt-2 text-[10px] text-emerald-200/70">Acesso de mestre: todas as velocidades liberadas para testes.</p><Button variant="outline" size="sm" className="mt-2 h-8 w-full border-emerald-200/25 bg-emerald-400/[0.07] text-[10px] text-emerald-100 hover:bg-emerald-400/15" onClick={() => { const game = gameRef.current; if (!game) return; game.enemies = Array.from({length:50},(_,index) => { const angle = index / 50 * Math.PI * 2; const ring = 46 + (index % 3) * 29; const x = game.player.x + Math.cos(angle) * ring; const y = game.player.y + Math.sin(angle) * ring; return { x, y, hp: 100000, maxHp: 100000, speed: 22, radius: 10, damage: 0, color: "#9b91b4", xp: 0, type: "wraith" as const, attack: 0, flash: 0, windup: 0, targetX: x, targetY: y, dashTime: 0, summonedAtHalf: false }; }); game.spawnTimer = Number.MAX_SAFE_INTEGER; game.bossSpawned = true; setPaused(false); toast.info("Teste de carga ativo: 50 monstros na arena. Confira o FPS e o contador 50/50 no topo."); }}>TESTE DE CARGA · 50 MONSTROS</Button></>}</div>
   <Button className="fractals-pause-resume mt-3 h-11 w-full font-bold" onClick={() => {setPausePanel("main");setPaused(false)}}><Play className="mr-2 h-4 w-4"/> Retomar expedição</Button>
  </> : <>
   <div className="mb-3 grid grid-cols-2 gap-2">{[["Vida",`${Math.ceil(gameRef.current?.player.hp ?? hud.hp)} / ${Math.ceil(gameRef.current?.player.maxHp ?? hud.maxHp)}`],["Dano",`${(gameRef.current?.player.damage ?? 0).toFixed(1)}`],["Velocidade",`${(gameRef.current?.player.speed ?? 0).toFixed(0)}`],["Intervalo de ataque",`${(gameRef.current?.player.fireRate ?? 0).toFixed(2)}s`],["Nível",`${gameRef.current?.player.level ?? hud.level}`],["Projéteis",`${1 + (gameRef.current?.player.projectileStacks ?? 0)}`],["Alcance",`+${Math.round((gameRef.current?.player.projectileRangeMultiplier ?? 1) * 100 - 100)}%`],["Experiência",`${Math.floor(gameRef.current?.player.xp ?? hud.xp)} / ${Math.floor(gameRef.current?.player.nextXp ?? hud.nextXp)}`],["Abates",`${gameRef.current?.kills ?? hud.kills}`],["Multiplicador",`${speedMultiplier}x`]].map(([label,value])=><div key={label} className="rounded-lg border border-white/10 bg-white/5 p-2"><p className="text-[10px] text-white/45">{label}</p><p className="text-sm font-semibold tabular-nums text-white">{value}</p></div>)}</div>
   <Button variant="outline" className="w-full border-white/15 text-white hover:bg-white/10" onClick={()=>setPausePanel("main")}><ArrowLeft className="mr-2 h-4 w-4"/> Voltar ao menu</Button>
  </>}
 </div>
</div>}
            {levelChoices.length > 0 && (
              <div className="fractals-upgrade-overlay absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(91,46,133,0.24),rgba(5,4,10,0.97)_75%)] p-3 backdrop-blur-md sm:p-6">
                <div className="fractals-upgrade-panel relative my-auto w-full max-w-5xl space-y-5 rounded-2xl border border-amber-200/15 bg-[#100d18]/95 p-3 shadow-[0_30px_100px_rgba(0,0,0,0.8)] sm:space-y-6 sm:rounded-[1.8rem] sm:p-6">
                  <div className="relative text-center">
                    <div className="mx-auto mb-3 flex w-fit items-center gap-3 text-amber-200/40">
                      <span className="h-px w-10 bg-gradient-to-r from-transparent to-amber-200/50" />
                      <span className="text-sm">✧</span>
                      <span className="text-[8px] font-black uppercase tracking-[.35em]">Arquivos do destino</span>
                      <span className="text-sm">✧</span>
                      <span className="h-px w-10 bg-gradient-to-l from-transparent to-amber-200/50" />
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-[.3em] text-violet-200/60">
                      {eventRewardStep > 0 ? `DESAFIO DA FENDA · DÁDIVA ${eventRewardStep}/2` : "O FRACTAL OFERECE SEU PODER"}
                    </p>
                    <h3 className="mt-2 font-display text-2xl tracking-wide text-white drop-shadow-[0_2px_12px_rgba(196,181,253,0.3)] sm:text-4xl">
                      {eventRewardStep > 0 ? "Reivindique sua recompensa" : "Escolha uma dádiva"}
                    </h3>
                    <p className="mt-2 text-[10px] tracking-wide text-white/40 sm:text-xs">Cada escolha altera o curso da sua expedição.</p>
                    <div className="mx-auto mt-4 flex max-w-xs items-center gap-3">
                      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-violet-300/30" />
                      <span className="text-[10px] text-violet-200/50">◆</span>
                      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-violet-300/30" />
                    </div>
                  </div>

                  <div className="fractals-upgrade-grid grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                    {levelChoices.map((upgrade) => {
                      const Icon = upgrade.icon;
                      const rarity = upgrade.rarity ?? "normal";
                      const isEpic = rarity === "epic";
                      const isRare = rarity === "rare";

                      const palette = isEpic
                        ? {
                            border: "border-amber-300/65", inner: "border-amber-200/25",
                            icon: "border-amber-200/35 bg-amber-300/10 text-amber-100",
                            badge: "border-amber-200/40 bg-amber-300/15 text-amber-100",
                            glow: "bg-fuchsia-500/15",
                            shadow: "hover:shadow-[0_0_45px_rgba(217,70,239,0.28),0_0_20px_rgba(251,191,36,0.16)]",
                            title: "text-amber-100", accent: "text-amber-300/70",
                            background: "from-[#362044] via-[#21152d] to-[#120f1d]",
                            corner: "border-amber-200/50", line: "bg-amber-200/25",
                            footer: "border-amber-200/20 text-amber-100",
                          }
                        : isRare
                        ? {
                            border: "border-cyan-300/55", inner: "border-sky-200/25",
                            icon: "border-cyan-200/35 bg-cyan-300/10 text-cyan-100",
                            badge: "border-cyan-200/35 bg-cyan-300/10 text-cyan-100",
                            glow: "bg-cyan-400/15",
                            shadow: "hover:shadow-[0_0_40px_rgba(34,211,238,0.25)]",
                            title: "text-cyan-100", accent: "text-sky-200/70",
                            background: "from-[#17303b] via-[#14212e] to-[#10131f]",
                            corner: "border-cyan-200/45", line: "bg-cyan-200/25",
                            footer: "border-cyan-200/20 text-cyan-100",
                          }
                        : {
                            border: "border-[#a98a62]/55", inner: "border-amber-100/15",
                            icon: "border-amber-100/20 bg-amber-100/[0.06] text-amber-200",
                            badge: "border-amber-100/20 bg-amber-100/[0.06] text-amber-100/70",
                            glow: "bg-amber-200/[0.07]",
                            shadow: "hover:shadow-[0_0_32px_rgba(180,130,75,0.18)]",
                            title: "text-[#e9d4b0]", accent: "text-amber-100/45",
                            background: "from-[#30251f] via-[#201a20] to-[#13121b]",
                            corner: "border-amber-200/30", line: "bg-amber-100/15",
                            footer: "border-amber-100/15 text-amber-100/80",
                          };

                      const label = isEpic ? "ÉPICA" : isRare ? "RARA" : "NORMAL";
                      const bonus = isEpic ? "+50% POTÊNCIA" : isRare ? "+25% POTÊNCIA" : "POTÊNCIA BASE";

                      return (
                        <button
                          key={upgrade.id}
                          type="button"
                          onClick={() => chooseUpgrade(upgrade)}
                          className={[
                            "fractals-upgrade-card group relative isolate flex min-h-[260px] w-full min-w-0 flex-col overflow-hidden rounded-xl border bg-gradient-to-br p-[5px] text-left",
                            "transition-all duration-300 ease-out active:-translate-y-1 active:scale-[0.99] active:brightness-125",
                            "hover:-translate-y-2 hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#100d18]",
                            palette.border, palette.background, palette.shadow,
                            isRare ? "fractals-card-rare" : "",
                            isEpic ? "fractals-card-epic" : "",
                          ].join(" ")}
                        >
                          <div className={`pointer-events-none absolute -inset-8 -z-10 rounded-full blur-3xl ${palette.glow}`} />
                          <div className={`pointer-events-none absolute inset-[5px] rounded-lg border ${palette.inner}`} />

                          <div className={`pointer-events-none absolute left-2 top-2 h-5 w-5 border-l border-t ${palette.corner}`} />
                          <div className={`pointer-events-none absolute right-2 top-2 h-5 w-5 border-r border-t ${palette.corner}`} />
                          <div className={`pointer-events-none absolute bottom-2 left-2 h-5 w-5 border-b border-l ${palette.corner}`} />
                          <div className={`pointer-events-none absolute bottom-2 right-2 h-5 w-5 border-b border-r ${palette.corner}`} />

                          <div className="pointer-events-none absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-2">
                            <span className={`h-px w-8 ${palette.line}`} />
                            <span className={`text-[9px] ${palette.accent}`}>✦</span>
                            <span className={`h-px w-8 ${palette.line}`} />
                          </div>
                          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2">
                            <span className={`text-[9px] ${palette.accent}`}>✧</span>
                          </div>

                          <div className="relative flex h-full flex-1 flex-col px-3 pb-4 pt-5 sm:px-4">
                            <div className="mb-4 flex items-center justify-between gap-2">
                              <span className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[.2em] ${palette.badge}`}>{label}</span>
                              <span className={`text-[8px] font-black tracking-[.13em] ${palette.accent}`}>{bonus}</span>
                            </div>

                            <div className="relative mx-auto mb-4">
                              <div className={`absolute -inset-3 rounded-full blur-xl ${palette.glow}`} />
                              <div className={`relative grid h-[76px] w-[76px] place-items-center rounded-full border ${palette.inner} bg-black/20`}>
                                <div className={`absolute inset-1 rounded-full border ${palette.corner}`} />
                                <div className={`absolute inset-0 rounded-full ${isEpic ? "bg-[radial-gradient(circle,rgba(251,191,36,0.22),transparent_70%)]" : isRare ? "bg-[radial-gradient(circle,rgba(34,211,238,0.2),transparent_70%)]" : "bg-[radial-gradient(circle,rgba(217,180,130,0.12),transparent_70%)]"}`} />
                                <Icon className={`relative h-9 w-9 ${palette.title} drop-shadow-[0_0_10px_currentColor]`} />
                              </div>
                              <span className={`absolute -left-4 top-1/2 -translate-y-1/2 text-xs ${palette.accent}`}>◇</span>
                              <span className={`absolute -right-4 top-1/2 -translate-y-1/2 text-xs ${palette.accent}`}>◇</span>
                            </div>

                            <div className="text-center">
                              <p className={`text-[9px] font-black uppercase tracking-[.24em] ${palette.accent}`}>
                                {isEpic ? "Bênção transcendente" : isRare ? "Essência desperta" : "Fragmento ancestral"}
                              </p>
                              <h4 className={`mt-2 font-display text-lg font-bold leading-tight sm:text-xl ${palette.title}`}>{upgrade.name}</h4>
                            </div>

                            <div className="my-3 flex items-center gap-2">
                              <span className={`h-px flex-1 ${palette.line}`} />
                              <span className={`text-[9px] ${palette.accent}`}>✧</span>
                              <span className={`h-px flex-1 ${palette.line}`} />
                            </div>

                            <p className="flex-1 text-center text-[11px] leading-relaxed text-white/65 sm:text-xs">
                              {getUpgradeDescription(upgrade)}
                            </p>

                            <div className={`mt-4 flex items-center justify-center gap-2 rounded-lg border bg-black/20 px-3 py-2.5 text-[9px] font-black uppercase tracking-[.2em] transition-all duration-300 group-hover:bg-white/[0.07] ${palette.footer}`}>
                              <span>{isEpic ? "Reivindicar" : "Selar destino"}</span>
                              <span className="text-sm transition-transform duration-300 group-hover:translate-x-1">↗</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-center gap-2 pb-1 text-[8px] font-bold uppercase tracking-[.22em] text-white/25">
                    <span>✧</span><span>O destino não oferece uma segunda escolha</span><span>✧</span>
                  </div>
                </div>

                <style>{`
                  @keyframes fractalRarePulse {
                    0%, 100% { box-shadow: 0 0 12px rgba(34,211,238,0.08); }
                    50% { box-shadow: 0 0 24px rgba(34,211,238,0.2); }
                  }
                  @keyframes fractalEpicPulse {
                    0%, 100% { box-shadow: 0 0 14px rgba(217,70,239,0.10); }
                    50% { box-shadow: 0 0 26px rgba(251,191,36,0.18), 0 0 35px rgba(217,70,239,0.12); }
                  }
                  .fractals-card-rare { animation: fractalRarePulse 3s ease-in-out infinite; }
                  .fractals-card-epic { animation: fractalEpicPulse 3.5s ease-in-out infinite; }
                  @media (prefers-reduced-motion: reduce) {
                    .fractals-card-rare, .fractals-card-epic { animation: none; }
                  }
                `}</style>
              </div>
            )}
            {result && <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(91,46,133,0.28),rgba(5,4,10,0.95)_72%)] p-4 backdrop-blur-md"><div className="w-full max-w-sm rounded-[1.6rem] border border-violet-200/20 bg-[#171320]/95 p-5 text-center shadow-[0_30px_100px_rgba(0,0,0,0.7)]"><div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl border border-amber-200/20 bg-gradient-to-br from-amber-200/15 via-violet-400/15 to-violet-950/70 shadow-[0_0_36px_rgba(167,139,250,0.18)]">{result==="victory"?<Sparkles className="h-7 w-7 text-amber-200"/>:<Skull className="h-7 w-7 text-rose-300"/>}</div><p className="text-xs uppercase tracking-[.22em] text-violet-200">{result==="victory"?"Guardião derrotado":"Expedição encerrada"}</p><h3 className="mt-1 font-display text-2xl">{result==="victory"?"O fractal silenciou":"O Vazio prevaleceu"}</h3><p className="mt-2 text-sm text-white/65">Nível {hud.level} · {hud.kills} criaturas derrotadas · {formatTime(hud.elapsed)}</p><p className="mt-2 text-xs text-amber-100/80">Recompensas e fractais ainda não são creditados neste protótipo; serão conectados após a validação segura no servidor.</p><Button className="mt-4 gap-2" onClick={()=>{setRunning(false);setResult(null);setBossMessage(false);gameRef.current=null;}}><RotateCcw className="h-4 w-4"/> Voltar à expedição</Button></div></div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-[10px] text-white/45 sm:px-4"><span>Arma automática: projétil perseguidor</span><span>Protótipo sem persistência de recompensas</span></div>
        </Card>
      )}
      <div className="flex items-start gap-2 rounded-xl border border-amber-300/15 bg-gradient-to-r from-amber-500/[0.07] to-transparent p-3 text-xs text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"/><p>Último Silêncio apresenta Ecos errantes, Enlutados resistentes, Vigias de elite com aura de drenagem e o Pranteador Sem Rosto, que marca uma área antes de liberar uma onda de lamento e convoca ecos quando perde metade da vida. A loja e a progressão de corrupção já usam o estado persistente da conta; a concessão de recompensas de fim de expedição continua bloqueada até haver validação autoritativa no servidor.</p></div>
    </div>
  );
}
