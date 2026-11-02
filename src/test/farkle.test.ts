import { describe, expect, it } from "vitest";
import {
  bestScoringSelection,
  calculateFarkleSettlement,
  createMachineStrategy,
  farkleProbability,
  maxFarkleWager,
  hasScoringCombination,
  machineShouldBank,
  nextRollCount,
  scoreDiceSelection,
} from "@/lib/farkle";

describe("pontuação do Jogo de Dados", () => {
  it("identifica um Farkle quando não há combinação pontuadora", () => {
    expect(hasScoringCombination([2, 3, 4, 6, 2, 3])).toBe(false);
    expect(scoreDiceSelection([2, 3])).toBe(0);
  });

  it("pontua trincas de todos os valores", () => {
    expect(scoreDiceSelection([1, 1, 1])).toBe(1_000);
    expect(scoreDiceSelection([2, 2, 2])).toBe(200);
    expect(scoreDiceSelection([3, 3, 3])).toBe(300);
    expect(scoreDiceSelection([4, 4, 4])).toBe(400);
    expect(scoreDiceSelection([5, 5, 5])).toBe(500);
    expect(scoreDiceSelection([6, 6, 6])).toBe(600);
  });

  it("dobra o valor para quatro, cinco e seis dados iguais", () => {
    expect(scoreDiceSelection([1, 1, 1, 1])).toBe(2_000);
    expect(scoreDiceSelection([1, 1, 1, 1, 1])).toBe(4_000);
    expect(scoreDiceSelection([1, 1, 1, 1, 1, 1])).toBe(8_000);
    expect(scoreDiceSelection([6, 6, 6, 6, 6, 6])).toBe(4_800);
  });

  it("pontua sequências de cinco e seis dados", () => {
    expect(scoreDiceSelection([1, 2, 3, 4, 5])).toBe(500);
    expect(scoreDiceSelection([2, 3, 4, 5, 6])).toBe(750);
    expect(scoreDiceSelection([1, 2, 3, 4, 5, 6])).toBe(1_500);
  });

  it("soma combinações independentes de 1 e 5", () => {
    expect(scoreDiceSelection([1, 5])).toBe(150);
    expect(scoreDiceSelection([1, 1, 1, 5])).toBe(1_050);
    expect(scoreDiceSelection([1, 5, 2])).toBe(0);
    expect(scoreDiceSelection([1, 2])).toBe(0);
    expect(scoreDiceSelection([2, 2, 3, 3, 4, 4])).toBe(0);
  });

  it("permite utilizar apenas parte dos dados e não mistura lançamentos", () => {
    const best = bestScoringSelection([1, 2, 3, 4, 6, 2]);
    expect(best?.score).toBe(100);
    expect(best?.faces).toEqual([1]);
    expect(scoreDiceSelection([1, 1])).toBe(200);
    expect(scoreDiceSelection([1, 2, 3, 4, 5])).toBe(500);
    const firstThrow = bestScoringSelection([1, 2, 3]);
    const secondThrow = bestScoringSelection([2, 3, 4]);
    expect(firstThrow?.score).toBe(100);
    expect(secondThrow).toBeNull();
  });

  it("seleciona a sequência completa usando os seis dados na mesma jogada", () => {
    const selection = bestScoringSelection([1, 2, 3, 4, 5, 6]);
    expect(selection?.score).toBe(1_500);
    expect(selection?.indices).toHaveLength(6);
  });

  it("libera os seis dados novamente quando todos foram pontuados", () => {
    expect(nextRollCount(2)).toBe(4);
    expect(nextRollCount(5)).toBe(1);
    expect(nextRollCount(6)).toBe(6);
  });

  it("calcula risco de Farkle conforme a quantidade de dados", () => {
    expect(farkleProbability(1)).toBeCloseTo(2 / 3, 5);
    expect(farkleProbability(2)).toBeCloseTo(4 / 9, 5);
    expect(farkleProbability(6)).toBeGreaterThan(0);
    expect(farkleProbability(6)).toBeLessThan(farkleProbability(1));
  });

  it("a máquina encerra ao alcançar a meta e assume riscos quando está atrás", () => {
    expect(machineShouldBank({ machineTotal: 3_700, playerTotal: 3_500, turnPoints: 400, diceRemaining: 3 })).toBe(true);
    expect(machineShouldBank({ machineTotal: 900, playerTotal: 2_100, turnPoints: 500, diceRemaining: 5 })).toBe(false);
    expect(machineShouldBank({ machineTotal: 2_000, playerTotal: 1_700, turnPoints: 650, diceRemaining: 2 })).toBe(true);
  });

  it("a estratégia pesa o placar e o risco real dos dados antes de guardar", () => {
    const leading = createMachineStrategy({ machineTotal: 1_950, playerTotal: 1_250 });
    const trailing = createMachineStrategy({ machineTotal: 1_250, playerTotal: 1_950 });

    expect(leading.shouldBank(200, 1, 4)).toBe(true);
    expect(trailing.shouldBank(200, 1, 4)).toBe(false);
  });

  it("a máquina escolhe apenas dados pontuadores do lançamento atual", () => {
    const strategy = createMachineStrategy({ machineTotal: 1_000, playerTotal: 1_200 });
    const roll = [1, 1, 1, 2, 3, 4];
    const choice = strategy.chooseSelection(roll, 300, 3);

    expect(choice).not.toBeNull();
    if (!choice) throw new Error("A IA deveria encontrar uma combinação pontuadora.");

    expect(choice.score).toBe(scoreDiceSelection(choice.faces));
    expect(choice.indices).toHaveLength(choice.faces.length);
    expect(choice.indices.every((index, position) => roll[index] === choice.faces[position])).toBe(true);
  });

  it("a IA sempre guarda imediatamente quando já alcançou os 4.000 pontos", () => {
    const strategy = createMachineStrategy({ machineTotal: 3_700, playerTotal: 3_600 });
    expect(strategy.shouldBank(300, 6, 4)).toBe(true);
  });

  it("limita a aposta opcional a metade do saldo atual", () => {
    expect(maxFarkleWager(100)).toBe(50);
    expect(maxFarkleWager(101)).toBe(50);
    expect(maxFarkleWager(1)).toBe(0);
    expect(maxFarkleWager(0)).toBe(0);
    expect(maxFarkleWager(-40)).toBe(0);
  });

  it("devolve a aposta e paga 50% de lucro na vitória", () => {
    expect(calculateFarkleSettlement(100, true)).toEqual({
      payout: 150,
      profit: 50,
      net: 50,
    });
    expect(calculateFarkleSettlement(11, true)).toEqual({
      payout: 16,
      profit: 5,
      net: 5,
    });
  });

  it("perde toda a aposta na derrota e não altera moedas sem aposta", () => {
    expect(calculateFarkleSettlement(100, false)).toEqual({
      payout: 0,
      profit: 0,
      net: -100,
    });
    expect(calculateFarkleSettlement(0, true)).toEqual({
      payout: 0,
      profit: 0,
      net: 0,
    });
  });

});
