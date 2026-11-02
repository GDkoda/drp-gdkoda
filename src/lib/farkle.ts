export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;

export type ScoringSelection = {
  indices: number[];
  faces: DieFace[];
  score: number;
};

const GROUP_BASE: Record<DieFace, number> = {
  1: 1_000,
  2: 200,
  3: 300,
  4: 400,
  5: 500,
  6: 600,
};

const clampFace = (value: number): DieFace | null =>
  Number.isInteger(value) && value >= 1 && value <= 6 ? (value as DieFace) : null;

/**
 * Calculates the maximum deterministic score for a selected set of dice.
 * Every die in the supplied selection must be consumed by a scoring pattern.
 * Because each call receives one roll only, dice from different rolls can
 * never be combined into a new straight or group.
 */
export function scoreDiceSelection(values: number[]): number {
  if (!values.length || values.length > 6) return 0;

  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const value of values) {
    const face = clampFace(value);
    if (!face) return 0;
    counts[face] += 1;
  }

  const memo = new Map<string, number>();

  const solve = (state: number[]): number => {
    const total = state.reduce((sum, count) => sum + count, 0);
    if (total === 0) return 0;

    const key = state.slice(1).join(",");
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let best = Number.NEGATIVE_INFINITY;
    const tryPattern = (pattern: number[], points: number) => {
      const next = state.slice();
      for (let face = 1; face <= 6; face += 1) {
        if (pattern[face] > next[face]) return;
        next[face] -= pattern[face];
      }
      const remainder = solve(next);
      if (remainder !== Number.NEGATIVE_INFINITY) best = Math.max(best, points + remainder);
    };

    // A six-die straight is a single special combination, not a five-run plus a spare die.
    if (total === 6 && state.slice(1).every((count) => count === 1)) {
      best = 1_500;
    }

    // Five-die straights can be combined with another independently scoring die.
    for (const run of [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]]) {
      if (run.every((face) => state[face] >= 1)) {
        const pattern = [0, 0, 0, 0, 0, 0, 0];
        run.forEach((face) => { pattern[face] = 1; });
        tryPattern(pattern, run[0] === 1 ? 500 : 750);
      }
    }

    // Singles are only valid for ones and fives.
    for (const face of [1, 5] as const) {
      if (state[face] > 0) {
        const pattern = [0, 0, 0, 0, 0, 0, 0];
        pattern[face] = 1;
        tryPattern(pattern, face === 1 ? 100 : 50);
      }
    }

    // Three of a kind and larger groups. Each additional matching die doubles the value.
    for (let face = 1 as DieFace; face <= 6; face = (face + 1) as DieFace) {
      for (let amount = 3; amount <= Math.min(6, state[face]); amount += 1) {
        const pattern = [0, 0, 0, 0, 0, 0, 0];
        pattern[face] = amount;
        tryPattern(pattern, GROUP_BASE[face] * 2 ** (amount - 3));
      }
    }

    memo.set(key, best);
    return best;
  };

  const score = solve(counts);
  return score === Number.NEGATIVE_INFINITY ? 0 : score;
}

/** Finds the highest-value valid subset in one throw, preferring more dice on ties. */
export function bestScoringSelection(values: number[]): ScoringSelection | null {
  if (!values.length || values.length > 6 || values.some((value) => clampFace(value) === null)) return null;

  let best: ScoringSelection | null = null;
  const combinations = 1 << values.length;

  for (let mask = 1; mask < combinations; mask += 1) {
    const indices: number[] = [];
    const faces: DieFace[] = [];
    for (let index = 0; index < values.length; index += 1) {
      if (mask & (1 << index)) {
        indices.push(index);
        faces.push(values[index] as DieFace);
      }
    }

    const score = scoreDiceSelection(faces);
    if (
      score > 0 &&
      (!best || score > best.score || (score === best.score && indices.length > best.indices.length))
    ) {
      best = { indices, faces, score };
    }
  }

  return best;
}

export const hasScoringCombination = (values: number[]): boolean =>
  bestScoringSelection(values) !== null;

/** Return the next number of dice: unused dice, or all six after a hot-dice turn. */
export function nextRollCount(usedDice: number): number {
  return usedDice >= 6 ? 6 : Math.max(0, 6 - Math.max(0, usedDice));
}

const farkleProbabilityCache = new Map<number, number>();

/** Exact chance that a throw of n dice has no scoring combination. */
export function farkleProbability(diceCount: number): number {
  const n = Math.max(0, Math.min(6, Math.floor(diceCount)));
  if (n === 0) return 1;
  const cached = farkleProbabilityCache.get(n);
  if (cached !== undefined) return cached;

  let total = 0;
  let farkles = 0;
  const counts = [0, 0, 0, 0, 0, 0, 0];

  const visit = (depth: number) => {
    if (depth === n) {
      total += 1;
      const hasSingle = counts[1] > 0 || counts[5] > 0;
      const hasTriple = counts.slice(2, 7).some((count) => count >= 3);
      if (!hasSingle && !hasTriple) farkles += 1;
      return;
    }
    for (let face = 1; face <= 6; face += 1) {
      counts[face] += 1;
      visit(depth + 1);
      counts[face] -= 1;
    }
  };

  visit(0);
  const probability = total ? farkles / total : 1;
  farkleProbabilityCache.set(n, probability);
  return probability;
}

/** Risk-aware decision helper used by the machine. Its inputs make decisions testable. */
export function machineShouldBank({
  machineTotal,
  playerTotal,
  turnPoints,
  diceRemaining,
  target = 4_000,
  riskTemperament = 0,
}: {
  machineTotal: number;
  playerTotal: number;
  turnPoints: number;
  diceRemaining: number;
  target?: number;
  /** -1 is cautious, 0 is balanced, +1 is bold. */
  riskTemperament?: number;
}): boolean {
  if (machineTotal + turnPoints >= target) return true;
  if (turnPoints <= 0) return false;

  const deficitPressure = Math.max(-0.25, Math.min(0.65, (playerTotal - machineTotal) / 1_500));
  const riskPressure = farkleProbability(diceRemaining);
  let threshold = 470 + deficitPressure * 650 + riskTemperament * 150;

  if (diceRemaining <= 2) threshold -= 95;
  if (diceRemaining >= 5) threshold += 75;

  // A machine far behind accepts more danger rather than banking a small lead-sized turn.
  if (playerTotal - machineTotal > 850 && diceRemaining >= 3 && turnPoints < threshold + 240) {
    return false;
  }

  const riskAdjustedThreshold = threshold * (1 + riskPressure * 0.22);
  return turnPoints >= riskAdjustedThreshold;
}
