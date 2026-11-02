export type CombatAction = "attack" | "power" | "defend" | "recover";
export type CombatStatus = "active" | "won" | "lost";

export type CombatLogEntry = {
  turn?: number;
  who?: string;
  action?: string;
  fa?: number;
  fd?: number;
  dmg?: number;
  crit?: boolean;
  hp?: number;
  target?: "hero" | "monster";
  system?: string;
  reward?: number;
  xp?: number;
};

export type CombatState = {
  id: string;
  hero: string;
  monster: string;
  heroPv: number;
  heroMaxPv: number;
  heroPm: number;
  heroMaxPm: number;
  monsterPv: number;
  monsterMaxPv: number;
  turn: number;
  status: CombatStatus;
  won: boolean;
  reward: number;
  xp: number;
  log: CombatLogEntry[];
};

export const COMBAT_ACTIONS: {
  id: CombatAction;
  title: string;
  description: string;
  cost: string;
}[] = [
  { id: "attack", title: "Ataque básico", description: "Ataque confiável usando F ou PdF.", cost: "Sem custo de PM" },
  { id: "power", title: "Golpe poderoso", description: "+2 na força do ataque; crítico em 6.", cost: "1 PM" },
  { id: "defend", title: "Postura defensiva", description: "Abre mão do ataque e ganha +3 na defesa neste turno.", cost: "Sem custo de PM" },
  { id: "recover", title: "Recuperar fôlego", description: "Recupera até 3 PV e deixa o inimigo agir.", cost: "1 PM" },
];

export function isCombatActionAvailable(
  action: CombatAction,
  state: Pick<CombatState, "status" | "heroPm" | "heroPv" | "heroMaxPv"> | null,
): boolean {
  if (!state || state.status !== "active") return false;
  if ((action === "power" || action === "recover") && state.heroPm < 1) return false;
  if (action === "recover" && state.heroPv >= state.heroMaxPv) return false;
  return true;
}
