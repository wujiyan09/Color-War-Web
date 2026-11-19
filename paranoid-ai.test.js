import test from "node:test";
import assert from "node:assert/strict";
import { chooseParanoidMove } from "./paranoid-ai.js";
import { chooseDriveDuelMove } from "./drive-duel-ai.js";

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

test("party Bot 3 plays legal full games with 3 and 4 players", () => {
  for (const n of [3, 4]) {
    const size = 6;
    const b = Array.from({ length: size }, () => Array.from({ length: size }, () => ({ owner: null, count: 0 })));
    const entered = new Array(n).fill(false), elim = new Array(n).fill(false);
    let cur = 0, moves = 0;
    while (moves < 400) {
      const alive = [...Array(n).keys()].filter(p => !elim[p]);
      let m;
      if (cur === 0) {
        m = alive.length > 2
          ? chooseParanoidMove({ board: b, players: alive, currentPlayer: cur, hasEntered: entered, eliminated: elim, movesPlayed: 0 })
          : chooseDriveDuelMove({ board: b, activePlayers: alive, currentPlayer: cur, hasEntered: entered, difficulty: 3, movesPlayed: 0, strength: 1 });
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
    assert.equal(elim[0], false, `Bot 3 survived ${n}-player game`);
  }
});
