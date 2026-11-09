import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { AlertTriangle, Heart, Move, Pause, Play, RotateCcw, Shield, Skull, Sparkles, Swords, Zap, Maximize, UserRound, Gauge, ArrowLeft, ShoppingBag, Crown, Gem as GemIcon } from "lucide-react";
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
  enemies: Enemy[]; shots: Shot[]; gems: Gem[]; specialDrops: SpecialDrop[]; particles: Particle[]; damageNumbers: DamageNumber[]; kills: number; ended: boolean;
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

function getEnemySeparation(enemy: Enemy, enemies: Enemy[]) {
  let sx = 0, sy = 0;
  for (const other of enemies) {
    if (other === enemy) continue;
    const dx = enemy.x - other.x, dy = enemy.y - other.y;
    const d = Math.max(0.001, Math.hypot(dx, dy));
    const range = enemy.radius + other.radius + 12;
    if (d < range) {
      const weight = (range - d) / range;
      sx += (dx / d) * weight; sy += (dy / d) * weight;
    }
  }
  const magnitude = Math.hypot(sx, sy);
  return magnitude > 0 ? { x: sx / magnitude, y: sy / magnitude } : { x: 0, y: 0 };
}

function makeGame(width: number, height: number, purchases: PurchaseState): GameState {
  const maxHp = 100 + purchases.health * 10;
  const projectileLife = PROJECTILE_BASE_LIFE * PROJECTILE_DURATION_MULTIPLIERS[clamp(purchases.projectile_duration, 0, 3)];
  return {
    width, height, last: 0, elapsed: 0, spawnTimer: 0.4, shotTimer: 0.25, bossSpawned: false,
    player: { x: width / 2, y: height / 2, hp: maxHp, maxHp, speed: 205, damage: 22, fireRate: 0.72, invuln: 0, hitFlash: 0, xp: 0, nextXp: 12, level: 1, pickupRadius: 85, xpMultiplier: 1, specialAreaStacks: 0, specialExperienceStacks: 0, projectileRangeStacks: 0, projectileRangeMultiplier: 1, projectileStacks: 0, projectileLife, facing: 0, castFacing: 0, castTimer: 0, moving: false, spriteAction: "idle", spriteDirection: 0, previousSpriteAction: "idle", previousSpriteDirection: 0, spriteBlend: 1 },
    enemies: [], shots: [], gems: [], specialDrops: [], particles: [], damageNumbers: [], kills: 0, ended: false,
  };
}

