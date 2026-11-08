export type TwentyOneOutcome = "won" | "lost" | "push";
export type TwentyOneSuit = "S" | "H" | "D" | "C";

export type TwentyOneHand = {
  total: number;
  soft: boolean;
  bust: boolean;
  natural: boolean;
};

/** Cards use the server representation: "A|S", "10|H", "K|D". */
export function scoreTwentyOneHand(cards: string[]): TwentyOneHand {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    const rank = String(card).split("|")[0]?.toUpperCase();
    if (rank === "A") {
      total += 1;
      aces += 1;
    } else if (rank === "K" || rank === "Q" || rank === "J") {
      total += 10;
    } else {
      const value = Number(rank);
      if (!Number.isInteger(value) || value < 2 || value > 10) {
        throw new Error(`Carta inválida: ${card}`);
      }
      total += value;
    }
  }
  const soft = aces > 0 && total + 10 <= 21;
  if (soft) total += 10;
  return {
    total,
    soft,
    bust: total > 21,
    natural: cards.length === 2 && total === 21,
  };
}

/** House strategy: hit below 17 and also hit a soft 17. */
export function dealerShouldHit(cards: string[]): boolean {
  const hand = scoreTwentyOneHand(cards);
  return hand.total < 17 || (hand.total === 17 && hand.soft);
}

/** Gross payout; the stake was already deducted when the round started. */
export function calculateTwentyOnePayout(wager: number, outcome: TwentyOneOutcome): {
  payout: number;
  net: number;
} {
  const safeWager = Number.isFinite(wager) ? Math.max(0, Math.floor(wager)) : 0;
  const payout = outcome === "won" ? safeWager * 2 : outcome === "push" ? safeWager : 0;
  return { payout, net: payout - safeWager };
}

/** Maximum optional stake, matching the current tavern wager limit. */
export function maxTwentyOneWager(coins: number): number {
  return Number.isFinite(coins) && coins > 0 ? Math.floor(coins / 2) : 0;
}

export function cardRank(card: string): string {
  return String(card).split("|")[0] ?? "";
}

export function cardSuit(card: string): TwentyOneSuit {
  const suit = String(card).split("|")[1];
  if (suit === "S" || suit === "H" || suit === "D" || suit === "C") return suit;
  throw new Error(`Naipe inválido: ${card}`);
}
