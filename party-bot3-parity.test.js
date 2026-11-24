import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { paranoidParameters } from "./paranoid-ai.js";
import { describeMatch, displayAILabel } from "./account.js";

// iOS reference (Color-War-AI, Nov15ParanoidSearch.parameters / AIEngine party routing), 2026-11-24.
const IOS_PARANOID = { early: [400, 120, 40, 8], later: [5000, 600, 80, 32] };

test("party Bot 3 paranoid budgets match iOS", () => {
  const p = m => { const x = paranoidParameters(m); return [x.timeMs, x.softTimeMs, x.minTimeMs, x.maxDepth]; };
  assert.deepEqual(p(0), IOS_PARANOID.early);
  assert.deepEqual(p(29), IOS_PARANOID.early);
  assert.deepEqual(p(30), IOS_PARANOID.later);
});

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const start = html.indexOf("        class AISolver {");
const end = html.indexOf("\n        window.addEventListener", start);
function solverWith(fakes) {
  return new Function("MAX_PLAYERS", "chooseDriveDuelMove", "chooseParanoidMove", "localMovesPlayed", "gameSessionSeed", "duelBotStrength",
    `${html.slice(start, end)}; return AISolver;`)(8, fakes.duel, fakes.para, 12, "seed", 1);
}
const grid = n => Array.from({ length: n }, () => Array.from({ length: n }, () => ({ owner: null, count: 0 })));

test("party Bot 3 routes like iOS for 2-seat and 3-4 seat games (full strength, no weak, no opening)", () => {
  for (const seats of [2, 3, 4]) {
    const calls = [];
    const AISolver = solverWith({
      duel: a => { calls.push(["duel", a]); return { r: 0, c: 0 }; },
      para: a => { calls.push(["para", a]); return { r: 0, c: 0 }; },
    });
    const active = [...Array(seats).keys()];
    const ai = new AISolver(5, active, 0, "driveBot", 2, grid(5), active.map(() => false), active.map(() => false), false, 12);
    ai.calculateBestMove();
    assert.equal(calls.length, 1, `${seats} seats`);
    const [kind, a] = calls[0];
    assert.equal(kind, seats === 2 ? "duel" : "para");
    assert.equal(a.weak, undefined);
    assert.equal(a.movesPlayed, 12);
    if (kind === "duel") { assert.equal(a.difficulty, 3); assert.equal(a.strength, undefined); assert.equal(a.openingSeed, undefined); }
  }
});

test("party 1v1 Bot 3 record shows 'Bot 3', duel shows 'Bot 0 · tier'", () => {
  const base = { active: [0, 1], playerTypes: ["human", "driveBot"], playerNames: ["Sam", "Bot"], winnerIndex: 0, online: false, myPlayerIndex: 0, duelBotStrength: 4, aiLevel: 2 };
  const replay = { id: "x", playedAt: Date.now(), boardSize: 6, colors: ["f00", "00f"], moves: [], frames: [] };
  assert.equal(displayAILabel(describeMatch({ ...base, gameMode: "party" }, replay).aiLabel), "Bot 3");
  assert.equal(displayAILabel(describeMatch({ ...base, gameMode: "duel" }, replay).aiLabel), "Bot 0 · 困难+");
});