function spawnEnemy(game: GameState, missionId: number, elapsed: number, corruption: number, boss = false) {
  const side = Math.floor(Math.random() * 4);
  const margin = 30;
  const x = side === 0 ? -margin : side === 1 ? game.width + margin : Math.random() * game.width;
  const y = side === 2 ? -margin : side === 3 ? game.height + margin : Math.random() * game.height;
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

function drawGame(ctx: CanvasRenderingContext2D, game: GameState, corruption: number, missionId: number, sprites: SpriteMap = {}, showPlayerHp = true, showDamageNumbers = true) {
  const { width, height, player } = game;
  ctx.clearRect(0, 0, width, height);
  // Ruínas de Último Silêncio: piso de lajes, rachaduras, pilares e cristais.
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#171522"); bg.addColorStop(0.52, "#242032"); bg.addColorStop(1, "#100f1a");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  const tile = 48;
  const hash = (x: number, y: number) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  for (let row = -1; row < Math.ceil(height / tile) + 1; row++) {
    for (let col = -1; col < Math.ceil(width / tile) + 1; col++) {
      const x = col * tile + (row % 2) * tile / 2;
      const y = row * tile;
      const shade = Math.floor(hash(col, row) * 13);
      ctx.fillStyle = `rgb(${35 + shade},${32 + shade},${48 + shade})`;
      ctx.strokeStyle = "rgba(9,8,16,.62)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y - tile / 2); ctx.lineTo(x + tile / 2, y); ctx.lineTo(x, y + tile / 2); ctx.lineTo(x - tile / 2, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (hash(col + 17, row - 9) > 0.79) {
        ctx.strokeStyle = "rgba(8,7,15,.72)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - 7, y - 4); ctx.lineTo(x + 2, y + 1); ctx.lineTo(x + 8, y + 11); ctx.stroke();
      }
      if (hash(col - 5, row + 21) > 0.965) {
        ctx.fillStyle = "rgba(129,79,176,.12)"; ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  const drawPillar = (x: number, y: number, scale = 1) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.ellipse(2, 13, 19, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#171522"; ctx.strokeStyle = "#554365"; ctx.lineWidth = 2;
    ctx.fillRect(-12, -26, 24, 38); ctx.strokeRect(-12, -26, 24, 38);
    ctx.fillStyle = "#383047"; ctx.fillRect(-16, -31, 32, 7); ctx.fillRect(-15, 10, 30, 6);
    ctx.fillStyle = "rgba(181,105,255,.22)"; ctx.fillRect(-3, -22, 6, 28);
    ctx.restore();
  };
  const drawCrystal = (x: number, y: number, size: number, color: string) => {
    ctx.save(); ctx.translate(x, y); ctx.shadowColor = color; ctx.shadowBlur = 18;
    ctx.fillStyle = color; ctx.strokeStyle = "rgba(245,225,255,.8)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * .48, -size * .25); ctx.lineTo(size * .32, size * .72); ctx.lineTo(-size * .3, size * .72); ctx.lineTo(-size * .48, -size * .25); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(0, size * .65); ctx.lineTo(-size * .3, size * .72); ctx.closePath(); ctx.fill(); ctx.restore();
  };
  drawPillar(28, 45, .85); drawPillar(width - 32, 52, .9); drawPillar(38, height - 42, 1.1); drawPillar(width - 42, height - 38, 1.05);
  drawPillar(width * .18, height * .16, .65); drawPillar(width * .82, height * .18, .7);
  drawCrystal(width * .12, height * .28, 16, "#a75bff"); drawCrystal(width * .88, height * .72, 19, "#a75bff");
  drawCrystal(width * .76, height * .12, 12, "#6b9cff");
  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .22, width / 2, height / 2, Math.max(width, height) * .72);
  vignette.addColorStop(0, "rgba(8,5,18,0)"); vignette.addColorStop(1, "rgba(5,3,12,.62)");
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);

  game.gems.forEach((gem) => {
    ctx.save(); ctx.translate(gem.x, gem.y);
    const pulse = 1 + Math.sin(game.elapsed * 6 + gem.x * 0.03) * 0.08;
    ctx.scale(pulse, pulse);
    const icon = sprites.xpGem;
    if (icon?.complete && icon.naturalWidth > 0) {
      ctx.shadowColor = "#a78bfa"; ctx.shadowBlur = 13;
      ctx.drawImage(icon, -gem.radius * 0.95, -gem.radius * 0.95, gem.radius * 1.9, gem.radius * 1.9);
    } else {
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#9ee6c1"; ctx.shadowColor = "#7df0b0"; ctx.shadowBlur = 12;
      ctx.fillRect(-gem.radius / 2, -gem.radius / 2, gem.radius, gem.radius);
    }
    ctx.restore();
  });
  game.specialDrops.forEach((drop) => {
    ctx.save(); ctx.translate(drop.x, drop.y);
    const pulse = 1 + Math.sin(game.elapsed * 7 + drop.y * 0.02) * 0.09;
    const size = drop.radius * 2.8 * pulse;
    const icon = drop.kind === "area" ? sprites.specialArea : drop.kind === "experience" ? sprites.specialXP : drop.kind === "projectile_range" ? sprites.specialRange : sprites.specialProjectiles;
    ctx.globalAlpha = 0.9 + Math.sin(game.elapsed * 5 + drop.x * 0.02) * 0.1;
    ctx.shadowColor = drop.kind === "area" ? "#e9c46a" : "#b78cff";
    ctx.shadowBlur = 17;
    if (icon?.complete && icon.naturalWidth > 0) {
      ctx.drawImage(icon, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = drop.kind === "area" ? "#67d9e8" : "#b58cff";
      ctx.beginPath(); ctx.arc(0, 0, drop.radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });
  game.shots.forEach((shot) => {
    ctx.save(); ctx.translate(shot.x, shot.y); ctx.rotate(Math.atan2(shot.vy, shot.vx));
    const fade = clamp(shot.life / Math.max(0.01, game.player.projectileLife), 0.25, 1);
    ctx.globalAlpha = fade;
    const projectile = sprites.projectile;
    if (projectile?.complete && projectile.naturalWidth > 0) {
      ctx.shadowColor = "#b77aff"; ctx.shadowBlur = 15;
      ctx.drawImage(projectile, -15, -9, 30, 18);
    } else {
      ctx.shadowColor = "#b77aff"; ctx.shadowBlur = 15; ctx.fillStyle = "#c39aff";
      ctx.beginPath(); ctx.moveTo(9,0); ctx.lineTo(0,-4); ctx.lineTo(-10,0); ctx.lineTo(0,4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff1ce"; ctx.beginPath(); ctx.moveTo(5,0); ctx.lineTo(0,-1.5); ctx.lineTo(-5,0); ctx.lineTo(0,1.5); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  });
  game.enemies.forEach((enemy) => {
    ctx.save();
    const breathRate = enemy.type === "boss" ? 2.2 : enemy.type === "brute" ? 2.8 : enemy.type === "charger" ? 4.1 : enemy.type === "elite" ? 3.2 : 3.7;
    const breath = Math.sin(game.elapsed * breathRate + enemy.x * 0.021 + enemy.y * 0.017);
    const breathAmount = enemy.type === "boss" ? 0.045 : enemy.type === "brute" ? 0.035 : 0.025;
    const hover = enemy.type === "wraith" || enemy.type === "elite" ? Math.sin(game.elapsed * 3.1 + enemy.y * 0.02) * 2.0 : Math.abs(breath) * 0.7;
    ctx.translate(enemy.x, enemy.y + hover);
    ctx.scale(1 + breath * breathAmount, 1 - breath * breathAmount * 0.72);
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
      ctx.shadowBlur = enemy.type === "boss" ? 24 : 14;
      ctx.drawImage(enemySprite, -spriteWidth / 2, -spriteHeight * anchor, spriteWidth, spriteHeight);
      ctx.restore();
    } else if (enemy.type === "wraith") {
      ctx.shadowColor = enemy.color; ctx.shadowBlur = 13; ctx.fillStyle = hurt ? "#fff" : "#827394";
      ctx.beginPath(); ctx.moveTo(-enemy.radius, 3); ctx.quadraticCurveTo(-enemy.radius * 1.2, -enemy.radius, 0, -enemy.radius * 1.1); ctx.quadraticCurveTo(enemy.radius * 1.2, -enemy.radius, enemy.radius, 3); ctx.lineTo(enemy.radius * .55, enemy.radius * .45); ctx.lineTo(0, enemy.radius * .12); ctx.lineTo(-enemy.radius * .55, enemy.radius * .45); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#d9b8ff"; ctx.fillRect(-4, -3, 3, 4); ctx.fillRect(2, -3, 3, 4);
    } else if (enemy.type === "charger") {
      ctx.rotate(Math.atan2(enemy.targetY - enemy.y, enemy.targetX - enemy.x));
      ctx.shadowColor = "#f0a75d"; ctx.shadowBlur = 12; ctx.fillStyle = hurt ? "#fff" : "#b46f42";
      ctx.beginPath(); ctx.moveTo(enemy.radius * 1.35, 0); ctx.lineTo(-enemy.radius * .8, -enemy.radius * .85); ctx.lineTo(-enemy.radius * .4, 0); ctx.lineTo(-enemy.radius * .8, enemy.radius * .85); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffe0a1"; ctx.fillRect(enemy.radius * .25, -2, 4, 4);
    } else if (enemy.type === "brute") {
      ctx.shadowColor = "#a8a6b7"; ctx.shadowBlur = 10; ctx.fillStyle = hurt ? "#fff" : "#57586b";
      ctx.beginPath(); ctx.moveTo(-enemy.radius, -enemy.radius * .55); ctx.lineTo(-enemy.radius * .55, -enemy.radius); ctx.lineTo(enemy.radius * .65, -enemy.radius * .9); ctx.lineTo(enemy.radius, -enemy.radius * .2); ctx.lineTo(enemy.radius * .8, enemy.radius); ctx.lineTo(-enemy.radius * .8, enemy.radius); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#b4a8c9"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#e0a5ff"; ctx.fillRect(-4, -4, 8, 6);
    } else if (enemy.type === "elite") {
      ctx.rotate(game.elapsed * .35); ctx.shadowColor = "#d69cff"; ctx.shadowBlur = 20; ctx.fillStyle = hurt ? "#fff" : "#6f4c8c";
      ctx.beginPath(); for (let i=0;i<8;i++){const a=i*Math.PI/4;const rr=i%2===0?enemy.radius*1.2:enemy.radius*.72;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);} ctx.closePath();ctx.fill();
      ctx.strokeStyle="#e5c5ff";ctx.lineWidth=2;ctx.stroke();ctx.fillStyle="#fff0ff";ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();
    } else {
      ctx.shadowColor = "#b78bff"; ctx.shadowBlur = 28; ctx.fillStyle = hurt ? "#fff" : "#33233f";
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
  game.particles.forEach((p) => {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 9;
    ctx.beginPath(); ctx.arc(p.x, p.y, 1.5 + clamp(p.life * 2, 0, 1) * 1.4, 0, Math.PI * 2); ctx.fill();
  });
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
      ctx.shadowBlur = 12;
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
  const energyAura = ctx.createRadialGradient(0, 2, 3, 0, 2, (31 + hitIntensity * 12) * auraPulse);
  energyAura.addColorStop(0, hitIntensity > 0.02 ? `rgba(255,42,66,${0.38 + hitIntensity * 0.34})` : "rgba(190,139,255,.34)");
  energyAura.addColorStop(0.42, hitIntensity > 0.02 ? `rgba(220,24,58,${0.22 + hitIntensity * 0.26})` : "rgba(128,82,221,.18)");
  energyAura.addColorStop(1, hitIntensity > 0.02 ? "rgba(255,24,62,0)" : "rgba(83,146,255,0)");
  ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = energyAura;
  ctx.shadowColor = hitIntensity > 0.02 ? "#ff183d" : "#a75cff";
  ctx.shadowBlur = hitIntensity > 0.02 ? 24 + hitIntensity * 25 : 0;
  ctx.beginPath(); ctx.ellipse(0, 2, (28 + hitIntensity * 8) * auraPulse, (34 + hitIntensity * 8) * auraPulse, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
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
    ctx.shadowBlur = hitIntensity > 0.02 ? 28 + hitIntensity * 24 : player.invuln > 0 ? 16 : player.spriteAction === "cast" ? 18 : 10;
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
      ctx.shadowColor = "#c28aff"; ctx.shadowBlur = 18; ctx.fillStyle = "#f0dcff";
      ctx.beginPath(); ctx.arc(0, 0, 3.2 + Math.sin(game.elapsed * 46) * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(216,175,255,.9)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  } else {
    // Fallback vetorial enquanto as imagens carregam ou em caso de falha de rede.
    ctx.shadowColor = hitIntensity > 0.02 ? "#ff2448" : player.invuln > 0 ? "#ff7182" : "#a75cff"; ctx.shadowBlur = hitIntensity > 0.02 ? 30 + hitIntensity * 20 : player.invuln > 0 ? 20 : 17;
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
    const hpGradient = ctx.createLinearGradient(-barW / 2, 0, barW / 2, 0);
    hpGradient.addColorStop(0, "#f08a9c"); hpGradient.addColorStop(1, "#ff526f");
    ctx.fillStyle = hpGradient; ctx.fillRect(-barW / 2, barY, barW * ratio, 4);
    ctx.strokeStyle = "rgba(255,225,232,.68)"; ctx.lineWidth = 0.7; ctx.strokeRect(-barW / 2, barY, barW, 4);
  }
  ctx.restore();

  if (corruption > 0) {
    ctx.fillStyle = `rgba(139, 76, 190, ${0.025 + corruption * 0.012})`;
    ctx.fillRect(0, 0, width, height);
  }
}

export function FractalArena({ isMaster = false }: { isMaster?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const keysRef = useRef(new Set<string>());
  const joystickRef = useRef<{ x: number; y: number } | null>(null);
  const [missionId, setMissionId] = useState(1);
  const [corruption, setCorruption] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [levelChoices, setLevelChoices] = useState<Upgrade[]>([]);
  const [hud, setHud] = useState({ hp: 100, maxHp: 100, xp: 0, nextXp: 12, level: 1, kills: 0, elapsed: 0, phase: "Exploração", pressure: 0 });
  const [result, setResult] = useState<"victory" | "defeat" | null>(null);
  const [bossMessage, setBossMessage] = useState(false);
  const [pausePanel, setPausePanel] = useState<"main" | "attributes">("main");
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2 | 3>(1);
  const [fractalBalance, setFractalBalance] = useState(0);
  const [unlockedCorruption, setUnlockedCorruption] = useState(0);
  const [completedCorruptions, setCompletedCorruptions] = useState<number[]>([]);
  const [purchases, setPurchases] = useState<PurchaseState>(DEFAULT_PURCHASES);
  const [showPlayerHp, setShowPlayerHp] = useState(true);
  const [showDamageNumbers, setShowDamageNumbers] = useState(true);
  const [shopSection, setShopSection] = useState<"permanent" | "relics">("permanent");
  const [runId, setRunId] = useState<string | null>(null);
  const [shopBusy, setShopBusy] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);
  const spritesRef = useRef<SpriteMap>({});
  useEffect(() => {
    let cancelled = false;
    const assets: Record<SpriteKey, string> = {
      playerIdle: "/fractals/sprites/player-idle-8dir.png",
      playerMove: "/fractals/sprites/player-move-8dir.png",
      playerCast: "/fractals/sprites/player-cast-8dir.png",
      boss: "/fractals/sprites/boss.webp",
      elite: "/fractals/sprites/elite.webp",
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
    if (error) { setShopError("Aplique a migração SQL 0005 para ativar loja e progressão."); return; }
    setFractalBalance(Number(data?.fractals ?? 0));
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
      setPurchases(parsePurchaseState(data?.purchasedUpgrades));
      toast.success("Melhoria comprada permanentemente.");
    } catch (error: any) { toast.error(error?.message ?? "Não foi possível comprar."); }
    finally { setShopBusy(false); }
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
    setHud({ hp: game.player.hp, maxHp: game.player.maxHp, xp: 0, nextXp: 12, level: 1, kills: 0, elapsed: 0, phase: "Exploração", pressure: 0 });
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
    setLevelChoices([]);
  }, []);

  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;
    let lastHud = 0;
    let bossNotified = false;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const game = gameRef.current;
      if (game) { game.width = rect.width; game.height = rect.height; game.player.x = clamp(game.player.x, 20, rect.width - 20); game.player.y = clamp(game.player.y, 20, rect.height - 20); }
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
        game.player.castTimer = Math.max(0, game.player.castTimer - dt);
        const keys = keysRef.current;
        let dx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
        let dy = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
        if (joystickRef.current) { dx = joystickRef.current.x; dy = joystickRef.current.y; }
        game.player.moving = Math.hypot(dx, dy) > 0.05;
        if (game.player.moving) game.player.facing = directionFromVector(dx, dy);
        const mag = Math.hypot(dx, dy) || 1;
        game.player.x = clamp(game.player.x + (dx / mag) * game.player.speed * dt, 18, game.width - 18);
        game.player.y = clamp(game.player.y + (dy / mag) * game.player.speed * dt, 18, game.height - 18);

        const snapshot = getDifficultySnapshot(missionId, game.elapsed, corruption);
        const spawnInterval = clamp(1.18 / snapshot.enemySpawnScale, 0.28, 1.35);
        game.spawnTimer -= dt;
        if (game.spawnTimer <= 0 && game.enemies.length < 64 && game.elapsed < RUN_DURATION_SECONDS) {
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
        game.shots = game.shots.filter((shot) => shot.life > 0 && shot.x > -20 && shot.x < game.width + 20 && shot.y > -20 && shot.y < game.height + 20);
        for (const enemy of game.enemies) {
          const d = Math.max(1, distance(game.player.x, game.player.y, enemy.x, enemy.y));
          enemy.flash = Math.max(0, enemy.flash - dt);
          enemy.attack = Math.max(0, enemy.attack - dt);
          if (enemy.type === "boss") {
            if (enemy.windup > 0) {
              enemy.windup -= dt;
              if (enemy.windup <= 0 && distance(game.player.x, game.player.y, enemy.targetX, enemy.targetY) < 101 && game.player.invuln <= 0) {
                game.player.hp = Math.max(0, game.player.hp - 28); game.player.invuln = 0.85; game.player.hitFlash = 0.3;
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
            const separation = getEnemySeparation(enemy, game.enemies);
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
              if (dashDistance < enemy.radius + 20 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - enemy.damage); game.player.invuln = .65; game.player.hitFlash = 0.3; enemy.dashTime = 0; }
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
              const separation = getEnemySeparation(enemy, game.enemies);
              const steerX = (game.player.x - enemy.x) / d + separation.x * 0.22;
              const steerY = (game.player.y - enemy.y) / d + separation.y * 0.22;
              const steerLength = Math.max(1, Math.hypot(steerX, steerY));
              enemy.x += (steerX / steerLength) * enemy.speed * dt;
              enemy.y += (steerY / steerLength) * enemy.speed * dt;
              if (d < enemy.radius + 15 && enemy.attack <= 0 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - enemy.damage); game.player.invuln = .65; game.player.hitFlash = 0.3; enemy.attack = 1.1; }
            }
          } else if (enemy.type === "brute") {
            if (enemy.windup > 0) {
              enemy.windup = Math.max(0, enemy.windup - dt);
              if (enemy.windup === 0) {
                if (distance(game.player.x, game.player.y, enemy.x, enemy.y) < 78 + 12 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - enemy.damage * 1.35); game.player.invuln = .8; game.player.hitFlash = 0.3; }
                for (let i=0;i<10;i++) { const a=i*Math.PI/5; game.particles.push({x:enemy.x,y:enemy.y,vx:Math.cos(a)*105,vy:Math.sin(a)*105,life:.35,color:"#e7a56d"}); }
                enemy.attack = 2.7;
              }
            } else {
              if (d < 112 && enemy.attack <= 0) enemy.windup = .72;
              else {
                const separation = getEnemySeparation(enemy, game.enemies);
                const approach = d < 88 ? 0.32 : 1;
                const steerX = (game.player.x - enemy.x) / d * approach + separation.x * 0.26;
                const steerY = (game.player.y - enemy.y) / d * approach + separation.y * 0.26;
                const steerLength = Math.max(1, Math.hypot(steerX, steerY));
                enemy.x += (steerX / steerLength) * enemy.speed * dt;
                enemy.y += (steerY / steerLength) * enemy.speed * dt;
              }
              if (d < enemy.radius + 15 && enemy.attack <= 0 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - enemy.damage); game.player.invuln = .72; game.player.hitFlash = 0.3; enemy.attack = 1.2; }
            }
          } else {
            const separation = getEnemySeparation(enemy, game.enemies);
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
              if (d < 105 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - 7); game.player.invuln = 0.35; game.player.hitFlash = 0.3; }
              enemy.attack = 1.7;
            }
            if (enemy.type === "wraith" && d < enemy.radius + 15 && enemy.attack <= 0 && game.player.invuln <= 0) {
              game.player.hp = Math.max(0, game.player.hp - enemy.damage); game.player.invuln = 0.72; game.player.hitFlash = 0.3; enemy.attack = 0.8;
            }
          }
        }
        for (const shot of game.shots) {
          for (const enemy of game.enemies) {
            if (enemy.hp > 0 && distance(shot.x, shot.y, enemy.x, enemy.y) < enemy.radius + 5) {
              enemy.hp -= shot.damage; enemy.flash = 0.09; shot.life = 0;
              game.damageNumbers.push({ x: enemy.x + (Math.random() - 0.5) * 10, y: enemy.y - enemy.radius - 8, value: shot.damage, life: 0.82, maxLife: 0.82, drift: (Math.random() - 0.5) * 14 });
              if (game.damageNumbers.length > 36) game.damageNumbers.shift();
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
                } else { game.ended = true; setResult("victory"); if (runId) void (supabase.rpc as any)("finish_fractal_run", { _run_id: runId, _victory: true }).then(({ data, error }: any) => { if (error) toast.error(error.message); else { setFractalBalance(Number(data?.fractals ?? 0)); setUnlockedCorruption(Number(data?.corruptionUnlocked ?? 0)); setCompletedCorruptions(Array.isArray(data?.completedCorruptions) ? data.completedCorruptions : []); toast.success("Corrupção concluída. O próximo nível foi liberado."); } }); }
                for (let i = 0; i < 5; i++) game.particles.push({ x: enemy.x, y: enemy.y, vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100, life: 0.45, color: enemy.color });
              }
              break;
            }
          }
        }
        game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);
        game.gems.forEach((gem) => {
          const d = distance(game.player.x, game.player.y, gem.x, gem.y);
          if (d < game.player.pickupRadius) { gem.x += ((game.player.x - gem.x) / Math.max(1, d)) * 260 * dt; gem.y += ((game.player.y - gem.y) / Math.max(1, d)) * 260 * dt; }
          if (d < 17) {
            game.player.xp += gem.value * game.player.xpMultiplier; gem.value = 0;
          }
        });
        game.gems = game.gems.filter((gem) => gem.value > 0);
        game.specialDrops.forEach((drop) => {
          const d = distance(game.player.x, game.player.y, drop.x, drop.y);
          if (d < game.player.pickupRadius) { drop.x += ((game.player.x - drop.x) / Math.max(1, d)) * 280 * dt; drop.y += ((game.player.y - drop.y) / Math.max(1, d)) * 280 * dt; }
          if (d < 18) {
            if (drop.kind === "area" && game.player.specialAreaStacks < 5) { game.player.specialAreaStacks += 1; game.player.pickupRadius = 85 * (1 + game.player.specialAreaStacks * 0.10); }
            if (drop.kind === "experience" && game.player.specialExperienceStacks < 6) { game.player.specialExperienceStacks += 1; game.player.xpMultiplier = 1 + game.player.specialExperienceStacks * 0.05; }
            if (drop.kind === "projectile_range" && game.player.projectileRangeStacks < 5) { game.player.projectileRangeStacks += 1; game.player.projectileRangeMultiplier = 1 + game.player.projectileRangeStacks * 0.10; }
            if (drop.kind === "projectiles" && game.player.projectileStacks < MAX_EXTRA_PROJECTILES) game.player.projectileStacks += 1;
            drop.radius = 0;
          }
        });
        game.specialDrops = game.specialDrops.filter((drop) => drop.radius > 0);
        game.particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
        game.particles = game.particles.filter((p) => p.life > 0);
        if (game.player.xp >= game.player.nextXp && !game.ended) {
          game.player.xp -= game.player.nextXp; game.player.level += 1; game.player.nextXp = Math.floor(game.player.nextXp * 1.32 + 5);
          
          setLevelChoices(buildLevelChoices(game, purchases.area, purchases.experience, purchases.projectile_range, purchases.projectiles, purchases.rarity));
        }
        if (game.player.hp <= 0 && !game.ended) { game.ended = true; setResult("defeat"); if (runId) void (supabase.rpc as any)("finish_fractal_run", { _run_id: runId, _victory: false }).then(({ error }: any) => { if (error) toast.error(error.message); }); }
        if (game.elapsed >= RUN_DURATION_SECONDS && !game.ended && !game.bossSpawned) { spawnEnemy(game, missionId, game.elapsed, corruption, true); game.bossSpawned = true; }
        if (now - lastHud > 100) {
          lastHud = now;
          setHud({ hp: game.player.hp, maxHp: game.player.maxHp, xp: game.player.xp, nextXp: game.player.nextXp, level: game.player.level, kills: game.kills, elapsed: game.elapsed, phase: snapshot.phaseLabel, pressure: snapshot.totalPressure });
        }
      }
      drawGame(ctx, game, corruption, missionId, spritesRef.current, showPlayerHp, showDamageNumbers);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [running, paused, levelChoices.length, missionId, corruption, speedMultiplier, runId, purchases, showPlayerHp, showDamageNumbers]);

  const pointerStart = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    joystickRef.current = { x: clamp((event.clientX - rect.left - (gameRef.current?.player.x ?? rect.width / 2)) / 55, -1, 1), y: clamp((event.clientY - rect.top - (gameRef.current?.player.y ?? rect.height / 2)) / 55, -1, 1) };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!joystickRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    joystickRef.current = { x: clamp((event.clientX - rect.left - (gameRef.current?.player.x ?? rect.width / 2)) / 55, -1, 1), y: clamp((event.clientY - rect.top - (gameRef.current?.player.y ?? rect.height / 2)) / 55, -1, 1) };
  };
  const pointerEnd = () => { joystickRef.current = null; };
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
  const mission = FRACTAL_MISSIONS.find((item) => item.id === missionId)!;
  const toggleFullscreen = async () => {
    const target = canvasRef.current?.closest("[data-fractal-arena]") as HTMLElement | null;
    try { if (!document.fullscreenElement) await target?.requestFullscreen(); else await document.exitFullscreen(); } catch { /* Fullscreen may be unavailable in embedded browsers. */ }
  };

  return (
    <div className="fractals-hub" data-fractal-arena>
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
                <div className="fractals-mission-heading"><div><h3>{mission.name}</h3><p>{mission.pathName}</p></div><div className="fractals-mission-reward"><GemIcon/><b>{mission.maxFractals}</b><small>FRACTAIS</small></div></div><p className="fractals-mission-lore">{mission.identity}</p><div className="fractals-mission-lock"><Shield/><span>Outras regiões serão reveladas conforme a jornada avança.</span></div>
              </section>
              <section className="fractals-panel fractals-corruption-panel"><div className="fractals-panel__label"><span>02 / RISCO DA FENDA</span><b>CORRUPÇÃO</b></div>
                <div className="fractals-corruption-grid">
                  {CORRUPTION_LEVELS.map((level) => {
                    const locked = level.level > unlockedCorruption;
                    return <button key={level.level} type="button" disabled={locked} onClick={() => setCorruption(level.level)} className={`fractals-corruption-option ${corruption === level.level ? "is-selected" : ""} ${locked ? "is-locked" : ""}`}>
                      <span className="fractals-corruption-option__index">NÍVEL {String(level.level).padStart(2,"0")}</span><strong>{level.name}</strong><span className="fractals-corruption-option__state">{locked ? "BLOQUEADO" : completedCorruptions.includes(level.level) ? "CONCLUÍDO" : corruption === level.level ? "SELECIONADO" : "DISPONÍVEL"}</span>
                    </button>;
                  })}
                </div>
                <p className="fractals-corruption-description">{CORRUPTION_LEVELS[corruption].description}</p><p className="fractals-corruption-hint">{unlockedCorruption < 5 ? "Vença a expedição para romper o próximo selo." : "Todos os selos foram rompidos."}</p>
              </section>
            </div>

            <section className="fractals-vault">
              <div className="fractals-vault__header"><div className="fractals-vault__brand"><div className="fractals-vault__icon"><ShoppingBag/><span/></div><div><p className="fractals-vault__eyebrow">CÂMARA DE PROGRESSÃO</p><h3>ARSENAL <span>DE FRACTAIS</span></h3><p>Forje atributos, desperte relíquias e prepare sua próxima incursão.</p></div></div><div className="fractals-wallet"><small>SEU COFRE</small><strong>{fractalBalance.toLocaleString("pt-BR")} <i>FR</i></strong><Button size="sm" variant="outline" className="fractals-vault__toggle" onClick={() => setShopOpen((v) => !v)}>{shopOpen ? "FECHAR" : "ABRIR ARSENAL"} <span>{shopOpen ? "−" : "+"}</span></Button></div></div>
              {shopError && <p className="mt-2 text-xs text-amber-300">{shopError}</p>}
              {shopOpen && <div className="fractals-vault__content"><div className="fractals-shop-tabs" role="tablist" aria-label="Categorias da loja"><button type="button" role="tab" aria-selected={shopSection === "permanent"} className={shopSection === "permanent" ? "is-active" : ""} onClick={() => setShopSection("permanent")}><Crown/> FORJA PERMANENTE <small>05</small></button><button type="button" role="tab" aria-selected={shopSection === "relics"} className={shopSection === "relics" ? "is-active" : ""} onClick={() => setShopSection("relics")}><Sparkles/> RELÍQUIAS DE CAMPO <small>04</small></button></div>
                {shopSection === "permanent" && <section className="fractals-shop-section"><div className="fractals-shop-section__heading"><span>01</span><div><h4>Aprimoramentos permanentes</h4><p>Vantagens inscritas na essência do personagem.</p></div></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="group relative overflow-hidden rounded-xl border border-rose-200/20 bg-gradient-to-br from-rose-400/[0.12] to-[#1b1422] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:-translate-y-0.5 hover:border-rose-200/40"><p className="text-xs font-semibold">Vida reforçada</p><p className="text-[10px] text-muted-foreground">Nível {purchases.health}/5 · +10 HP máximo por nível (máx. +50).</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.health>=5 || (!isMaster && fractalBalance < FRACTAL_SHOP.health[purchases.health].cost)} onClick={() => void purchaseUpgrade("health")}>{purchases.health>=5 ? "Máximo" : isMaster ? "Melhorar grátis" : "Comprar · " + FRACTAL_SHOP.health[purchases.health].cost.toLocaleString("pt-BR")}</Button></div>
                    <div className="group relative overflow-hidden rounded-xl border border-violet-200/20 bg-gradient-to-br from-violet-400/[0.12] to-[#171425] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:-translate-y-0.5 hover:border-violet-200/40"><p className="text-xs font-semibold">Duração dos projéteis</p><p className="text-[10px] text-muted-foreground">Nível {purchases.projectile_duration}/3 · 0,8 s até 1,6 s (+25%, +50%, +100%).</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.projectile_duration>=3 || (!isMaster && fractalBalance < FRACTAL_SHOP.projectile_duration[purchases.projectile_duration].cost)} onClick={() => void purchaseUpgrade("projectile_duration")}>{purchases.projectile_duration>=3 ? "Máximo" : isMaster ? "Melhorar grátis" : "Comprar · " + FRACTAL_SHOP.projectile_duration[purchases.projectile_duration].cost.toLocaleString("pt-BR")}</Button></div>
                    <div className="group relative overflow-hidden rounded-xl border border-violet-100/15 bg-gradient-to-br from-white/[0.07] to-[#171521] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-100/30 hover:shadow-[0_12px_25px_rgba(0,0,0,0.18)]"><p className="text-xs font-semibold">Ressonância de raridade</p><p className="text-[10px] text-muted-foreground">Tier {purchases.rarity}/3 · Normal, Rara e Épica</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.rarity>=3 || (!isMaster && fractalBalance < FRACTAL_SHOP.rarity[purchases.rarity].cost)} onClick={() => void purchaseUpgrade("rarity")}>{purchases.rarity>=3 ? "Máximo" : isMaster ? "Desbloquear grátis" : "Comprar · " + FRACTAL_SHOP.rarity[purchases.rarity].cost.toLocaleString("pt-BR")}</Button></div>
                    <div className="group relative overflow-hidden rounded-xl border border-violet-100/15 bg-gradient-to-br from-white/[0.07] to-[#171521] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-100/30 hover:shadow-[0_12px_25px_rgba(0,0,0,0.18)]"><p className="text-xs font-semibold">Velocidade 2x</p><p className="text-[10px] text-muted-foreground">Desbloqueio permanente</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.speed_2x || (!isMaster && fractalBalance < FRACTAL_SHOP.speed.double.cost)} onClick={() => void purchaseUpgrade("speed_2x")}>{purchases.speed_2x ? "Adquirido" : isMaster ? "Grátis" : "Comprar · 1.000"}</Button></div>
                    <div className="group relative overflow-hidden rounded-xl border border-violet-100/15 bg-gradient-to-br from-white/[0.07] to-[#171521] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-100/30 hover:shadow-[0_12px_25px_rgba(0,0,0,0.18)]"><p className="text-xs font-semibold">Velocidade 3x</p><p className="text-[10px] text-muted-foreground">Requer 2x · Desbloqueio permanente</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.speed_3x || (!isMaster && (!purchases.speed_2x || fractalBalance < FRACTAL_SHOP.speed.triple.cost))} onClick={() => void purchaseUpgrade("speed_3x")}>{purchases.speed_3x ? "Adquirido" : isMaster ? "Grátis" : "Comprar · 2.000"}</Button></div>
                  </div>
                </section>}
                {shopSection === "relics" && <section className="fractals-shop-section"><div className="fractals-shop-section__heading"><span>02</span><div><h4>Relíquias de expedição</h4><p>Desbloqueie artefatos que podem surgir durante uma incursão.</p></div></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="group relative overflow-hidden rounded-xl border border-violet-100/15 bg-gradient-to-br from-white/[0.07] to-[#171521] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-100/30 hover:shadow-[0_12px_25px_rgba(0,0,0,0.18)]"><p className="text-xs font-semibold">Área de coleta</p><p className="text-[10px] text-muted-foreground">Nível {purchases.area}/3 · N1: escolhas; N2: 1% de queda; N3: 3%.</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.area>=3 || (!isMaster && fractalBalance < FRACTAL_SHOP.area[purchases.area].cost)} onClick={() => void purchaseUpgrade("area")}>{purchases.area>=3 ? "Máximo" : isMaster ? "Desbloquear grátis" : "Comprar · " + FRACTAL_SHOP.area[purchases.area].cost.toLocaleString("pt-BR")}</Button></div>
                    <div className="group relative overflow-hidden rounded-xl border border-violet-100/15 bg-gradient-to-br from-white/[0.07] to-[#171521] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-100/30 hover:shadow-[0_12px_25px_rgba(0,0,0,0.18)]"><p className="text-xs font-semibold">Afinidade de experiência</p><p className="text-[10px] text-muted-foreground">Nível {purchases.experience}/3 · N1: escolhas; N2: 1% de queda; N3: 3%.</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.experience>=3 || (!isMaster && fractalBalance < FRACTAL_SHOP.experience[purchases.experience].cost)} onClick={() => void purchaseUpgrade("experience")}>{purchases.experience>=3 ? "Máximo" : isMaster ? "Desbloquear grátis" : "Comprar · " + FRACTAL_SHOP.experience[purchases.experience].cost.toLocaleString("pt-BR")}</Button></div>
                    <div className="group relative overflow-hidden rounded-xl border border-violet-100/15 bg-gradient-to-br from-white/[0.07] to-[#171521] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-100/30 hover:shadow-[0_12px_25px_rgba(0,0,0,0.18)]"><p className="text-xs font-semibold">Alcance dos projéteis</p><p className="text-[10px] text-muted-foreground">Nível {purchases.projectile_range}/3 · N1: escolhas; N2: 1% de queda; N3: 3%. +10% por coleta.</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.projectile_range>=3 || (!isMaster && fractalBalance < FRACTAL_SHOP.projectile_range[purchases.projectile_range].cost)} onClick={() => void purchaseUpgrade("projectile_range")}>{purchases.projectile_range>=3 ? "Máximo" : isMaster ? "Desbloquear grátis" : "Comprar · " + FRACTAL_SHOP.projectile_range[purchases.projectile_range].cost.toLocaleString("pt-BR")}</Button></div>
                    <div className="group relative overflow-hidden rounded-xl border border-violet-100/15 bg-gradient-to-br from-white/[0.07] to-[#171521] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-100/30 hover:shadow-[0_12px_25px_rgba(0,0,0,0.18)]"><p className="text-xs font-semibold">Coroa de Estilhaços</p><p className="text-[10px] text-muted-foreground">Nível {purchases.projectiles}/3 · desbloqueia até +2 projéteis, um por coleta.</p><Button size="sm" className="mt-3 h-9 w-full rounded-xl bg-gradient-to-r from-amber-200 to-yellow-300 font-bold text-[#291f12] shadow-[0_5px_18px_rgba(234,179,8,0.12)] transition hover:brightness-110" disabled={shopBusy || purchases.projectiles>=3 || (!isMaster && fractalBalance < FRACTAL_SHOP.projectiles[purchases.projectiles].cost)} onClick={() => void purchaseUpgrade("projectiles")}>{purchases.projectiles>=3 ? "Máximo" : isMaster ? "Desbloquear grátis" : "Comprar · " + FRACTAL_SHOP.projectiles[purchases.projectiles].cost.toLocaleString("pt-BR")}</Button></div>
                  </div>
                </section>}
              </div>}
              <p className="fractals-vault__footnote">Relíquias têm 18% de chance de surgir nas escolhas de nível. Brutos e Elites podem derrubá-las conforme o grau de desbloqueio. Os efeitos são reiniciados ao iniciar outra expedição.</p>
            </section>
            <div className="fractals-launch">
              <div className="fractals-launch__copy"><span>O PORTAL ESTÁ INSTÁVEL</span><h3>O Vazio aguarda.</h3><p>Sobreviva por 12 minutos. O guardião desperta ao final da incursão.</p></div>
              <Button onClick={start} className="fractals-launch__button"><Play className="h-4 w-4"/> ENTRAR NA FENDA <span>↗</span></Button>
            </div>
          </div>
        </Card>
      )}

      {(running || result) && (
        <Card className="overflow-hidden border-border/70 bg-[#11111a] text-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 sm:px-4">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{mission.name}</p><p className="text-[11px] text-white/55">{mission.pathName} · Corrupção {corruption} — {CORRUPTION_LEVELS[corruption].name}</p></div>
            <div className="flex items-center gap-2"><span className="text-xs tabular-nums text-white/70">{formatTime(hud.elapsed)} / 12:00</span>{!result && <Button size="sm" variant="outline" className="h-8 border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => { setPaused((v) => !v) }}><Pause className="mr-1 h-3.5 w-3.5" />{paused ? "Continuar" : "Pausar"}</Button>}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 px-3 py-2.5 sm:px-4">
            <div><div className="mb-1 flex items-center gap-1 text-[11px] text-white/65"><Heart className="h-3 w-3 text-rose-300"/> Vida</div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-rose-400 transition-all" style={{width:`${hud.hp / hud.maxHp * 100}%`}}/></div><p className="mt-1 text-xs tabular-nums">{Math.ceil(hud.hp)} / {Math.ceil(hud.maxHp)}</p></div>
            <div><div className="mb-1 flex items-center gap-1 text-[11px] text-white/65"><Sparkles className="h-3 w-3 text-emerald-300"/> Experiência</div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{width:`${hud.xp / hud.nextXp * 100}%`}}/></div><p className="mt-1 text-xs tabular-nums">Nv. {hud.level} · {hud.xp}/{hud.nextXp} XP</p></div>
            <div><div className="mb-1 flex items-center gap-1 text-[11px] text-white/65"><Skull className="h-3 w-3 text-violet-300"/> Derrotados</div><p className="mt-1 text-sm font-semibold tabular-nums">{hud.kills}</p><p className="text-[10px] text-white/45">Pressão {hud.pressure.toFixed(1)}</p></div>
          </div>
          <div className="relative">
            <canvas ref={canvasRef} className="block h-[min(64vh,560px)] min-h-[390px] w-full touch-none" onPointerDown={pointerStart} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} aria-label="Arena de sobrevivência. Use WASD, setas ou arraste o dedo para mover." />
            <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-white/10 bg-black/45 px-2.5 py-1.5 text-[11px] text-white/75"><span className="font-semibold text-white">{hud.phase}</span><span className="mx-1.5">·</span>Movimento: WASD / setas / toque</div>
            {bossMessage && !result && <div className="pointer-events-none absolute inset-x-0 top-14 text-center"><span className="rounded-full border border-violet-300/40 bg-violet-950/80 px-4 py-2 text-xs font-semibold tracking-wider text-violet-100">{mission.bossTitle.toUpperCase()} DESPERTOU</span></div>}
            {paused && !result && levelChoices.length === 0 && <div className="fractals-pause-overlay absolute inset-0 grid place-items-center overflow-y-auto p-3 sm:p-5">
 <div className="fractals-pause-panel relative w-full max-w-md overflow-hidden p-4 sm:p-5">
  <div className="fractals-pause-header mb-4 flex items-center justify-between pb-3"><div><p className="text-[9px] font-bold uppercase tracking-[.24em] text-violet-200/70">Ecos dos Fractais · Refúgio</p><h3 className="mt-1 font-display text-2xl text-white">Expedição pausada</h3></div><div className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-200/20 bg-amber-200/10 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.12)]"><Pause className="h-5 w-5"/></div></div>
  {pausePanel === "main" ? <>
   <div className="fractals-pause-actions grid grid-cols-2 gap-2"><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={() => setPausePanel("attributes")}><UserRound className="h-4 w-4"/> Atributos</Button><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={toggleFullscreen}><Maximize className="h-4 w-4"/> Tela cheia</Button><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={() => setShowPlayerHp((v) => !v)}><Heart className="h-4 w-4 text-rose-300"/> HP: {showPlayerHp ? "visível" : "oculto"}</Button><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={() => setShowDamageNumbers((v) => !v)}><Swords className="h-4 w-4 text-amber-200"/> Dano: {showDamageNumbers ? "visível" : "oculto"}</Button></div>
   <div className="fractals-pause-speed mt-3 rounded-2xl p-3"><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/75"><Gauge className="h-4 w-4"/> Velocidade da expedição</div><div className="grid grid-cols-3 gap-2">{([1,2,3] as const).map((speed) => <Button key={speed} size="sm" variant={speedMultiplier===speed?"default":"outline"} disabled={!isMaster && (speed===2 ? !purchases.speed_2x : speed===3 ? !purchases.speed_3x : false)} className={!isMaster && speed>1?"border-white/10 opacity-45":""} onClick={()=>setSpeedMultiplier(speed)}>{speed}x{!isMaster && (speed===2 ? !purchases.speed_2x : speed===3 ? !purchases.speed_3x : false)?" 🔒":""}</Button>)}</div>{!isMaster && <p className="mt-2 text-[10px] text-white/45">Desbloqueie 2x e 3x na loja de fractais.</p>}{isMaster && <p className="mt-2 text-[10px] text-emerald-200/70">Acesso de mestre: todas as velocidades liberadas para testes.</p>}</div>
   <Button className="fractals-pause-resume mt-3 h-11 w-full font-bold" onClick={() => {setPausePanel("main");setPaused(false)}}><Play className="mr-2 h-4 w-4"/> Retomar expedição</Button>
  </> : <>
   <div className="mb-3 grid grid-cols-2 gap-2">{[["Vida",`${Math.ceil(gameRef.current?.player.hp ?? hud.hp)} / ${Math.ceil(gameRef.current?.player.maxHp ?? hud.maxHp)}`],["Dano",`${(gameRef.current?.player.damage ?? 0).toFixed(1)}`],["Velocidade",`${(gameRef.current?.player.speed ?? 0).toFixed(0)}`],["Intervalo de ataque",`${(gameRef.current?.player.fireRate ?? 0).toFixed(2)}s`],["Nível",`${gameRef.current?.player.level ?? hud.level}`],["Projéteis",`${1 + (gameRef.current?.player.projectileStacks ?? 0)}`],["Alcance",`+${Math.round((gameRef.current?.player.projectileRangeMultiplier ?? 1) * 100 - 100)}%`],["Experiência",`${gameRef.current?.player.xp ?? hud.xp} / ${gameRef.current?.player.nextXp ?? hud.nextXp}`],["Abates",`${gameRef.current?.kills ?? hud.kills}`],["Multiplicador",`${speedMultiplier}x`]].map(([label,value])=><div key={label} className="rounded-lg border border-white/10 bg-white/5 p-2"><p className="text-[10px] text-white/45">{label}</p><p className="text-sm font-semibold tabular-nums text-white">{value}</p></div>)}</div>
   <Button variant="outline" className="w-full border-white/15 text-white hover:bg-white/10" onClick={()=>setPausePanel("main")}><ArrowLeft className="mr-2 h-4 w-4"/> Voltar ao menu</Button>
  </>}
 </div>
