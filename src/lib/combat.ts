export type CombatAction =
  | "attack"
  | "power"
  | "defend"
  | "recover"
  | "aim"
  | "feint"
  | "spell";

export type CombatStatus = "active" | "won" | "lost";

export type CombatAbility = {
  id: string;
  name: string;
  school: string;
  description: string;
  pmCost: number;
  effect: "damage" | "pierce" | "heal" | "guard" | "weaken";
  power: number;
};

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
  effect?: string;
  amount?: number;
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
  attributes?: { f: number; h: number; r: number; a: number; pdf: number };
  abilities?: CombatAbility[];
  heroTraits?: { name?: string; cost?: number; note?: string }[];
  monsterStrategy?: "aggressive" | "defensive" | "balanced";
  log: CombatLogEntry[];
};

export const COMBAT_ACTIONS: {
  id: Exclude<CombatAction, "spell">;
  title: string;
  description: string;
  cost: string;
}[] = [
  { id: "attack", title: "Ataque básico", description: "FA com o maior valor entre F e PdF, somado a H e 1d6.", cost: "Sem custo de PM" },
  { id: "power", title: "Golpe poderoso", description: "Concentra energia para aumentar em +2 o atributo de ataque.", cost: "1 PM" },
  { id: "defend", title: "Postura defensiva", description: "Abre mão do ataque e recebe +3 na FD contra a resposta inimiga.", cost: "Sem custo de PM" },
  { id: "recover", title: "Recuperar fôlego", description: "Recupera até 3 PV; o adversário ainda terá sua vez.", cost: "1 PM" },
  { id: "aim", title: "Preparar ataque", description: "Gasta o turno para acumular +2 na próxima FA (máximo +4).", cost: "Sem custo de PM" },
  { id: "feint", title: "Finta", description: "Ataca com +1; se causar dano, enfraquece o próximo ataque inimigo em 2.", cost: "Sem custo de PM" },
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

export function isCombatAbilityAvailable(
  ability: Pick<CombatAbility, "pmCost">,
  state: Pick<CombatState, "status" | "heroPm"> | null,
): boolean {
  return !!state && state.status === "active" && state.heroPm >= Math.max(0, ability.pmCost);
}

export function combatEffectLabel(effect: CombatAbility["effect"]): string {
  const labels: Record<CombatAbility["effect"], string> = {
    damage: "Dano mágico",
    pierce: "Dano perfurante",
    heal: "Cura",
    guard: "Proteção",
    weaken: "Enfraquecimento",
  };
  return labels[effect];
}
