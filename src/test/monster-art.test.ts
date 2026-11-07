import { describe, expect, it } from "vitest";
import { getMonsterArtwork } from "@/lib/monster-art";

describe("catálogo de ilustrações dos monstros", () => {
  it.each([
    ["Goblin", "/monsters/goblin.svg"],
    ["Lobo Atroz", "/monsters/dire-wolf.svg"],
    ["Esqueleto", "/monsters/skeleton.svg"],
    ["Orc Saqueador", "/monsters/orc-raider.svg"],
    ["Troll das Cavernas", "/monsters/cave-troll.svg"],
  ])("seleciona a arte correta para %s", (name, expected) => {
    expect(getMonsterArtwork(name).src).toBe(expected);
  });

  it("ignora diferenças de acentuação e caixa", () => {
    expect(getMonsterArtwork("LOBO ÁTROZ").src).toBe("/monsters/dire-wolf.svg");
  });

  it("usa uma ilustração de reserva para monstros ainda sem arte própria", () => {
    expect(getMonsterArtwork("Dragão Ancião").src).toBe("/monsters/abyssal-beast.svg");
    expect(getMonsterArtwork(undefined).alt).toContain("Fera das sombras");
  });
});
