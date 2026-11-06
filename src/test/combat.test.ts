import { describe, expect, it } from "vitest";
import { COMBAT_ACTIONS, isCombatActionAvailable, type CombatState } from "@/lib/combat";

const activeState = {
  status: "active",
  heroPm: 1,
  heroPv: 4,
  heroMaxPv: 10,
} as Pick<CombatState, "status" | "heroPm" | "heroPv" | "heroMaxPv">;

describe("ações do combate por turnos", () => {
  it("apresenta as quatro ações táticas", () => {
    expect(COMBAT_ACTIONS.map((action) => action.id)).toEqual([
      "attack",
      "power",
      "defend",
      "recover",
    ]);
  });

  it("mantém ataques e defesa disponíveis sem PM", () => {
    const state = { ...activeState, heroPm: 0 };
    expect(isCombatActionAvailable("attack", state)).toBe(true);
    expect(isCombatActionAvailable("defend", state)).toBe(true);
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
});
