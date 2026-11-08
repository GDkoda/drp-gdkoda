import {
  CORRUPTION_LEVEL_MAX,
  CORRUPTION_LEVEL_MIN,
  FRACTAL_MISSIONS,
  RUN_DURATION_SECONDS,
  type FractalMission,
} from "./config";

export type RunPhase =
  | "opening"
  | "first_pressure"
  | "first_trial"
  | "breather"
  | "escalation"
  | "danger"
  | "final_build_up"
  | "boss";

export interface DifficultySnapshot {
  elapsedSeconds: number;
  phase: RunPhase;
  phaseLabel: string;
  missionPressure: number;
  temporalPressure: number;
  corruptionPressure: number;
  totalPressure: number;
  enemySpawnScale: number;
  eliteSpawnScale: number;
  warning: string;
}

interface PhaseDefinition {
  start: number;
  end: number;
  phase: RunPhase;
  label: string;
  pressure: number;
  spawn: number;
  elite: number;
  warning: string;
}

// The low-pressure intervals are intentional recovery windows, not empty rooms.
const PHASES: readonly PhaseDefinition[] = [
  { start: 0, end: 120, phase: "opening", label: "Exploração", pressure: 1, spawn: 0.72, elite: 0, warning: "Aprenda os movimentos dos inimigos e construa sua primeira combinação." },
  { start: 120, end: 240, phase: "first_pressure", label: "Primeira pressão", pressure: 2.2, spawn: 0.95, elite: 0.15, warning: "Novos tipos de criaturas entram na arena." },
  { start: 240, end: 300, phase: "first_trial", label: "Primeiro desafio", pressure: 3.2, spawn: 1.08, elite: 0.55, warning: "Uma ameaça de elite pode surgir." },
  { start: 300, end: 360, phase: "breather", label: "Brecha para respirar", pressure: 2.3, spawn: 0.78, elite: 0.2, warning: "A pressão diminui por um instante. Reposicione-se e recolha experiência." },
  { start: 360, end: 480, phase: "escalation", label: "Escalada", pressure: 4, spawn: 1.18, elite: 0.65, warning: "As hordas começam a combinar habilidades dos caminhos." },
  { start: 480, end: 600, phase: "danger", label: "Perigo", pressure: 5.5, spawn: 1.34, elite: 1, warning: "Elites e eventos perigosos tornam-se mais frequentes." },
  { start: 600, end: 660, phase: "final_build_up", label: "Presságio", pressure: 6.8, spawn: 1.42, elite: 1.15, warning: "A arena se prepara para liberar seu guardião corrompido." },
  { start: 660, end: RUN_DURATION_SECONDS + 1, phase: "boss", label: "Guardião corrompido", pressure: 8, spawn: 1.12, elite: 0.6, warning: "O chefe da missão despertou. Sobreviva aos seus padrões e encontre as aberturas." },
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getMission(missionId: number): FractalMission {
  const mission = FRACTAL_MISSIONS.find((item) => item.id === missionId);
  if (!mission) throw new Error(`Missão de fractal inválida: ${missionId}`);
  return mission;
}

export function getRunPhase(elapsedSeconds: number): PhaseDefinition {
  const elapsed = clamp(Math.floor(elapsedSeconds), 0, RUN_DURATION_SECONDS);
  return PHASES.find((phase) => elapsed >= phase.start && elapsed < phase.end) ?? PHASES[PHASES.length - 1];
}

/**
 * Combines three separate sources of challenge:
 * - mission pressure: the map's fixed identity and baseline difficulty;
 * - temporal pressure: the run's scheduled escalation and relief windows;
 * - corruption pressure: optional challenge selected before starting.
 *
 * Values are balancing indices, not direct damage multipliers. Combat systems
 * should translate them into bounded spawn budgets and enemy compositions.
 */
export function getDifficultySnapshot(
  missionId: number,
  elapsedSeconds: number,
  corruptionLevel = 0,
): DifficultySnapshot {
  const mission = getMission(missionId);
  const phase = getRunPhase(elapsedSeconds);
  const corruption = clamp(
    Math.floor(corruptionLevel),
    CORRUPTION_LEVEL_MIN,
    CORRUPTION_LEVEL_MAX,
  );
  const missionPressure = mission.baseDifficulty * 0.85;
  const temporalPressure = phase.pressure;
  const corruptionPressure = corruption * 0.65;
  const totalPressure = Number(
    (missionPressure + temporalPressure + corruptionPressure).toFixed(2),
  );

  return {
    elapsedSeconds: clamp(Math.floor(elapsedSeconds), 0, RUN_DURATION_SECONDS),
    phase: phase.phase,
    phaseLabel: phase.label,
    missionPressure,
    temporalPressure,
    corruptionPressure,
    totalPressure,
    enemySpawnScale: Number(
      clamp(phase.spawn + mission.baseDifficulty * 0.035 + corruption * 0.045, 0.65, 1.8).toFixed(2),
    ),
    eliteSpawnScale: Number(
      clamp(phase.elite + (mission.baseDifficulty - 1) * 0.08 + corruption * 0.12, 0, 2).toFixed(2),
    ),
    warning: phase.warning,
  };
}
