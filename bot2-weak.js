// Bot 2 in party / online games (2026-11-24): Bot 3's engines, weakened.
// 3+ alive -> paranoid-ai.js, 2 alive -> drive-duel-ai.js (no opening book),
// both called with `weak: true`. Same evaluation weights and move ordering as
// Bot 3; only the budgets below and a small root mistake are different.
// Mirrors iOS Bot2Weak.swift (keep the numbers identical).
export const BOT2_MISTAKE_RATE = 0.15;
export const BOT2_MISTAKE_WINDOW = 30;

// < 30 plies: depth 4, 150 ms. Later: depth 8, 800 ms.
export function bot2Limits(movesPlayed = 0) {
  return movesPlayed < 30
    ? { timeMs: 150, softTimeMs: 50, minTimeMs: 20, maxDepth: 4 }
    : { timeMs: 800, softTimeMs: 250, minTimeMs: 40, maxDepth: 8 };
}

// Picks uniformly among qualifying near-best moves (rng in [0, 1)).
export function bot2Pick(candidates, rng) {
  if (!candidates.length) return null;
  const index = Math.floor(rng() * candidates.length);
  return candidates[Math.max(0, Math.min(candidates.length - 1, index))];
}
