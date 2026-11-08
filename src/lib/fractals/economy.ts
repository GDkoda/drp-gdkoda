/**
 * Initial, intentionally centralized balance values for the Fractal shop.
 * Currency writes and unlocks must be performed by server-side RPCs; these
 * constants are display/game-design configuration, not an authority boundary.
 */
export const FRACTAL_RARITY_TIERS = [
  { tier: 1, normal: 100, rare: 0, epic: 0, label: "Normal" },
  { tier: 2, normal: 85, rare: 15, epic: 0, label: "Rara" },
  { tier: 3, normal: 70, rare: 23, epic: 7, label: "Épica" },
] as const;

export const FRACTAL_SHOP = {
  area: [
    { level: 1, cost: 30, bonus: 0.12, label: "Área I" },
    { level: 2, cost: 60, bonus: 0.24, label: "Área II" },
    { level: 3, cost: 100, bonus: 0.36, label: "Área III" },
  ],
  experience: [
    { level: 1, cost: 25, bonus: 0.10, label: "Afinidade I" },
    { level: 2, cost: 50, bonus: 0.20, label: "Afinidade II" },
    { level: 3, cost: 90, bonus: 0.30, label: "Afinidade III" },
  ],
  rarity: [
    { level: 1, cost: 40, tier: 1, label: "Acesso raro" },
    { level: 2, cost: 80, tier: 2, label: "Acesso épico" },
    { level: 3, cost: 140, tier: 3, label: "Ressonância superior" },
  ],
  speed: {
    double: { cost: 100, multiplier: 2 },
    triple: { cost: 200, multiplier: 3 },
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
