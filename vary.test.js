import test from "node:test";
import assert from "node:assert/strict";
import { chooseDriveDuelMove, seededUnit, VARY_PLIES, VARY_MARGIN } from "./drive-duel-ai.js";

const empty = n => Array.from({ length: n }, () => Array.from({ length: n }, () => ({ owner: null, count: 0 })));

test("vary constants and seeded RNG match iOS", () => {
  assert.equal(VARY_PLIES, 20);
  assert.equal(VARY_MARGIN, 20);
  assert.equal(seededUnit("abc", 0), 0.4710382928606123);
  assert.equal(seededUnit("abc", 1), 0.06878066924400628);
});

test("varySeed: reproducible per seed, varies across seeds, off after ply 20 and when null", () => {
  const b = empty(6);
  const args = { board: b, activePlayers: [0, 1], currentPlayer: 0, difficulty: 3, strength: 1, movesPlayed: 0 };
  const base = chooseDriveDuelMove(args);
  assert.deepEqual(chooseDriveDuelMove({ ...args, varySeed: null }), base);
  const a1 = chooseDriveDuelMove({ ...args, varySeed: "s-1" }), a2 = chooseDriveDuelMove({ ...args, varySeed: "s-1" });
  assert.deepEqual([a1.r, a1.c], [a2.r, a2.c]);
  const seen = new Set();
  for (let i = 0; i < 30; i++) { const m = chooseDriveDuelMove({ ...args, varySeed: `s-${i}` }); seen.add(`${m.r},${m.c}`); }
  assert.ok(seen.size > 1, "different seeds give different openings");
  const late = chooseDriveDuelMove({ ...args, movesPlayed: VARY_PLIES });
  const lateVar = chooseDriveDuelMove({ ...args, movesPlayed: VARY_PLIES, varySeed: "s-3" });
  assert.deepEqual([lateVar.r, lateVar.c], [late.r, late.c]);
});
