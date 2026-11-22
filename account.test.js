import test from "node:test";
import assert from "node:assert/strict";
import { encodeFrame, decodeCell, describeMatch } from "./account.js";

test("replay frames round-trip owner and count", () => {
  const board = [[{ owner: 0, count: 3 }, { owner: null, count: 0 }], [{ owner: 1, count: 1 }, { owner: 7, count: 2 }]];
  const f = encodeFrame(board);
  assert.deepEqual(decodeCell(f, 2, 0, 0), { owner: 0, count: 3 });
  assert.deepEqual(decodeCell(f, 2, 0, 1), { owner: null, count: 0 });
  assert.deepEqual(decodeCell(f, 2, 1, 1), { owner: 7, count: 2 });
});

test("1 human vs 1 Bot 3 is a ranked vsAI match", () => {
  const state = { active: [0, 1], playerTypes: ["human", "driveBot"], playerNames: ["Sam", "Bot"], winnerIndex: 0,
    online: false, myPlayerIndex: 0, duelBotStrength: 4, aiLevel: 2 };
  const replay = { id: "x", playedAt: Date.now(), boardSize: 6, colors: ["ff0000", "0000ff"], moves: [{ player: 0 }, { player: 1 }, { player: 0 }] };
  const m = describeMatch(state, replay);
  assert.equal(m.mode, "vsAI");
  assert.equal(m.aiKey, "bot3-s4");
  assert.equal(m.result, "win");
  assert.equal(m.myMoves, 2);
});
