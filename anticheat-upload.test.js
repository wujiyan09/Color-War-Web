import { test, expect } from "bun:test";
import { describeMatch } from "./account.js";
test("match record carries the move list, seats, my seat, start and room code for server replay", () => {
  const state = { active: [0, 1], playerTypes: ['human', 'driveBot'], playerNames: ['A', 'B'], winnerIndex: 0, online: false, myPlayerIndex: 0, duelBotStrength: 1, aiLevel: 3, gameMode: 'duel', roomCode: null };
  const replay = { id: 'x1234567', playedAt: Date.now(), boardSize: 5, colors: [], moves: [{ row: 0, column: 0, player: 0 }, { row: 4, column: 4, player: 1 }] };
  const r = describeMatch(state, replay);
  expect(r.moveList).toEqual([[0, 0, 0], [4, 4, 1]]);
  expect(r.seats).toEqual([0, 1]); expect(r.mySeat).toBe(0); expect(r.start).toBe('duel'); expect(r.roomCode).toBe(null);
  const o = describeMatch({ ...state, online: true, gameMode: 'online', roomCode: '123456', playerTypes: ['human', 'human'] }, replay);
  expect(o.start).toBe('empty'); expect(o.roomCode).toBe('123456');
});
