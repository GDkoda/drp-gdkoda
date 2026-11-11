/**
 * Initial, intentionally centralized balance values for the Fractal shop.
 * Currency writes and unlocks must be performed by server-side RPCs; these
 * constants are display/game-design configuration, not an authority boundary.
 */
// Ressonância Rara changes only the Normal/Rare distribution.
// Épicas are created by Transmutação Rúnica, which promotes an eligible Rare roll.
export const FRACTAL_RARITY_TIERS = [
  { tier: 0, normal: 100, rare: 0, epic: 0, label: "Normal" },
  { tier: 1, normal: 85, rare: 15, epic: 0, label: "Rara" },
  { tier: 2, normal: 75, rare: 25, epic: 0, label: "Rara aprimorada" },
  { tier: 3, normal: 65, rare: 35, epic: 0, label: "Ressonância máxima" },
] as const;

export const FRACTAL_SHOP = {
  area: [
    { level: 1, cost: 300, label: "Área I" },
    { level: 2, cost: 600, label: "Área II" },
    { level: 3, cost: 1000, label: "Área III" },
  ],
  experience: [
    { level: 1, cost: 250, label: "Afinidade I" },
    { level: 2, cost: 500, label: "Afinidade II" },
    { level: 3, cost: 900, label: "Afinidade III" },
  ],
  health: [
    { level: 1, cost: 500, label: "Vida reforçada I" },
    { level: 2, cost: 800, label: "Vida reforçada II" },
    { level: 3, cost: 1200, label: "Vida reforçada III" },
    { level: 4, cost: 1700, label: "Vida reforçada IV" },
    { level: 5, cost: 2300, label: "Vida reforçada V" },
  ],
  projectile_duration: [
    { level: 1, cost: 600, label: "Duração I" },
    { level: 2, cost: 1000, label: "Duração II" },
    { level: 3, cost: 1600, label: "Duração III" },
  ],
  projectile_range: [
    { level: 1, cost: 350, label: "Alcance I" },
    { level: 2, cost: 600, label: "Alcance II" },
    { level: 3, cost: 1000, label: "Alcance III" },
  ],
  projectiles: [
    { level: 1, cost: 700, label: "Estilhaços I" },
    { level: 2, cost: 1200, label: "Estilhaços II" },
    { level: 3, cost: 1800, label: "Estilhaços III" },
  ],
  ricochet: [
    { level: 1, cost: 500, label: "Ricochete I" },
    { level: 2, cost: 900, label: "Ricochete II" },
    { level: 3, cost: 1400, label: "Ricochete III" },
  ],
  piercing: [
    { level: 1, cost: 600, label: "Perfuração I" },
    { level: 2, cost: 1000, label: "Perfuração II" },
    { level: 3, cost: 1500, label: "Perfuração III" },
  ],
  chain_lightning: [
    { level: 1, cost: 700, label: "Descarga I" },
    { level: 2, cost: 1200, label: "Descarga II" },
    { level: 3, cost: 1800, label: "Descarga III" },
  ],
  rarity: [
    { level: 1, cost: 400, tier: 1, label: "Acesso raro" },
    { level: 2, cost: 800, tier: 2, label: "Acesso épico" },
    { level: 3, cost: 1400, tier: 3, label: "Ressonância superior" },
  ],
  rarity: [
    { level: 1, cost: 400, tier: 1, label: "Acesso raro" },
    { level: 2, cost: 800, tier: 2, label: "Acesso raro II" },
    { level: 3, cost: 1400, tier: 3, label: "Acesso raro III" },
  ],
  reroll: [500, 800, 1200, 1700, 2300, 3000, 3800, 4700, 5700, 6800],
  oracle: [1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 512000],
  banish: [600, 1000, 1500, 2200, 3000],
  fortune: [800, 1400, 2300],
  transmutation: [1500, 2700, 4500],
  anchor_soul: 3500,
  omen_archive: 6000,
  weapons: {
    nucleus: 8000,
    scythe: 9000,
    orbitals: 10000,
    gravity: 11000,
    sentinels: 12000,
  },
  evolution_project: 5000,
  speed: {
    double: { cost: 1000, multiplier: 2 },
    triple: { cost: 2000, multiplier: 3 },
  },
} as const;

/** Initial expedition reward curve; result is always clamped to mission cap. */
export function calculateFractalReward(input: {
  missionCap: number;
  survivedSeconds: number;
  runDurationSeconds: number;
  bossDefeated: boolean;
  kills: number;
}): number {
  const duration = Math.max(1, input.runDurationSeconds);
  const survival = Math.min(0.65, Math.max(0, input.survivedSeconds / duration) * 0.65);
  const boss = input.bossDefeated ? 0.25 : 0;
  const killRate = Math.min(1, Math.max(0, input.kills) / 120);
  const performance = Math.min(1, survival + boss + killRate * 0.10);
  return Math.max(0, Math.min(input.missionCap, Math.floor(input.missionCap * performance)));
}

/** Evolutions are always Legendary and never participate in the rarity roll. */
export const EVOLUTION_RARITY = "legendary" as const;
