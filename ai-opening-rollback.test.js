import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const start = html.indexOf("        class AISolver {");
const end = html.indexOf("\n        window.addEventListener", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const AISolver = new Function("MAX_PLAYERS", `${html.slice(start, end)}; return AISolver;`)(8);

function grid(size = 5, occupied = null) {
  return Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => ({
    owner: occupied && occupied.r === r && occupied.c === c ? occupied.owner : null,
    count: occupied && occupied.r === r && occupied.c === c ? occupied.count : 0,
  })));
}

function solver({ active = [0, 1], current = 0, entered = [false, false], eliminated = [false, false], cells = grid(), playerType = "mathNightmare", level = 1 } = {}) {
  return new AISolver(cells.length, active, current, playerType, level, cells, entered, eliminated);
}

test("all four difficulty levels and both AI variants use the legacy two-player opening", () => {
  for (const playerType of ["mathNightmare", "enhancedNightmare"]) {
    for (const level of [1, 2, 3, 4]) {
      const ai = solver({ playerType, level });
      assert.deepEqual(ai.calculateBestMove(), { r: 2, c: 2 }, `${playerType}, level ${level}`);
    }
  }
  assert.equal(html.includes("driveOpeningMove"), false);
  assert.equal(html.includes("driveMovePriority"), false);
});

test("multiplayer first placement retains the non-corner safeguard", () => {
  const ai = solver({ active: [0, 1, 2], entered: [false, false, false] });
  assert.equal(ai.isCornerCell({ r: 0, c: 0 }), true);
  assert.equal(ai.isCornerCell({ r: 2, c: 2 }), false);
  const move = ai.calculateBestMove();
  assert.equal(ai.isCornerCell(move), false);
});

test("legacy heuristic search remains and Drive search methods are absent", () => {
  assert.match(html, /evaluateMovePriority\(move\)/);
  assert.equal(html.includes("driveSearch"), false);
  assert.equal(html.includes("driveOpeningMove"), false);
});
