import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { chooseBeginnerMove, rankedCandidates, legalMoves, applyMove, BEGINNER_AI_KEY } from "./duel-beginner-bot.js";
import { chooseDriveDuelMove } from "./drive-duel-ai.js";

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const empty = n => Array.from({ length: n }, () => Array.from({ length: n }, () => ({ owner: null, count: 0 })));
function duelStart(n) { const b = empty(n); b[0][0] = { owner: 0, count: 1 }; b[n - 1][n - 1] = { owner: 1, count: 1 }; return b; }
function playGameRules(board, r, c, side) {
  // simple reference: same rules as the wrapper (used only to advance random games)
  const n = board.length, cells = board.flat().map(x => ({ o: x.count > 0 ? x.owner : -1, k: x.count }));
  const next = applyMove(cells, r * n + c, side, true);
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => { const x = next[i * n + j]; return x.k > 0 ? { owner: x.o, count: x.k } : { owner: null, count: 0 }; }));
}

test("入门 only ever picks legal moves (own cell once entered) across random games", () => {
  const rand = rng(7);
  for (const n of [5, 6, 9]) {
    let board = duelStart(n), side = 0;
    for (let ply = 0; ply < 60; ply++) {
      const m = chooseBeginnerMove({ board, activePlayers: [0, 1], currentPlayer: side, hasEntered: [true, true], random: rand });
      const own = board.flat().filter(x => x.owner === side && x.count > 0).length, opp = board.flat().filter(x => x.owner === 1 - side && x.count > 0).length;
      if (!own || !opp) break;
      expect(m).not.toBeNull();
      expect(board[m.r][m.c].owner).toBe(side);
      expect(board[m.r][m.c].count).toBeGreaterThan(0);
      board = playGameRules(board, m.r, m.c, side); side = 1 - side;
    }
  }
});

test("first move before entering is an empty cell; non-seat owners map correctly", () => {
  const b = empty(6); b[2][2] = { owner: 3, count: 2 };
  const m = chooseBeginnerMove({ board: b, activePlayers: [3, 5], currentPlayer: 5, hasEntered: [false, false, false, true, false, false], random: rng(1) });
  expect(b[m.r][m.c].count).toBe(0);
});

test("distribution: varied but mostly sensible (top-ranked move chosen often, not always)", () => {
  const b = duelStart(6); b[0][1] = { owner: 0, count: 2 }; b[1][0] = { owner: 0, count: 3 }; b[4][5] = { owner: 1, count: 2 }; b[5][4] = { owner: 1, count: 3 };
  const cells = b.flat().map(x => ({ o: x.count > 0 ? x.owner : -1, k: x.count }));
  const ranked = rankedCandidates(cells, 0, [true, true]);
  const counts = {}; const rand = rng(42);
  for (let i = 0; i < 2000; i++) { const m = chooseBeginnerMove({ board: b, activePlayers: [0, 1], currentPlayer: 0, hasEntered: [true, true], random: rand }); const k = m.r * 6 + m.c; counts[k] = (counts[k] || 0) + 1; }
  expect(Object.keys(counts).length).toBeGreaterThan(1);            // not deterministic
  const top3 = new Set(ranked.slice(0, 3).map(x => x.move));
  const inTop3 = Object.entries(counts).filter(([k]) => top3.has(Number(k))).reduce((a, [, v]) => a + v, 0);
  expect(inTop3 / 2000).toBeGreaterThan(0.6);                         // mostly reasonable
  expect(Math.max(...Object.values(counts)) / 2000).toBeLessThan(0.95);
});

test("existing levels unchanged and still route to the engine", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  expect(html).toContain("if (duelBotStrength === 0 && this.playerType === 'driveBot')");
  expect(html).toContain("openingSeed: gameSessionSeed, strength: duelBotStrength");
  const m = chooseDriveDuelMove({ board: duelStart(6), activePlayers: [0, 1], currentPlayer: 0, hasEntered: [true, true], difficulty: 3, movesPlayed: 0, strength: 1 });
  expect(m).not.toBeNull();
  const acc = readFileSync(new URL("./account.js", import.meta.url), "utf8");
  expect(acc).toContain("aiKey = `bot3-s${state.duelBotStrength}`");
  expect(BEGINNER_AI_KEY).toBe("bot3-s0");
});

test("engine files untouched (0-line diff vs origin/main)", () => {
  const d = execSync("git diff origin/main --stat -- drive-duel-ai.js botpick-engine.js bot12-ai.js paranoid-ai.js analyzer-worker.js", { cwd: new URL(".", import.meta.url).pathname }).toString();
  expect(d.trim()).toBe("");
});
