import { describe, expect, it } from "vitest";
import {
  calculateTwentyOnePayout,
  cardRank,
  cardSuit,
  dealerShouldHit,
  maxTwentyOneWager,
  scoreTwentyOneHand,
} from "@/lib/twentyone";

describe("regras do 21", () => {
  it("calcula cartas numéricas e figuras", () => {
    expect(scoreTwentyOneHand(["10|S", "K|H"])).toMatchObject({ total: 20, soft: false, bust: false, natural: false });
    expect(scoreTwentyOneHand(["Q|D", "7|C"])).toMatchObject({ total: 17, soft: false });
  });

  it("usa o Ás como 11 quando não estoura e como 1 quando necessário", () => {
    expect(scoreTwentyOneHand(["A|S", "6|H"])).toMatchObject({ total: 17, soft: true });
    expect(scoreTwentyOneHand(["A|S", "6|H", "9|D"])).toMatchObject({ total: 16, soft: false });
    expect(scoreTwentyOneHand(["A|S", "K|H", "9|D"])).toMatchObject({ total: 20, soft: false });
  });

  it("identifica um 21 natural e uma mão estourada", () => {
    expect(scoreTwentyOneHand(["A|S", "K|H"]).natural).toBe(true);
    expect(scoreTwentyOneHand(["K|S", "8|H", "5|D"]).bust).toBe(true);
    expect(scoreTwentyOneHand(["7|S", "7|H", "7|D"]).natural).toBe(false);
  });

  it("a casa compra abaixo de 17 e em 17 suave, mas para em 17 duro", () => {
    expect(dealerShouldHit(["10|S", "6|H"])).toBe(true);
    expect(dealerShouldHit(["A|S", "6|H"])).toBe(true);
    expect(dealerShouldHit(["10|S", "7|H"])).toBe(false);
    expect(dealerShouldHit(["A|S", "6|H", "10|D"])).toBe(false);
  });

  it("paga o dobro bruto ao vencer e devolve a aposta em empate", () => {
    expect(calculateTwentyOnePayout(10, "won")).toEqual({ payout: 20, net: 10 });
    expect(calculateTwentyOnePayout(10, "push")).toEqual({ payout: 10, net: 0 });
    expect(calculateTwentyOnePayout(10, "lost")).toEqual({ payout: 0, net: -10 });
  });

  it("limita a aposta à metade do saldo e interpreta as cartas", () => {
    expect(maxTwentyOneWager(101)).toBe(50);
    expect(maxTwentyOneWager(1)).toBe(0);
    expect(cardRank("A|S")).toBe("A");
    expect(cardSuit("10|H")).toBe("H");
  });
});