</div>}
            {levelChoices.length > 0 && <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(91,46,133,0.32),rgba(5,4,10,0.94)_72%)] p-3 backdrop-blur-md sm:p-6"><div className="w-full max-w-3xl space-y-4 rounded-[1.7rem] border border-violet-200/20 bg-[#171320]/90 p-4 shadow-[0_30px_100px_rgba(0,0,0,0.7)] sm:p-5"><div className="text-center"><p className="text-[9px] font-black uppercase tracking-[.24em] text-violet-200/65">O fractal oferece seu poder</p><h3 className="mt-1 font-display text-2xl text-white sm:text-3xl">Escolha uma dádiva</h3><p className="mt-1 text-[10px] text-white/40">Raras são 25% mais fortes · Épicas são 50% mais fortes.</p></div><div className="grid gap-2 sm:grid-cols-3">{levelChoices.map((upgrade) => {const Icon=upgrade.icon;const rarity=upgrade.rarity??"normal";const style=rarity==="epic"?"border-fuchsia-300/65 bg-gradient-to-br from-fuchsia-400/[0.18] via-violet-500/[0.10] to-[#171020] shadow-[0_0_35px_rgba(217,70,239,0.16)] hover:border-fuchsia-200":rarity==="rare"?"border-sky-200/45 bg-gradient-to-br from-sky-300/[0.13] via-cyan-500/[0.06] to-[#111a23] shadow-[0_0_26px_rgba(56,189,248,0.10)] hover:border-sky-100":"border-white/15 bg-gradient-to-br from-white/[0.07] to-[#17151f] hover:border-white/30";const label=rarity==="epic"?"ÉPICA · 150% DE POTÊNCIA":rarity==="rare"?"RARA · 125% DE POTÊNCIA":"NORMAL · 100%";return <button key={upgrade.id} onClick={()=>chooseUpgrade(upgrade)} className={"group relative overflow-hidden rounded-2xl border p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:-translate-y-1 hover:brightness-125 "+style}><div className={"pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl "+(rarity==="epic"?"bg-fuchsia-400/20":rarity==="rare"?"bg-sky-300/15":"bg-white/5")}/><div className="relative"><div className="mb-3 flex items-start justify-between gap-2"><div className={"grid h-11 w-11 place-items-center rounded-xl border "+(rarity==="epic"?"border-fuchsia-200/30 bg-fuchsia-300/10 text-fuchsia-100":rarity==="rare"?"border-sky-200/30 bg-sky-300/10 text-sky-100":"border-amber-100/15 bg-amber-100/[0.06] text-amber-100")}><Icon className="h-5 w-5"/></div><span className={"rounded-full border px-2 py-1 text-[8px] font-black tracking-[.14em] "+(rarity==="epic"?"border-fuchsia-200/30 bg-fuchsia-300/10 text-fuchsia-100":rarity==="rare"?"border-sky-200/30 bg-sky-300/10 text-sky-100":"border-white/10 bg-white/5 text-white/45")}>{label}</span></div><p className="text-sm font-bold text-white">{upgrade.name}</p><p className="mt-2 min-h-[3.25rem] text-xs leading-relaxed text-white/70">{getUpgradeDescription(upgrade)}</p><div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-[9px] uppercase tracking-wider text-white/35"><span>{rarity==="epic"?"Dádiva exaltada":rarity==="rare"?"Dádiva aprimorada":"Dádiva estável"}</span><span className="font-bold text-white/55">Escolher ↗</span></div></div></button>;})}</div></div></div>}
            {result && <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(91,46,133,0.28),rgba(5,4,10,0.95)_72%)] p-4 backdrop-blur-md"><div className="w-full max-w-sm rounded-[1.6rem] border border-violet-200/20 bg-[#171320]/95 p-5 text-center shadow-[0_30px_100px_rgba(0,0,0,0.7)]"><div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl border border-amber-200/20 bg-gradient-to-br from-amber-200/15 via-violet-400/15 to-violet-950/70 shadow-[0_0_36px_rgba(167,139,250,0.18)]">{result==="victory"?<Sparkles className="h-7 w-7 text-amber-200"/>:<Skull className="h-7 w-7 text-rose-300"/>}</div><p className="text-xs uppercase tracking-[.22em] text-violet-200">{result==="victory"?"Guardião derrotado":"Expedição encerrada"}</p><h3 className="mt-1 font-display text-2xl">{result==="victory"?"O fractal silenciou":"O Vazio prevaleceu"}</h3><p className="mt-2 text-sm text-white/65">Nível {hud.level} · {hud.kills} criaturas derrotadas · {formatTime(hud.elapsed)}</p><p className="mt-2 text-xs text-amber-100/80">Recompensas e fractais ainda não são creditados neste protótipo; serão conectados após a validação segura no servidor.</p><Button className="mt-4 gap-2" onClick={()=>{setRunning(false);setResult(null);setBossMessage(false);gameRef.current=null;}}><RotateCcw className="h-4 w-4"/> Voltar à expedição</Button></div></div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-[10px] text-white/45 sm:px-4"><span>Arma automática: projétil perseguidor</span><span>Protótipo sem persistência de recompensas</span></div>
        </Card>
      )}
      <div className="flex items-start gap-2 rounded-xl border border-amber-300/15 bg-gradient-to-r from-amber-500/[0.07] to-transparent p-3 text-xs text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"/><p>Último Silêncio apresenta Ecos errantes, Enlutados resistentes, Vigias de elite com aura de drenagem e o Pranteador Sem Rosto, que marca uma área antes de liberar uma onda de lamento e convoca ecos quando perde metade da vida. A loja e a progressão de corrupção já usam o estado persistente da conta; a concessão de recompensas de fim de expedição continua bloqueada até haver validação autoritativa no servidor.</p></div>
    </div>
  );
}
