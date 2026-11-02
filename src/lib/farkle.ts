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

/**
 * Exact unordered-roll distributions let the machine reason about real odds
 * instead of using a fixed points threshold. There are at most 462 distinct
 * face-count patterns for six dice.
 */
type RollOption = { score: number; diceUsed: number };
type RollPattern = { probability: number; options: RollOption[] };
const rollPatternsCache = new Map<number, RollPattern[]>();
const FACTORIAL = [1, 1, 2, 6, 24, 120, 720];

function selectionOptionsForCounts(counts: number[]): RollOption[] {
  const selected = [0, 0, 0, 0, 0, 0, 0];
  const options = new Map<string, RollOption>();

  const visit = (face: number) => {
    if (face > 6) {
      const faces: DieFace[] = [];
      for (let value = 1; value <= 6; value += 1) {
        for (let count = 0; count < selected[value]; count += 1) {
          faces.push(value as DieFace);
        }
      }
      if (!faces.length) return;
      const score = scoreDiceSelection(faces);
      if (!score) return;
      const diceUsed = selected.reduce((sum, count) => sum + count, 0);
      options.set(diceUsed + ":" + score, { score, diceUsed });
      return;
    }

    for (let count = 0; count <= counts[face]; count += 1) {
      selected[face] = count;
      visit(face + 1);
    }
    selected[face] = 0;
  };

  visit(1);
  return [...options.values()].sort((a, b) => b.score - a.score || b.diceUsed - a.diceUsed);
}

function getRollPatterns(diceCount: number): RollPattern[] {
  const n = Math.max(1, Math.min(6, Math.floor(diceCount)));
  const cached = rollPatternsCache.get(n);
  if (cached) return cached;

  const patterns: RollPattern[] = [];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const totalRolls = 6 ** n;

  const visit = (face: number, remaining: number) => {
    if (face === 6) {
      counts[6] = remaining;
      let arrangements = FACTORIAL[n];
      for (let value = 1; value <= 6; value += 1) {
        arrangements /= FACTORIAL[counts[value]];
      }
      patterns.push({
        probability: arrangements / totalRolls,
        options: selectionOptionsForCounts(counts),
      });
      counts[6] = 0;
      return;
    }

    for (let count = 0; count <= remaining; count += 1) {
      counts[face] = count;
      visit(face + 1, remaining - count);
    }
    counts[face] = 0;
  };

  visit(1, n);
  rollPatternsCache.set(n, patterns);
  return patterns;
}

function diceAfterSelection(diceCount: number, selectedCount: number): number {
  const remaining = diceCount - selectedCount;
  return remaining > 0 ? remaining : 6;
}

export type MachineStrategyConfig = {
  machineTotal: number;
  playerTotal: number;
  target?: number;
  /** -1 is cautious, 0 is balanced, +1 is bold. */
  riskTemperament?: number;
};

export type MachineStrategy = {
  chooseSelection: (
    values: number[],
    turnPoints: number,
    lookaheadRolls?: number,
  ) => ScoringSelection | null;
  shouldBank: (
    turnPoints: number,
    diceRemaining: number,
    lookaheadRolls?: number,
  ) => boolean;
};

/**
 * Creates a strategy for one machine turn.
 *
 * It evaluates the exact probability of every unordered roll, searches up to
 * four rolls ahead, and scores outcomes by estimated match-winning chance.
 * The same engine is reused throughout the turn so the memoized evaluations
 * are shared between selection and bank/risk decisions.
 */
