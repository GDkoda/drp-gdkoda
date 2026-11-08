import { describe, expect, it } from "vitest";
import {
  COMBAT_ACTIONS,
  combatEffectLabel,
  isCombatAbilityAvailable,
  isCombatActionAvailable,
  type CombatAbility,
  type CombatState,
} from "@/lib/combat";

const activeState = {
  status: "active",
  heroPm: 1,
  heroPv: 4,
  heroMaxPv: 10,
} as Pick<CombatState, "status" | "heroPm" | "heroPv" | "heroMaxPv">;

describe("ações do combate estratégico 3D&T Alpha", () => {
  it("apresenta seis ações universais", () => {
    expect(COMBAT_ACTIONS.map((action) => action.id)).toEqual([
      "attack", "power", "defend", "recover", "aim", "feint",
    ]);
  });

  it("mantém ações sem custo disponíveis sem PM", () => {
    const state = { ...activeState, heroPm: 0 };
    expect(isCombatActionAvailable("attack", state)).toBe(true);
    expect(isCombatActionAvailable("defend", state)).toBe(true);
    expect(isCombatActionAvailable("aim", state)).toBe(true);
    expect(isCombatActionAvailable("feint", state)).toBe(true);
    expect(isCombatActionAvailable("power", state)).toBe(false);
    expect(isCombatActionAvailable("recover", state)).toBe(false);
  });

  it("só permite recuperar quando há PM e PV faltando", () => {
    expect(isCombatActionAvailable("recover", activeState)).toBe(true);
    expect(isCombatActionAvailable("recover", { ...activeState, heroPv: 10 })).toBe(false);
    expect(isCombatActionAvailable("recover", { ...activeState, heroPm: 0 })).toBe(false);
  });

  it("bloqueia todas as ações fora de um combate ativo", () => {
    expect(isCombatActionAvailable("attack", null)).toBe(false);
    expect(isCombatActionAvailable("power", { ...activeState, status: "won" })).toBe(false);
    expect(isCombatActionAvailable("defend", { ...activeState, status: "lost" })).toBe(false);
  });

  it("valida magias aprendidas pelo PM disponível", () => {
    const spell: Pick<CombatAbility, "pmCost"> = { pmCost: 2 };
    expect(isCombatAbilityAvailable(spell, { status: "active", heroPm: 2 })).toBe(true);
    expect(isCombatAbilityAvailable(spell, { status: "active", heroPm: 1 })).toBe(false);
    expect(isCombatAbilityAvailable(spell, { status: "won", heroPm: 5 })).toBe(false);
  });

  it("traduz efeitos de magia para rótulos da interface", () => {
    expect(combatEffectLabel("heal")).toBe("Cura");
    expect(combatEffectLabel("weaken")).toBe("Enfraquecimento");
  });
});
