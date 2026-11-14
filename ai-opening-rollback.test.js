import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chooseDriveDuelMove } from "./drive-duel-ai.js";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const start = html.indexOf("        class AISolver {");
const end = html.indexOf("\n        window.addEventListener", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const AISolver = new Function("MAX_PLAYERS", "chooseDriveDuelMove", `${html.slice(start, end)}; return AISolver;`)(8, chooseDriveDuelMove);

function grid(size = 5, occupied = null) {
  return Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => ({
    owner: occupied && occupied.r === r && occupied.c === c ? occupied.owner : null,
    count: occupied && occupied.r === r && occupied.c === c ? occupied.count : 0,
  })));
}

function solver({ active = [0, 1], current = 0, entered = [false, false], eliminated = [false, false], cells = grid(), playerType = "mathNightmare", level = 1, isLocalDuel = false } = {}) {
  return new AISolver(cells.length, active, current, playerType, level, cells, entered, eliminated, isLocalDuel);
}

test("all four difficulty levels retain the old path for non-duel local games", () => {
  for (const playerType of ["mathNightmare", "enhancedNightmare"]) {
    for (const level of [1, 2, 3, 4]) {
      const ai = solver({ playerType, level });
      assert.deepEqual(ai.calculateBestMove(), { r: 2, c: 2 }, `${playerType}, level ${level}`);
    }
  }
});

test("multiplayer first placement retains the non-corner safeguard", () => {
  const ai = solver({ active: [0, 1, 2], entered: [false, false, false] });
  assert.equal(ai.isCornerCell({ r: 0, c: 0 }), true);
  assert.equal(ai.isCornerCell({ r: 2, c: 2 }), false);
  const move = ai.calculateBestMove();
  assert.equal(ai.isCornerCell(move), false);
});

test("local duel route supplies current game state and selected difficulty to Drive engine", () => {
  const observed = [];
  const fakeDriveChooser = (args) => { observed.push(args); return { r: 1, c: 3 }; };
  const DriveAISolver = new Function("MAX_PLAYERS", "chooseDriveDuelMove", `${html.slice(start, end)}; return AISolver;`)(8, fakeDriveChooser);
  for (const level of [1, 2, 3, 4]) {
    const game = new DriveAISolver(5, [0, 1], 1, "enhancedNightmare", level, grid(5, { r: 1, c: 3, owner: 1, count: 2 }), [true, true], [false, false], true);
    assert.deepEqual(game.calculateBestMove(), { r: 1, c: 3 });
  }
  assert.deepEqual(observed.map(x => x.difficulty), [1, 2, 3, 4]);
  assert.deepEqual(observed[0].activePlayers, [0, 1]);
  assert.equal(observed[0].currentPlayer, 1);
  assert.equal(observed[0].hasEntered[1], true);
});

test("Drive AI is gated to explicit local-duel mode, not merely two active seats", () => {
  assert.match(html, /isDuelGame && !currentRoomId/);
  assert.match(html, /isDuelGame = true/);
  assert.match(html, /isDuelGame = false/);
  assert.match(html, /if \(this\.isLocalDuel\)/);
});
