import test from "node:test";
import assert from "node:assert/strict";
import { DRIVE_DIFFICULTY, chooseDriveDuelMove, quietHeuristic } from "./drive-duel-ai.js";

const empty = (size) => Array.from({ length: size }, () => Array.from({ length: size }, () => ({ owner: null, count: 0 })));

test("Drive difficulty parameters are applied to all Color War AI levels", () => {
  assert.deepEqual(DRIVE_DIFFICULTY[1], { name: "easy", timeMs: 80, maxDepth: 1, randomize: true });
  assert.deepEqual(DRIVE_DIFFICULTY[2], { name: "medium", timeMs: 1200, maxDepth: 8, randomize: false });
  assert.deepEqual(DRIVE_DIFFICULTY[3], { name: "hard", timeMs: 6000, maxDepth: 32, randomize: false });
  assert.deepEqual(DRIVE_DIFFICULTY[4], DRIVE_DIFFICULTY[3]);
});

test("empty-board first placement returns a legal square under Color War entry rules", () => {
  const move = chooseDriveDuelMove({ board: empty(5), activePlayers: [0, 1], currentPlayer: 0, hasEntered: [false, false], difficulty: 1 });
  assert.ok(move);
  assert.ok(move.r >= 0 && move.r < 5 && move.c >= 0 && move.c < 5);
});

test("post-entry moves are restricted to the current player's pieces", () => {
  const board = empty(5);
  board[1][2] = { owner: 0, count: 2 };
  board[3][4] = { owner: 1, count: 3 };
  const move = chooseDriveDuelMove({ board, activePlayers: [0, 1], currentPlayer: 0, hasEntered: [true, true], difficulty: 1 });
  assert.deepEqual(move && [move.r, move.c], [1, 2]);
});

test("invalid or non-duel input does not manufacture a move", () => {
  assert.equal(chooseDriveDuelMove({ board: empty(5), activePlayers: [0, 1, 2], currentPlayer: 0 }), null);
  assert.equal(chooseDriveDuelMove({ board: empty(13), activePlayers: [0, 1], currentPlayer: 0 }), null);
});


test("easy threat heuristic penalizes hanging a 3-charge cell beside an enemy 3", () => {
  const board = empty(5);
  board[2][2] = { owner: 0, count: 2 };
  board[2][3] = { owner: 1, count: 3 };
  board[1][2] = { owner: 0, count: 3 };
  board[4][4] = { owner: 0, count: 2 };
  const cells = new Uint8Array(board.flatMap(row => row.map(cell => cell.owner === null ? 0 : ((cell.owner + 1) << 4) | cell.count)));
  const risky = quietHeuristic(cells, 2 * 5 + 2, 0, [true, true], 5);
  const safe = quietHeuristic(cells, 4 * 5 + 4, 0, [true, true], 5);
  assert.ok(risky < safe, `risky=${risky}, safe=${safe}`);
});
