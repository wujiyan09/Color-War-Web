import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chooseParanoidMove } from "./paranoid-ai.js";
import { chooseDriveDuelMove } from "./drive-duel-ai.js";
import { BOT2_MISTAKE_RATE, BOT2_MISTAKE_WINDOW, bot2Limits, bot2Pick } from "./bot2-weak.js";

function apply(b, size, r, c, p, entered) {
  const add = entered[p] ? 1 : 3; entered[p] = true;
  b[r][c] = { owner: p, count: b[r][c].count + add };
  let wave = b[r][c].count >= 4 ? [[r, c]] : [];
  while (wave.length) {
    const changed = new Map();
    for (const [i, j] of wave) {
      b[i][j].count -= 4; if (b[i][j].count === 0) b[i][j].owner = null;
      for (const [di, dj] of [[-1,0],[1,0],[0,-1],[0,1]]) { const a = i+di, d = j+dj;
        if (a >= 0 && a < size && d >= 0 && d < size) { b[a][d] = { owner: p, count: b[a][d].count + 1 }; changed.set(a*size+d, [a, d]); } }
    }
    wave = [...changed.values()].filter(([a, d]) => b[a][d].count >= 4);
  }
}
const empty = size => Array.from({ length: size }, () => Array.from({ length: size }, () => ({ owner: null, count: 0 })));

test("Bot 2 parameters match iOS Bot2Weak.swift", () => {
  assert.equal(BOT2_MISTAKE_RATE, 0.05);
  assert.equal(BOT2_MISTAKE_WINDOW, 30);
  assert.deepEqual(bot2Limits(0), { timeMs: 150, softTimeMs: 50, minTimeMs: 20, maxDepth: 4 });
  assert.deepEqual(bot2Limits(29), { timeMs: 150, softTimeMs: 50, minTimeMs: 20, maxDepth: 4 });
  assert.deepEqual(bot2Limits(30), { timeMs: 800, softTimeMs: 250, minTimeMs: 40, maxDepth: 8 });
  assert.equal(bot2Pick([], () => 0), null);
  assert.equal(bot2Pick([7, 8, 9], () => 0), 7);
  assert.equal(bot2Pick([7, 8, 9], () => 0.999), 9);
});

test("Bot 3 (weak = false) never touches the Bot 2 RNG", () => {
  const boom = () => { throw new Error("rng used"); };
  const b = empty(5);
  assert.ok(chooseParanoidMove({ board: b, players: [0, 1, 2], currentPlayer: 0, rng: boom }));
  assert.ok(chooseDriveDuelMove({ board: b, activePlayers: [0, 1], currentPlayer: 0, difficulty: 3, strength: 1, rng: boom }));
});

test("Bot 2 mistake picks a different near-best move only when the gate fires", () => {
  // Empty symmetric board: many opening moves tie, so near-best candidates exist.
  const b = empty(5);
  const best3 = chooseParanoidMove({ board: b, players: [0, 1, 2], currentPlayer: 0, weak: true, rng: () => 0.99 });
  const slip3 = chooseParanoidMove({ board: b, players: [0, 1, 2], currentPlayer: 0, weak: true, rng: () => 0 });
  assert.notDeepEqual(slip3, best3);
  const best2 = chooseDriveDuelMove({ board: b, activePlayers: [0, 1], currentPlayer: 0, difficulty: 3, weak: true, rng: () => 0.99 });
  const slip2 = chooseDriveDuelMove({ board: b, activePlayers: [0, 1], currentPlayer: 0, difficulty: 3, weak: true, rng: () => 0 });
  assert.notDeepEqual({ r: slip2.r, c: slip2.c }, { r: best2.r, c: best2.c });
});

test("Bot 2 stays within its time budget and plays legal full party games", () => {
  for (const n of [2, 3, 4]) {
    const size = 6, b = empty(size);
    const entered = new Array(n).fill(false), elim = new Array(n).fill(false);
    let cur = 0, moves = 0;
    while (moves < 400) {
      const alive = [...Array(n).keys()].filter(p => !elim[p]);
      let m;
      if (cur === 0) {
        const t0 = Date.now();
        m = alive.length > 2
          ? chooseParanoidMove({ board: b, players: alive, currentPlayer: cur, hasEntered: entered, eliminated: elim, movesPlayed: moves, weak: true })
          : chooseDriveDuelMove({ board: b, activePlayers: alive, currentPlayer: cur, hasEntered: entered, difficulty: 3, movesPlayed: moves, weak: true });
        const limit = bot2Limits(moves).timeMs;
        assert.ok(Date.now() - t0 <= limit * 2 + 150, `move took ${Date.now() - t0}ms (limit ${limit})`);
        assert.ok(m);
        const cell = b[m.r][m.c];
        assert.ok(entered[cur] ? cell.owner === cur : cell.owner === null);
      } else {
        const legal = [];
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (entered[cur] ? b[r][c].owner === cur : b[r][c].owner === null) legal.push({ r, c });
        m = legal[(moves * 7) % legal.length];
      }
      apply(b, size, m.r, m.c, cur, entered); moves++;
      for (let p = 0; p < n; p++) if (entered[p] && !b.flat().some(x => x.owner === p)) elim[p] = true;
      if ([...Array(n).keys()].filter(p => !elim[p]).length === 1 && entered.every(Boolean)) break;
      do { cur = (cur + 1) % n; } while (elim[cur]);
    }
  }
});

test("index.html routes party/online Bot 2 to the weakened engines (not duel, not Bot 1/3)", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const i = html.indexOf("if (this.playerType === 'enhancedNightmare') {");
  assert.ok(i > 0);
  const block = html.slice(i, html.indexOf("if (this.playerType === 'driveBot' && this.activePlayers.length > 2)", i));
  assert.match(block, /chooseDriveDuelMove\(\{[^}]*weak: true/);
  assert.match(block, /chooseParanoidMove\(\{[^}]*weak: true/);
  assert.ok(html.indexOf("if (this.isLocalDuel) {") < i, "duel branch handled first");
});

test("record labels: duel Bot 3 shows as Bot 0 · tier, party bots show Bot N only", async () => {
  const { displayAILabel } = await import("./account.js");
  assert.equal(displayAILabel("Bot 3 · 入门"), "Bot 0 · 入门");
  assert.equal(displayAILabel("Bot 3 · 强度 1"), "Bot 0 · 简单");
  assert.equal(displayAILabel("Bot 3 · 强度 4"), "Bot 0 · 困难+");
  assert.equal(displayAILabel("bot3-s3"), "Bot 0 · 困难");
  assert.equal(displayAILabel("Bot 2 · 3档"), "Bot 2");
  assert.equal(displayAILabel("bot1-l2"), "Bot 1");
  assert.equal(displayAILabel("联机"), "联机");
});

test("Bot 3 records on board sizes the duel tab never allowed are party games -> 'Bot 3'", async () => {
  const { displayAILabel } = await import("./account.js");
  assert.equal(displayAILabel("Bot 3 · 强度 2", 5), "Bot 3");
  assert.equal(displayAILabel("Bot 3 · 强度 2", 8), "Bot 3");
  assert.equal(displayAILabel("Bot 3 · 强度 2", 6), "Bot 0 · 中等");
  assert.equal(displayAILabel("Bot 0 · 中等", 5), "Bot 3");
  assert.equal(displayAILabel("Bot 2 · 2档", 5), "Bot 2");
});
