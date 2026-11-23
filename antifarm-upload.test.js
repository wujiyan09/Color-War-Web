import { test, expect } from "bun:test";
import { describeMatch } from "./account.js";
test("upload carries move list [seat,row,col], final board, and restored flag only when restored", () => {
  const state = { active: [0, 1], playerTypes: ['human', 'driveBot'], playerNames: ['A', 'B'], winnerIndex: 0, online: false, myPlayerIndex: 0, duelBotStrength: 1, aiLevel: 3 };
  const replay = { id: 'x1234567', playedAt: Date.now(), boardSize: 5, colors: [], frames: ['00', '1F'], moves: [{ row: 2, column: 3, player: 0 }, { row: 4, column: 1, player: 1 }] };
  const r = describeMatch(state, replay);
  expect(r.moveList).toEqual([[0, 2, 3], [1, 4, 1]]);
  expect(r.finalBoard).toBe('1F');
  expect('restored' in r).toBe(false);
  expect(describeMatch(state, { ...replay, restored: true }).restored).toBe(true);
});