export function createMachineStrategy({
  machineTotal,
  playerTotal,
  target = 4_000,
  riskTemperament = 0,
}: MachineStrategyConfig): MachineStrategy {
  const safeTarget = Math.max(1, target);
  const temperament = Math.max(-1, Math.min(1, riskTemperament));
  const memo = new Map<string, number>();
  const MAX_LOOKAHEAD = 4;

  const winUtility = (turnPoints: number): number => {
    const projectedTotal = machineTotal + turnPoints;
    if (projectedTotal >= safeTarget) return 1;
    if (playerTotal >= safeTarget) return 0;

    const progress = Math.max(projectedTotal, playerTotal) / safeTarget;
    const scale = 680 - Math.max(0, Math.min(1, progress)) * 280;
    const margin = projectedTotal - playerTotal;
    return 1 / (1 + Math.exp(-margin / scale));
  };

  // A bold personality needs a slightly larger advantage from continuing;
  // a cautious personality banks when the two choices are almost equivalent.
  const riskBias = temperament * 0.004;

  const stateUtility = (
    turnPoints: number,
    diceRemaining: number,
    lookaheadRolls: number,
  ): number => {
    if (machineTotal + turnPoints >= safeTarget) return 1;
    const depth = Math.max(0, Math.min(MAX_LOOKAHEAD, Math.floor(lookaheadRolls)));
    if (depth === 0) return winUtility(turnPoints);

    const key = String(turnPoints) + "|" + String(diceRemaining) + "|" + String(depth);
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    const bankNow = winUtility(turnPoints);
    const continueValue = expectedRollUtility(turnPoints, diceRemaining, depth) + riskBias;
    const value = Math.max(bankNow, Math.min(1, continueValue));
    memo.set(key, value);
    return value;
  };

  const expectedRollUtility = (
    turnPoints: number,
    diceRemaining: number,
    lookaheadRolls: number,
  ): number => {
    if (lookaheadRolls <= 0) return winUtility(turnPoints);

    let expected = 0;
    for (const pattern of getRollPatterns(diceRemaining)) {
      if (!pattern.options.length) {
        // A Farkle forfeits every point accumulated in this turn.
        expected += pattern.probability * winUtility(0);
        continue;
      }

      let bestAfterRoll = Number.NEGATIVE_INFINITY;
      for (const option of pattern.options) {
        const nextDice = diceAfterSelection(diceRemaining, option.diceUsed);
        const value = stateUtility(
          turnPoints + option.score,
          nextDice,
          lookaheadRolls - 1,
        );
        if (value > bestAfterRoll) bestAfterRoll = value;
      }
      expected += pattern.probability * bestAfterRoll;
    }
    return expected;
  };

  const chooseSelection: MachineStrategy["chooseSelection"] = (
    values,
    turnPoints,
    lookaheadRolls = MAX_LOOKAHEAD,
  ) => {
    if (!values.length || values.length > 6 || values.some((value) => clampFace(value) === null)) {
      return null;
    }

    const depth = Math.max(0, Math.min(MAX_LOOKAHEAD, Math.floor(lookaheadRolls)));
    let best: ScoringSelection | null = null;
    let bestValue = Number.NEGATIVE_INFINITY;
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
      if (!score) continue;

      const nextDice = diceAfterSelection(values.length, indices.length);
      const value = stateUtility(turnPoints + score, nextDice, depth);
      const improves = value > bestValue + 1e-10;
      const tieBreaks = Math.abs(value - bestValue) <= 1e-10
        && (!best || score > best.score || (score === best.score && indices.length > best.indices.length));

      if (improves || tieBreaks) {
        best = { indices, faces, score };
        bestValue = value;
      }
    }

    return best;
  };

  const shouldBank: MachineStrategy["shouldBank"] = (
    turnPoints,
    diceRemaining,
    lookaheadRolls = MAX_LOOKAHEAD,
  ) => {
    if (machineTotal + turnPoints >= safeTarget) return true;
    if (turnPoints <= 0) return false;

    const depth = Math.max(0, Math.min(MAX_LOOKAHEAD, Math.floor(lookaheadRolls)));
    if (depth === 0) return true;

    const bankNow = winUtility(turnPoints);
    const rollValue = expectedRollUtility(turnPoints, diceRemaining, depth) + riskBias;
    return bankNow >= rollValue;
  };

  return { chooseSelection, shouldBank };
}

/** Convenience wrapper retained for callers that only need a bank decision. */
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
  riskTemperament?: number;
}): boolean {
  return createMachineStrategy({
    machineTotal,
    playerTotal,
    target,
    riskTemperament,
  }).shouldBank(turnPoints, diceRemaining, MAX_AI_LOOKAHEAD);
}

const MAX_AI_LOOKAHEAD = 4;
