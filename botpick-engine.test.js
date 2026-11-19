import { test, expect } from "bun:test";
import { applyMove, bestMove, analyzerBestMove, encode, owner, charge } from "./botpick-engine.js";
test("placement adds one and chain explodes (Dots rules)", () => {
  const cells = new Array(9).fill(0); cells[4] = encode(0, 3); cells[0] = encode(1, 1);
  const t = applyMove({ cells, size: 3, side: 0, movesRed: 1, movesBlue: 1, move: 4 });
  expect(t.cells[4]).toBe(0);
  expect(owner(t.cells[1])).toBe(0); expect(charge(t.cells[1])).toBe(1);
});
test("illegal move rejected", () => {
  const cells = new Array(9).fill(0); cells[0] = encode(1, 1);
  expect(applyMove({ cells, size: 3, side: 0, movesRed: 1, movesBlue: 1, move: 0 })).toBeNull();
});
test("analyzer returns own cell", () => {
  const cells = new Array(36).fill(0); cells[0] = encode(0, 1); cells[35] = encode(1, 1); cells[7] = encode(0, 2);
  const m = analyzerBestMove({ cells, size: 6, side: 0, timeMs: 200 });
  expect(owner(cells[m])).toBe(0);
});
