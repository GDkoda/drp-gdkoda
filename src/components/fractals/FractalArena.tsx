import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { AlertTriangle, Heart, Move, Pause, Play, RotateCcw, Shield, Skull, Sparkles, Swords, Zap, Maximize, UserRound, Gauge, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDifficultySnapshot } from "@/lib/fractals/difficulty";
import { CORRUPTION_LEVELS, FRACTAL_MISSIONS, RUN_DURATION_SECONDS } from "@/lib/fractals/config";
import { FRACTAL_SHOP } from "@/lib/fractals/economy";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type UpgradeId = "power" | "haste" | "vitality" | "swift";
type Upgrade = { id: UpgradeId; name: string; description: string; icon: typeof Zap };

type Enemy = { x: number; y: number; hp: number; maxHp: number; speed: number; radius: number; damage: number; color: string; xp: number; type: "wraith" | "brute" | "charger" | "elite" | "boss"; attack: number; flash: number; windup: number; targetX: number; targetY: number; summonedAtHalf: boolean };
type Shot = { x: number; y: number; vx: number; vy: number; damage: number; life: number };
type Gem = { x: number; y: number; value: number; radius: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

type GameState = {
  width: number; height: number; last: number; elapsed: number; spawnTimer: number; shotTimer: number; bossSpawned: boolean;
  player: { x: number; y: number; hp: number; maxHp: number; speed: number; damage: number; fireRate: number; invuln: number; xp: number; nextXp: number; level: number; pickupRadius: number; xpMultiplier: number };
  enemies: Enemy[]; shots: Shot[]; gems: Gem[]; particles: Particle[]; kills: number; ended: boolean;
};

const UPGRADES: Upgrade[] = [
  { id: "power", name: "Estilhaço Voraz", description: "Aumenta o dano dos disparos em 30%.", icon: Swords },
  { id: "haste", name: "Pulso Acelerado", description: "Dispara 18% mais rápido.", icon: Zap },
  { id: "vitality", name: "Casca de Cristal", description: "Recupera 25% da vida máxima e aumenta a vida em 15%.", icon: Shield },
  { id: "swift", name: "Passos do Errante", description: "Aumenta a velocidade de movimento em 12%.", icon: Move },
];

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

function makeGame(width: number, height: number, areaLevel = 0, experienceLevel = 0): GameState {
  return {
    width, height, last: 0, elapsed: 0, spawnTimer: 0.4, shotTimer: 0.25, bossSpawned: false,
    player: { x: width / 2, y: height / 2, hp: 100, maxHp: 100, speed: 205, damage: 22, fireRate: 0.72, invuln: 0, xp: 0, nextXp: 12, level: 1, pickupRadius: 85 * (1 + [0, 0.12, 0.24, 0.36][areaLevel]), xpMultiplier: 1 + [0, 0.10, 0.20, 0.30][experienceLevel] },
    enemies: [], shots: [], gems: [], particles: [], kills: 0, ended: false,
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
  game.enemies.push({ x, y, ...stats, maxHp: stats.hp, type, attack: type === "boss" ? 2.2 : 0, flash: 0, windup: 0, targetX: x, targetY: y, summonedAtHalf: false });
  // Spawn pressure is bounded. It affects encounter density, not enemy HP directly.
  if (!boss && pressure.enemySpawnScale > 1.25 && game.enemies.length < 48 && Math.random() < 0.18) {
    game.enemies.push({ x: x + (Math.random() - 0.5) * 70, y: y + (Math.random() - 0.5) * 70, ...stats, maxHp: stats.hp, type, attack: 0, flash: 0, windup: 0, targetX: x, targetY: y, summonedAtHalf: false });
  }
}

function drawGame(ctx: CanvasRenderingContext2D, game: GameState, corruption: number, missionId: number) {
  const { width, height, player } = game;
  ctx.clearRect(0, 0, width, height);
  const bg = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, Math.max(width, height) * 0.72);
  bg.addColorStop(0, "#20202c"); bg.addColorStop(1, "#101018");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.strokeStyle = "rgba(211,190,255,0.055)"; ctx.lineWidth = 1;
  const grid = 44;
  for (let x = (width % grid) / 2; x < width; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = (height % grid) / 2; y < height; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  ctx.restore();

  game.gems.forEach((gem) => {
    ctx.save(); ctx.translate(gem.x, gem.y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#9ee6c1"; ctx.shadowColor = "#7df0b0"; ctx.shadowBlur = 12;
    ctx.fillRect(-gem.radius / 2, -gem.radius / 2, gem.radius, gem.radius); ctx.restore();
  });
  game.shots.forEach((shot) => {
    ctx.beginPath(); ctx.fillStyle = "#f4d58a"; ctx.shadowColor = "#f4bd54"; ctx.shadowBlur = 12;
    ctx.arc(shot.x, shot.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  });
  game.enemies.forEach((enemy) => {
    ctx.save(); ctx.translate(enemy.x, enemy.y);
    if (enemy.type === "boss" && enemy.windup > 0) { ctx.save(); ctx.globalAlpha = 0.25 + Math.sin(game.elapsed * 18) * 0.08; ctx.strokeStyle = "#d8b5ff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(enemy.targetX - enemy.x, enemy.targetY - enemy.y, 88, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "rgba(177,112,220,.12)"; ctx.beginPath(); ctx.arc(enemy.targetX - enemy.x, enemy.targetY - enemy.y, 88, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    if (enemy.type === "elite") { ctx.strokeStyle = "rgba(210,170,230,.38)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, enemy.radius + 7, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = enemy.flash > 0 ? "#ffffff" : enemy.color; ctx.shadowColor = enemy.color; ctx.shadowBlur = enemy.type === "boss" ? 25 : 10;
    ctx.beginPath(); ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = enemy.type === "boss" ? "#eadcff" : enemy.type === "elite" ? "#f0d5ff" : "rgba(255,255,255,.35)"; ctx.lineWidth = enemy.type === "boss" || enemy.type === "elite" ? 3 : 1.5;
    ctx.beginPath(); ctx.arc(0, 0, enemy.radius * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#d8c6ff"; ctx.beginPath(); ctx.moveTo(0, -enemy.radius * 0.5); ctx.lineTo(enemy.radius * 0.23, 0); ctx.lineTo(0, enemy.radius * 0.5); ctx.lineTo(-enemy.radius * 0.23, 0); ctx.closePath(); ctx.fill();
    if (enemy.type === "boss" || enemy.hp < enemy.maxHp) {
      const barW = enemy.type === "boss" ? 86 : 30;
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(-barW / 2, -enemy.radius - 10, barW, 4);
      ctx.fillStyle = "#e87979"; ctx.fillRect(-barW / 2, -enemy.radius - 10, barW * clamp(enemy.hp / enemy.maxHp, 0, 1), 4);
    }
    ctx.restore();
  });
  game.particles.forEach((p) => { ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3); });
  ctx.globalAlpha = 1;

  ctx.save(); ctx.translate(player.x, player.y);
  ctx.shadowColor = "#f1d18a"; ctx.shadowBlur = player.invuln > 0 ? 24 : 15;
  ctx.fillStyle = player.invuln > 0 && Math.floor(game.elapsed * 14) % 2 === 0 ? "#ffffff" : "#e8c98b";
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = "#fff1c8"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#292334"; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();

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
  const [purchases, setPurchases] = useState({ area: 0, experience: 0, rarity: 0, speed_2x: false, speed_3x: false });
  const [runId, setRunId] = useState<string | null>(null);
  const [shopBusy, setShopBusy] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);

  const refreshFractalState = useCallback(async () => {
    const { data, error } = await (supabase.rpc as any)("get_fractal_state");
    if (error) { setShopError("Aplique a migração SQL 0005 para ativar loja e progressão."); return; }
    setFractalBalance(Number(data?.fractals ?? 0));
    setUnlockedCorruption(Number(data?.corruptionUnlocked ?? 0));
    setCompletedCorruptions(Array.isArray(data?.completedCorruptions) ? data.completedCorruptions : []);
    const owned = data?.purchasedUpgrades ?? {};
    setPurchases({ area: Number(owned.area ?? 0), experience: Number(owned.experience ?? 0), rarity: Number(owned.rarity ?? 0), speed_2x: !!owned.speed_2x, speed_3x: !!owned.speed_3x });
  }, []);

  useEffect(() => { void refreshFractalState(); }, [refreshFractalState]);

  const purchaseUpgrade = async (upgrade: string) => {
    setShopBusy(true);
    try {
      const { data, error } = await (supabase.rpc as any)("purchase_fractal_upgrade", { _upgrade: upgrade });
      if (error) throw error;
      setFractalBalance(Number(data?.fractals ?? 0));
      const owned = data?.purchasedUpgrades ?? {};
      setPurchases({ area: Number(owned.area ?? 0), experience: Number(owned.experience ?? 0), rarity: Number(owned.rarity ?? 0), speed_2x: !!owned.speed_2x, speed_3x: !!owned.speed_3x });
      toast.success("Melhoria comprada permanentemente.");
    } catch (error: any) { toast.error(error?.message ?? "Não foi possível comprar."); }
    finally { setShopBusy(false); }
  };

  const start = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const width = Math.max(320, rect?.width ?? 760);
    const height = Math.max(380, rect?.height ?? 520);
    const game = makeGame(width, height);
    gameRef.current = game;
    setHud({ hp: 100, maxHp: 100, xp: 0, nextXp: 12, level: 1, kills: 0, elapsed: 0, phase: "Exploração", pressure: 0 });
    setLevelChoices([]); setPaused(false); setResult(null); setBossMessage(false); setRunning(true);
  }, []);

  const chooseUpgrade = useCallback((upgrade: Upgrade) => {
    const game = gameRef.current;
    if (!game) return;
    if (upgrade.id === "power") game.player.damage *= 1.3;
    if (upgrade.id === "haste") game.player.fireRate *= 0.82;
    if (upgrade.id === "vitality") { game.player.maxHp *= 1.15; game.player.hp = Math.min(game.player.maxHp, game.player.hp + game.player.maxHp * 0.25); }
    if (upgrade.id === "swift") game.player.speed *= 1.12;
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
        const keys = keysRef.current;
        let dx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
        let dy = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
        if (joystickRef.current) { dx = joystickRef.current.x; dy = joystickRef.current.y; }
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
          let target = game.enemies[0]; let best = Infinity;
          for (const enemy of game.enemies) { const d = distance(game.player.x, game.player.y, enemy.x, enemy.y); if (d < best) { best = d; target = enemy; } }
          const d = Math.max(1, distance(game.player.x, game.player.y, target.x, target.y));
          const speed = 440;
          game.shots.push({ x: game.player.x, y: game.player.y, vx: ((target.x - game.player.x) / d) * speed, vy: ((target.y - game.player.y) / d) * speed, damage: game.player.damage, life: 1.6 });
          game.shotTimer = game.player.fireRate;
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
                game.player.hp = Math.max(0, game.player.hp - 28); game.player.invuln = 0.85;
              }
            } else if (enemy.attack <= 0) {
              enemy.targetX = game.player.x; enemy.targetY = game.player.y; enemy.windup = 1.05; enemy.attack = 5.1;
            }
            if (enemy.hp <= enemy.maxHp * 0.5 && !enemy.summonedAtHalf) {
              enemy.summonedAtHalf = true;
              for (let i = 0; i < 3; i++) {
                const angle = (Math.PI * 2 * i) / 3;
                game.enemies.push({ x: enemy.x + Math.cos(angle) * 58, y: enemy.y + Math.sin(angle) * 58, hp: 34, maxHp: 34, speed: 62, radius: 10, damage: 8, color: "#9b91b4", xp: 2, type: "wraith", attack: 0, flash: 0, windup: 0, targetX: 0, targetY: 0, summonedAtHalf: false });
              }
            }
            enemy.x += ((game.player.x - enemy.x) / d) * enemy.speed * dt;
            enemy.y += ((game.player.y - enemy.y) / d) * enemy.speed * dt;
          } else {
            enemy.x += ((game.player.x - enemy.x) / d) * enemy.speed * dt;
            enemy.y += ((game.player.y - enemy.y) / d) * enemy.speed * dt;
            if (enemy.type === "elite" && enemy.attack <= 0) {
              if (d < 105 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - 7); game.player.invuln = 0.35; }
              enemy.attack = 1.7;
            }
            if (enemy.type !== "elite" && d < enemy.radius + 15 && enemy.attack <= 0 && game.player.invuln <= 0) {
              game.player.hp = Math.max(0, game.player.hp - enemy.damage); game.player.invuln = 0.72; enemy.attack = 0.8;
            }
          }
        }
        for (const shot of game.shots) {
          for (const enemy of game.enemies) {
            if (enemy.hp > 0 && distance(shot.x, shot.y, enemy.x, enemy.y) < enemy.radius + 5) {
              enemy.hp -= shot.damage; enemy.flash = 0.09; shot.life = 0;
              if (enemy.hp <= 0) {
                game.kills += 1;
                if (enemy.type !== "boss") game.gems.push({ x: enemy.x, y: enemy.y, value: enemy.xp, radius: 5 });
                else { game.ended = true; setResult("victory"); }
                for (let i = 0; i < 5; i++) game.particles.push({ x: enemy.x, y: enemy.y, vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100, life: 0.45, color: enemy.color });
              }
              break;
            }
          }
        }
        game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);
        game.gems.forEach((gem) => {
          const d = distance(game.player.x, game.player.y, gem.x, gem.y);
          if (d < 85) { gem.x += ((game.player.x - gem.x) / Math.max(1, d)) * 260 * dt; gem.y += ((game.player.y - gem.y) / Math.max(1, d)) * 260 * dt; }
          if (d < 17) {
            game.player.xp += gem.value; gem.value = 0;
          }
        });
        game.gems = game.gems.filter((gem) => gem.value > 0);
        game.particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
        game.particles = game.particles.filter((p) => p.life > 0);
        if (game.player.xp >= game.player.nextXp && !game.ended) {
          game.player.xp -= game.player.nextXp; game.player.level += 1; game.player.nextXp = Math.floor(game.player.nextXp * 1.32 + 5);
          
          setLevelChoices([...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3));
        }
        if (game.player.hp <= 0 && !game.ended) { game.ended = true; setResult("defeat"); }
        if (game.elapsed >= RUN_DURATION_SECONDS && !game.ended && !game.bossSpawned) { spawnEnemy(game, missionId, game.elapsed, corruption, true); game.bossSpawned = true; }
        if (now - lastHud > 100) {
          lastHud = now;
          setHud({ hp: game.player.hp, maxHp: game.player.maxHp, xp: game.player.xp, nextXp: game.player.nextXp, level: game.player.level, kills: game.kills, elapsed: game.elapsed, phase: snapshot.phaseLabel, pressure: snapshot.totalPressure });
        }
      }
      drawGame(ctx, game, corruption, missionId);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [running, paused, levelChoices.length, missionId, corruption, speedMultiplier]);

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
    <div className="space-y-4" data-fractal-arena>
      {!running && !result && (
        <Card className="overflow-hidden border-border/70 bg-card/80">
          <div className="space-y-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs uppercase tracking-[.22em] text-muted-foreground">Sobrevivência • Protótipo jogável</p><h2 className="mt-1 font-display text-2xl text-gold">Ecos dos Fractais</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">Enfrente as criaturas atraídas pelo Vazio. Mova-se, colete fragmentos de experiência e deixe suas armas responderem automaticamente.</p></div>
              <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-violet-200"><Sparkles className="h-6 w-6" /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/70 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Missão</p>
                <div className="flex items-center justify-between gap-2"><div><p className="font-semibold">{mission.name}</p><p className="text-xs text-muted-foreground">{mission.pathName}</p></div><span className="text-xs text-muted-foreground">Máx. {mission.maxFractals} fractais</span></div>
                <p className="mt-2 text-xs text-muted-foreground">{mission.identity}</p>
                <p className="mt-2 text-xs text-amber-200">As outras quatro missões serão liberadas com a progressão e os custos definidos.</p>
              </div>
              <div className="rounded-xl border border-border/70 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nível de Corrupção</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {CORRUPTION_LEVELS.map((level) => (
                    <button key={level.level} type="button" onClick={() => setCorruption(level.level)} className={`rounded-lg border px-2 py-2 text-left text-xs transition ${corruption === level.level ? "border-violet-400 bg-violet-500/15 text-violet-100" : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"}`}>
                      <span className="block font-semibold">{level.level} · {level.name}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{CORRUPTION_LEVELS[corruption].description} Neste protótipo, os níveis estão disponíveis para testar o balanceamento.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/35 p-3">
              <div><p className="text-sm font-semibold">12 minutos de sobrevivência</p><p className="text-xs text-muted-foreground">Chefe corrompido surge aos 11 minutos. Derrotá-lo encerra a expedição.</p></div>
              <Button onClick={start} className="gap-2"><Play className="h-4 w-4" /> Iniciar expedição</Button>
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
            {paused && !result && levelChoices.length === 0 && <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-black/85 p-3 sm:p-5">
 <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#191824] p-4 shadow-2xl">
  <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[.2em] text-violet-200">Ecos dos Fractais</p><h3 className="font-display text-2xl">Expedição pausada</h3></div><Pause className="h-7 w-7 text-amber-200"/></div>
  {pausePanel === "main" ? <>
   <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="h-auto justify-start gap-2 border-white/15 bg-white/5 py-3 text-white hover:bg-white/10" onClick={() => setPausePanel("attributes")}><UserRound className="h-4 w-4"/> Atributos</Button><Button variant="outline" className="h-auto justify-start gap-2 border-white/15 bg-white/5 py-3 text-white hover:bg-white/10" onClick={toggleFullscreen}><Maximize className="h-4 w-4"/> Tela cheia</Button></div>
   <div className="mt-3 rounded-xl border border-white/10 p-3"><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/75"><Gauge className="h-4 w-4"/> Velocidade da expedição</div><div className="grid grid-cols-3 gap-2">{([1,2,3] as const).map((speed) => <Button key={speed} size="sm" variant={speedMultiplier===speed?"default":"outline"} disabled={!isMaster && speed>1} className={!isMaster && speed>1?"border-white/10 opacity-45":""} onClick={()=>setSpeedMultiplier(speed)}>{speed}x{!isMaster && speed>1?" 🔒":""}</Button>)}</div>{!isMaster && <p className="mt-2 text-[10px] text-white/45">Aceleração 2x e 3x será liberada pela loja de fractais.</p>}{isMaster && <p className="mt-2 text-[10px] text-emerald-200/70">Acesso de mestre: todas as velocidades liberadas para testes.</p>}</div>
   <Button className="mt-3 w-full" onClick={() => {setPausePanel("main");setPaused(false)}}><Play className="mr-2 h-4 w-4"/> Retomar expedição</Button>
  </> : <>
   <div className="mb-3 grid grid-cols-2 gap-2">{[["Vida",`${Math.ceil(gameRef.current?.player.hp ?? hud.hp)} / ${Math.ceil(gameRef.current?.player.maxHp ?? hud.maxHp)}`],["Dano",`${(gameRef.current?.player.damage ?? 0).toFixed(1)}`],["Velocidade",`${(gameRef.current?.player.speed ?? 0).toFixed(0)}`],["Intervalo de ataque",`${(gameRef.current?.player.fireRate ?? 0).toFixed(2)}s`],["Nível",`${gameRef.current?.player.level ?? hud.level}`],["Experiência",`${gameRef.current?.player.xp ?? hud.xp} / ${gameRef.current?.player.nextXp ?? hud.nextXp}`],["Abates",`${gameRef.current?.kills ?? hud.kills}`],["Multiplicador",`${speedMultiplier}x`]].map(([label,value])=><div key={label} className="rounded-lg border border-white/10 bg-white/5 p-2"><p className="text-[10px] text-white/45">{label}</p><p className="text-sm font-semibold tabular-nums text-white">{value}</p></div>)}</div>
   <Button variant="outline" className="w-full border-white/15 text-white hover:bg-white/10" onClick={()=>setPausePanel("main")}><ArrowLeft className="mr-2 h-4 w-4"/> Voltar ao menu</Button>
  </>}
 </div>
</div>}
            {levelChoices.length > 0 && <div className="absolute inset-0 grid place-items-center bg-black/80 p-3 sm:p-6"><div className="w-full max-w-2xl space-y-3"><div className="text-center"><p className="text-xs uppercase tracking-[.22em] text-violet-200">A energia do fractal responde</p><h3 className="font-display text-2xl">Escolha uma dádiva</h3></div><div className="grid gap-2 sm:grid-cols-3">{levelChoices.map((upgrade) => {const Icon=upgrade.icon;return <button key={upgrade.id} onClick={()=>chooseUpgrade(upgrade)} className="rounded-xl border border-violet-200/20 bg-white/5 p-3 text-left transition hover:border-violet-200/60 hover:bg-violet-500/15"><Icon className="mb-2 h-5 w-5 text-amber-200"/><p className="text-sm font-semibold">{upgrade.name}</p><p className="mt-1 text-xs leading-relaxed text-white/65">{upgrade.description}</p></button>;})}</div></div></div>}
            {result && <div className="absolute inset-0 grid place-items-center bg-black/80 p-4"><div className="max-w-sm text-center"><div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl border border-violet-200/20 bg-violet-400/10">{result==="victory"?<Sparkles className="h-7 w-7 text-amber-200"/>:<Skull className="h-7 w-7 text-rose-300"/>}</div><p className="text-xs uppercase tracking-[.22em] text-violet-200">{result==="victory"?"Guardião derrotado":"Expedição encerrada"}</p><h3 className="mt-1 font-display text-2xl">{result==="victory"?"O fractal silenciou":"O Vazio prevaleceu"}</h3><p className="mt-2 text-sm text-white/65">Nível {hud.level} · {hud.kills} criaturas derrotadas · {formatTime(hud.elapsed)}</p><p className="mt-2 text-xs text-amber-100/80">Recompensas e fractais ainda não são creditados neste protótipo; serão conectados após a validação segura no servidor.</p><Button className="mt-4 gap-2" onClick={()=>{setRunning(false);setResult(null);setBossMessage(false);gameRef.current=null;}}><RotateCcw className="h-4 w-4"/> Voltar à expedição</Button></div></div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-[10px] text-white/45 sm:px-4"><span>Arma automática: projétil perseguidor</span><span>Protótipo sem persistência de recompensas</span></div>
        </Card>
      )}
      <div className="flex items-start gap-2 rounded-lg border border-amber-300/15 bg-amber-500/5 p-3 text-xs text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"/><p>Último Silêncio apresenta Ecos errantes, Enlutados resistentes, Vigias de elite com aura de drenagem e o Pranteador Sem Rosto, que marca uma área antes de liberar uma onda de lamento e convoca ecos quando perde metade da vida. A economia, os desbloqueios e o registro de fractais ainda não estão conectados.</p></div>
    </div>
  );
}
