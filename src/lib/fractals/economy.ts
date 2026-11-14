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
    { level: 4, cost: 1600, label: "Área IV" },
  ],
  experience: [
    { level: 1, cost: 250, label: "Afinidade I" },
    { level: 2, cost: 500, label: "Afinidade II" },
    { level: 3, cost: 900, label: "Afinidade III" },
    { level: 4, cost: 1400, label: "Afinidade IV" },
  ],
  extra_xp: [
    { level: 1, cost: 600, label: "Erudição I" },
    { level: 2, cost: 1200, label: "Erudição II" },
    { level: 3, cost: 2000, label: "Erudição III" },
    { level: 4, cost: 3200, label: "Erudição IV" },
    { level: 5, cost: 4800, label: "Erudição V" },
    { level: 6, cost: 6800, label: "Erudição VI" },
    { level: 7, cost: 9200, label: "Erudição VII" },
    { level: 8, cost: 12000, label: "Erudição VIII" },
    { level: 9, cost: 15500, label: "Erudição IX" },
    { level: 10, cost: 20000, label: "Erudição X" },
  ],
  crit_chance: [
    { level: 1, cost: 2500, label: "Foco I" }, { level: 2, cost: 3200, label: "Foco II" },
    { level: 3, cost: 4000, label: "Foco III" }, { level: 4, cost: 5000, label: "Foco IV" },
    { level: 5, cost: 6200, label: "Foco V" }, { level: 6, cost: 7500, label: "Foco VI" },
    { level: 7, cost: 9000, label: "Foco VII" }, { level: 8, cost: 10800, label: "Foco VIII" },
    { level: 9, cost: 12800, label: "Foco IX" }, { level: 10, cost: 15000, label: "Foco X" },
    { level: 11, cost: 17500, label: "Foco XI" }, { level: 12, cost: 20000, label: "Foco XII" },
    { level: 13, cost: 23000, label: "Foco XIII" }, { level: 14, cost: 26000, label: "Foco XIV" },
    { level: 15, cost: 29500, label: "Foco XV" }, { level: 16, cost: 33500, label: "Foco XVI" },
    { level: 17, cost: 38000, label: "Foco XVII" }, { level: 18, cost: 43000, label: "Foco XVIII" },
    { level: 19, cost: 48500, label: "Foco XIX" }, { level: 20, cost: 55000, label: "Foco XX" },
  ],
  crit_damage: [
    { level: 1, cost: 2500, label: "Letal I" }, { level: 2, cost: 3200, label: "Letal II" },
    { level: 3, cost: 4000, label: "Letal III" }, { level: 4, cost: 5000, label: "Letal IV" },
    { level: 5, cost: 6200, label: "Letal V" }, { level: 6, cost: 7500, label: "Letal VI" },
    { level: 7, cost: 9000, label: "Letal VII" }, { level: 8, cost: 10800, label: "Letal VIII" },
    { level: 9, cost: 12800, label: "Letal IX" }, { level: 10, cost: 15000, label: "Letal X" },
    { level: 11, cost: 17500, label: "Letal XI" }, { level: 12, cost: 20000, label: "Letal XII" },
    { level: 13, cost: 23000, label: "Letal XIII" }, { level: 14, cost: 26000, label: "Letal XIV" },
    { level: 15, cost: 29500, label: "Letal XV" }, { level: 16, cost: 33500, label: "Letal XVI" },
    { level: 17, cost: 38000, label: "Letal XVII" }, { level: 18, cost: 43000, label: "Letal XVIII" },
    { level: 19, cost: 48500, label: "Letal XIX" }, { level: 20, cost: 55000, label: "Letal XX" },
  ],
  greed_pact: [
    { level: 1, cost: 1000, label: "Pacto I" },
    { level: 2, cost: 2200, label: "Pacto II" },
    { level: 3, cost: 4000, label: "Pacto III" },
    { level: 4, cost: 6500, label: "Pacto IV" },
    { level: 5, cost: 10000, label: "Pacto V" },
  ],
  crit_relic: [
    { level: 1, cost: 1500, label: "Olho do Predador I" },
    { level: 2, cost: 3500, label: "Olho do Predador II" },
    { level: 3, cost: 7000, label: "Olho do Predador III" },
  ],
  health: [
    { level: 1, cost: 500, label: "Vida reforçada I" },
    { level: 2, cost: 800, label: "Vida reforçada II" },
    { level: 3, cost: 1200, label: "Vida reforçada III" },
    { level: 4, cost: 1700, label: "Vida reforçada IV" },
    { level: 5, cost: 2300, label: "Vida reforçada V" },
    { level: 6, cost: 3000, label: "Vida reforçada VI" },
    { level: 7, cost: 3800, label: "Vida reforçada VII" },
    { level: 8, cost: 4700, label: "Vida reforçada VIII" },
    { level: 9, cost: 5700, label: "Vida reforçada IX" },
    { level: 10, cost: 6800, label: "Vida reforçada X" },
    { level: 11, cost: 8000, label: "Vida reforçada XI" },
    { level: 12, cost: 9300, label: "Vida reforçada XII" },
    { level: 13, cost: 10700, label: "Vida reforçada XIII" },
    { level: 14, cost: 12200, label: "Vida reforçada XIV" },
    { level: 15, cost: 13800, label: "Vida reforçada XV" },
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
    { level: 4, cost: 1600, label: "Alcance IV" },
  ],
  projectiles: [
    { level: 1, cost: 700, label: "Estilhaços I" },
    { level: 2, cost: 1200, label: "Estilhaços II" },
    { level: 3, cost: 1800, label: "Estilhaços III" },
    { level: 4, cost: 2800, label: "Estilhaços IV" },
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
    { level: 2, cost: 800, tier: 2, label: "Acesso raro II" },
    { level: 3, cost: 1400, tier: 3, label: "Acesso raro III" },
  ],
  reroll: [500, 800, 1200, 1700, 2300, 3000, 3800, 4700, 5700, 6800],
  oracle: [1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 512000],
  banish: [600, 1000, 1500, 2200, 3000],
  fortune: [800, 1400, 2300, 3500, 5000],
  transmutation: [1500, 2700, 4500],
  anchor_soul: [3500, 7000, 20000],
  dash: [3000, 8500, 22000],
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
