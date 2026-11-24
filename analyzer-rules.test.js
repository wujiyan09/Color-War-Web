import test from "node:test";
import assert from "node:assert/strict";
import { applyMove, encode, owner, charge } from "./botpick-engine.js";

// Pure copy of index.html executeMove (minus animation) + updateEliminationStatus/checkGameOver for 2 entered players.
function gameExecute(board, n, row, col, player) {
  board[row][col].owner = player; board[row][col].count += 1;
  let wave = board[row][col].count >= 4 ? [[row, col]] : [];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while (wave.length > 0) {
    const exploding = wave.filter(([r, c]) => board[r]?.[c]?.count >= 4);
    if (!exploding.length) break;
    const transfers = [];
    exploding.forEach(([r, c]) => dirs.forEach(([dr, dc]) => { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < n && nc >= 0 && nc < n) transfers.push([nr, nc]); }));
    exploding.forEach(([r, c]) => { board[r][c].count -= 4; board[r][c].owner = board[r][c].count === 0 ? null : player; });
    const changed = new Set();
    transfers.forEach(([r, c]) => { board[r][c].owner = player; board[r][c].count += 1; changed.add(r * n + c); });
    wave = [...changed].map(i => [Math.floor(i / n), i % n]).filter(([r, c]) => board[r][c].count >= 4);
  }
  const alive = [0, 1].filter(p => board.some(row => row.some(c => c.owner === p)));
  return alive.length <= 1 ? (alive[0] ?? -1) : null;
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

test("analyzer simulate == game executeMove (Color War rules) over thousands of random positions", () => {
  const R = rng(12345);
  let checked = 0, cascades = 0, remainders = 0;
  for (let t = 0; t < 4000; t++) {
    const n = [3, 4, 5, 6, 9, 12][t % 6];
    const board = Array.from({ length: n }, () => Array.from({ length: n }, () => {
      const x = R(); return x < 0.35 ? { owner: null, count: 0 } : { owner: R() < 0.5 ? 0 : 1, count: 1 + Math.floor(R() * (R() < 0.1 ? 6 : 3)) };
    }));
    const side = R() < 0.5 ? 0 : 1;
    const own = []; board.forEach((row, r) => row.forEach((c, k) => { if (c.owner === side) own.push([r, k]); }));
    if (!own.length || !board.some(row => row.some(c => c.owner === 1 - side))) continue;
    const [r, c] = own[Math.floor(R() * own.length)];
    const cells = board.flat().map(x => x.owner === null ? 0 : encode(x.owner, x.count));
    const res = applyMove({ cells, size: n, side, movesRed: 3, movesBlue: 3, move: r * n + c });
    const g = board.map(row => row.map(x => ({ ...x })));
    const winner = gameExecute(g, n, r, c, side);
    if (g.flat().some(x => x.count > 15)) continue;
    const expect = g.flat().map(x => x.owner === null ? 0 : encode(x.owner, x.count));
    assert.deepEqual(res.cells, expect, `t=${t}`);
    assert.equal(res.winner, winner);
    if (res.cascadeFrames.length) cascades++;
    if (res.cascadeFrames.some(f => f.exploding.some(i => charge(f.cells[i]) > 0 && owner(f.cells[i]) === side))) remainders++;
    checked++;
  }
  assert.ok(checked > 3000 && cascades > 300 && remainders > 20, `${checked} ${cascades} ${remainders}`);
});
