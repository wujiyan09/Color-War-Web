// Bot 1 (算法-噩梦 / mathNightmare) and Bot 2 (算法-噩梦 加强 / enhancedNightmare).
// Line-by-line port of iOS AIEngine.swift `AISolver` (non-Bot-3 path):
// opening placement, critical-threat strike (Bot 2), aspiration search with
// enhanced alpha-beta (2 alive) or MaxN beam search (3+ alive), quiescence,
// chain-graph evaluation, multi-target threat bonus, BFS wave simulation.

const MAX_PLAYERS = 8;
const NEG = -1e15, POS = 1e15;

export const AI_LEVELS = Object.freeze({
  1: { title: "1档 · 快手 (极速)", webTitle: "1档 · 快手", description: "深度 2-3 层 | 基础评估", beamWidth: 2, timeBudget: 0.08 },
  2: { title: "2档 · 平衡 (推荐)", webTitle: "2档 · 平衡", description: "深度 3-5 层 | Alpha-Beta 剪枝", beamWidth: 3, timeBudget: 0.25 },
  3: { title: "3档 · 深谋 (算力)", webTitle: "3档 · 深谋", description: "深度 4-6 层 | 置换表+静止搜索", beamWidth: 5, timeBudget: 1.2 },
  4: { title: "4档 · 极限 (烧脑)", webTitle: "4档 · 极限", description: "深度 6-8 层 | 全局链图+极限推理", beamWidth: 8, timeBudget: 6.0 },
});
export function maxSearchDepth(level, boardSize) {
  switch (level) {
    case 1: return boardSize <= 6 ? 3 : 2;
    case 2: return boardSize <= 6 ? 5 : (boardSize <= 8 ? 4 : 3);
    case 3: return boardSize <= 6 ? 6 : (boardSize <= 8 ? 5 : 4);
    default: return boardSize <= 6 ? 8 : (boardSize <= 8 ? 6 : 5);
  }
}

function neighborTable(size) {
  const grid = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const n = [];
    if (r > 0) n.push((r - 1) * size + c);
    if (r < size - 1) n.push((r + 1) * size + c);
    if (c > 0) n.push(r * size + c - 1);
    if (c < size - 1) n.push(r * size + c + 1);
    grid.push(n);
  }
  return grid;
}

class TranspositionTable {
  constructor() { this.table = new Map(); }
  store(hash, depth, score, type, move) {
    if (this.table.size > 100000) this.table.clear();
    const existing = this.table.get(hash);
    if (existing && existing.depth > depth) return;
    this.table.set(hash, { depth, score, type, move });
  }
  lookup(hash, depth, alpha, beta) {
    const e = this.table.get(hash);
    if (!e || e.depth < depth) return null;
    let a = alpha, b = beta;
    if (e.type === "exact") return { score: e.score, hitCutoff: true, newAlpha: a, newBeta: b };
    if (e.type === "lower") a = Math.max(a, e.score);
    else b = Math.min(b, e.score);
    return { score: e.score, hitCutoff: a >= b, newAlpha: a, newBeta: b };
  }
}

class MoveOrderingTable {
  constructor(maxDepth = 16) {
    this.killers = Array.from({ length: maxDepth + 1 }, () => [null, null]);
    this.history = Array.from({ length: 12 }, () => new Array(12).fill(0));
  }
  recordCutoff(move, depth) {
    const { r, c } = move;
    if (r < 0 || r >= 12 || c < 0 || c >= 12) return;
    this.history[r][c] += depth * depth;
    const d = Math.min(depth, this.killers.length - 1);
    const k0 = this.killers[d][0];
    if (!k0 || k0.r !== r || k0.c !== c) { this.killers[d][1] = k0; this.killers[d][0] = move; }
  }
  score(move, depth) {
    const { r, c } = move;
    if (r < 0 || r >= 12 || c < 0 || c >= 12) return 0;
    let s = this.history[r][c];
    const d = Math.min(depth, this.killers.length - 1);
    const [k1, k2] = this.killers[d];
    if (k1 && k1.r === r && k1.c === c) s += 10000;
    if (k2 && k2.r === r && k2.c === c) s += 5000;
    return s;
  }
}

function hashOf(cells) {
  let s = "";
  for (const cell of cells) s += String.fromCharCode(48 + (cell.owner === null || cell.owner === undefined ? 0 : cell.owner + 1) * 5 + Math.min(4, Math.max(0, cell.count)));
  return s;
}

export class Bot12Solver {
  constructor({ boardSize, activePlayers, currentPlayer, playerType, aiLevel, board, hasEntered, eliminated, signal = null, now = () => performance.now() }) {
    this.boardSize = boardSize;
    this.activePlayers = activePlayers;
    this.currentPlayer = currentPlayer;
    this.playerType = playerType;
    this.aiLevel = AI_LEVELS[aiLevel] ? aiLevel : 2;
    this.cells = board.flat().map(c => ({ owner: c.owner ?? null, count: c.count }));
    this.hasEntered = hasEntered.slice();
    this.eliminated = eliminated.slice();
    this.neighborsMap = neighborTable(boardSize);
    this.signal = signal;
    this.now = now;
    this.deadline = now() + AI_LEVELS[this.aiLevel].timeBudget * 1000;
  }
  get stopped() { return Boolean(this.signal?.aborted) || this.now() >= this.deadline; }
  isElim(p, e) { return p < 0 || p >= e.length ? true : e[p]; }
  nextPlayer(cur, e) {
    const alive = this.activePlayers.filter(p => !this.isElim(p, e));
    if (!alive.length) return cur;
    const i = alive.indexOf(cur);
    if (i >= 0) return alive[(i + 1) % alive.length];
    return alive.find(p => p > cur) ?? alive[0];
  }
  playable(player, cells) {
    const ownsAny = cells.some(c => c.owner === player);
    const out = [];
    for (let r = 0; r < this.boardSize; r++) for (let c = 0; c < this.boardSize; c++) {
      const o = cells[r * this.boardSize + c].owner;
      if (ownsAny ? o === player : o === null) out.push({ r, c });
    }
    return out;
  }
  gameOver(e) { return this.activePlayers.filter(p => !this.isElim(p, e)).length <= 1; }

  calculateBestMove() {
    if (this.stopped) return null;
    const valid = this.playable(this.currentPlayer, this.cells);
    if (!valid.length) return null;
    const first = this.currentPlayer < this.hasEntered.length ? !this.hasEntered[this.currentPlayer] : true;
    const aliveCount = this.activePlayers.filter(p => !this.isElim(p, this.eliminated)).length;
    if (first && aliveCount > 2) {
      const nonCorner = valid.filter(m => !this.isCorner(m));
      return this.openingMove(nonCorner.length ? nonCorner : valid);
    }
    if (first) return this.openingMove(valid);
    if (this.playerType === "enhancedNightmare") {
      const strike = this.criticalThreat(valid);
      if (strike) return strike;
    }
    return this.aspiration(valid);
  }
  isCorner(m) { const e = this.boardSize - 1; return (m.r === 0 || m.r === e) && (m.c === 0 || m.c === e); }
  openingMove(valid) {
    const size = this.boardSize, occupied = new Set();
    this.cells.forEach((c, i) => { if (c.owner !== null) occupied.add(i); });
    const center = (size - 1) / 2;
    if (!occupied.size) {
      let best = valid[0], bd = Infinity;
      for (const m of valid) { const d = Math.abs(m.r - center) + Math.abs(m.c - center); if (d < bd) { bd = d; best = m; } }
      return best;
    }
    const safe8 = valid.filter(({ r, c }) => {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && occupied.has(nr * size + nc)) return false;
      }
      return true;
    });
    const safe4 = safe8.length ? safe8 : valid.filter(m => !(this.neighborsMap[m.r * size + m.c] || []).some(n => occupied.has(n)));
    const cands = safe4.length ? safe4 : valid;
    let best = cands[0], bs = -Infinity;
    for (const m of cands) {
      const s = this.openingScore(m, occupied, center);
      if (s > bs) { bs = s; best = m; } // Swift max(by:) keeps the last of equal maxima
      else if (s === bs) best = m;
    }
    return best;
  }
  openingScore({ r, c }, occupied, center) {
    const size = this.boardSize, idx = r * size + c;
    let score = (this.neighborsMap[idx]?.length ?? 2) * 100;
    let minD = size * 2;
    for (const o of occupied) { const d = Math.max(Math.abs(r - Math.floor(o / size)), Math.abs(c - o % size)); if (d < minD) minD = d; }
    score += minD * 150;
    score -= (Math.abs(r - center) + Math.abs(c - center)) * 20;
    return score;
  }
  criticalThreat(valid) {
    let best = null, max = 0;
    for (const m of valid) {
      const idx = m.r * this.boardSize + m.c, cell = this.cells[idx];
      if (cell.count === 3 || cell.owner === null) {
        let n3 = 0;
        for (const n of this.neighborsMap[idx]) { const x = this.cells[n]; if (x.owner !== null && x.owner !== this.currentPlayer && x.count === 3) n3++; }
        if (n3 > max) { max = n3; best = m; }
      }
    }
    return best;
  }
  simulate(cells, move, player, h) {
    const idx = move.r * this.boardSize + move.c;
    const first = !h[player]; h[player] = true;
    cells[idx] = { owner: player, count: cells[idx].count + (first ? 3 : 1) };
    if (cells[idx].count < 4) return { waves: 0, affected: new Set() };
    let queue = [idx], waves = 0;
    const affected = new Set();
    while (queue.length && waves < 100) {
      waves++;
      const count = queue.length;
      for (let k = 0; k < count; k++) {
        const cur = queue.shift();
        const cc = cells[cur];
        if (cc.count < 4) continue;
        const rem = cc.count - 4;
        cells[cur] = { owner: rem === 0 ? null : player, count: rem };
        for (const n of this.neighborsMap[cur]) {
          const nc = cells[n];
          if (nc.owner !== null && nc.owner !== player) affected.add(nc.owner);
          cells[n] = { owner: player, count: nc.count + 1 };
          if (cells[n].count >= 4) queue.push(n);
        }
      }
    }
    return { waves, affected };
  }
  updateElim(cells, h, e) {
    const appears = new Array(MAX_PLAYERS).fill(false);
    for (const c of cells) if (c.owner !== null && c.owner >= 0 && c.owner < MAX_PLAYERS) appears[c.owner] = true;
    for (const p of this.activePlayers) if (p >= 0 && p < h.length && p < e.length && h[p] && !e[p] && !appears[p]) e[p] = true;
  }
  priority(move, cells, player) {
    const idx = move.r * this.boardSize + move.c, cell = cells[idx], ns = this.neighborsMap[idx] || [];
    let p = 0;
    if (cell.count === 3 || cell.owner === null) for (const n of ns) { const x = cells[n]; if (x.owner !== null && x.owner !== player && x.count === 3) p += 4000; }
    if (cell.count < 3) for (const n of ns) { const x = cells[n]; if (x.owner !== null && x.owner !== player && x.count === 3) p -= 2000; }
    p += ns.length * 10;
    if (cell.count === 3) p += 500;
    return p;
  }
  aspiration(valid) {
    const maxDepth = maxSearchDepth(this.aiLevel, this.boardSize);
    const twoPlayer = this.activePlayers.filter(p => !this.isElim(p, this.eliminated)).length === 2;
    const tt = new TranspositionTable(), ord = new MoveOrderingTable(maxDepth);
    let sorted = valid.map(m => ({ m, p: this.priority(m, this.cells, this.currentPlayer) })).sort((a, b) => b.p - a.p).map(x => x.m);
    let best = sorted[0], lastGuess = 0;
    const win = 120;
    for (let depth = 2; depth <= maxDepth; depth++) {
      if (this.stopped) break;
      let result;
      if (depth === 2) result = this.root(depth, NEG, POS, twoPlayer, sorted, tt, ord);
      else {
        const a = lastGuess - win, b = lastGuess + win;
        const tmp = this.root(depth, a, b, twoPlayer, sorted, tt, ord);
        result = (tmp.score <= a || tmp.score >= b) ? this.root(depth, NEG, POS, twoPlayer, sorted, tt, ord) : tmp;
      }
      if (this.stopped) break;
      best = result.move; lastGuess = result.score;
      sorted = [best, ...sorted.filter(m => !(m.r === best.r && m.c === best.c))];
    }
    return best;
  }
  root(depth, alpha, beta, twoPlayer, cands, tt, ord) {
    let bestMove = cands[0], bestScore = null, a = alpha;
    for (const move of cands) {
      if (this.stopped) break;
      const b = this.cells.map(c => ({ ...c })), h = this.hasEntered.slice(), e = this.eliminated.slice();
      const { waves, affected } = this.simulate(b, move, this.currentPlayer, h);
      this.updateElim(b, h, e);
      const next = this.nextPlayer(this.currentPlayer, e);
      let score;
      if (twoPlayer) score = this.alphaBeta(b, h, e, depth - 1, a, beta, next, tt, ord, true, 0, waves);
      else score = this.maxN(b, h, e, depth - 1, next, AI_LEVELS[this.aiLevel].beamWidth)[this.currentPlayer] ?? -999999;
      score += this.threatBonus(move, waves, affected, this.cells);
      if (bestScore === null || score > bestScore) { bestScore = score; bestMove = move; }
      a = Math.max(a, score);
      if (beta <= a) break;
    }
    return { move: bestMove, score: bestScore ?? NEG };
  }
  alphaBeta(cells, h, e, depth, alpha, beta, turn, tt, ord, allowNull, cooldown, lastWaves = 0) {
    if (this.stopped) return 0;
    let a = alpha, bv = beta;
    const hash = hashOf(cells);
    const res = tt.lookup(hash, depth, a, bv);
    if (res) { a = res.newAlpha; bv = res.newBeta; if (res.hitCutoff) return res.score; }
    const myOrbs = cells.reduce((s, c) => s + (c.owner === turn ? c.count : 0), 0);
    const R = 2;
    if (allowNull && myOrbs > 3 && cooldown === 0 && depth > R + 1 && !this.gameOver(e)) {
      if (!cells.some(c => c.count === 3)) {
        const np = this.nextPlayer(turn, e);
        const nv = -this.alphaBeta(cells, h, e, depth - 1 - R, -bv, -bv + 1, np, tt, ord, false, 3, 0);
        if (nv >= bv) return bv;
      }
    }
    if (depth <= 1 || this.gameOver(e)) {
      const qs = this.aiLevel === 4 ? 4 : this.aiLevel === 3 ? 3 : 2;
      const v = this.quiescence(cells, h, e, a, bv, turn, qs, tt);
      tt.store(hash, depth, v, "exact", null);
      return v;
    }
    const valid = this.playable(turn, cells);
    if (!valid.length) return this.alphaBeta(cells, h, e, depth - 1, a, bv, this.nextPlayer(turn, e), tt, ord, true, Math.max(0, cooldown - 1), lastWaves);
    const sorted = valid.map(m => ({ m, p: this.priority(m, cells, turn) + ord.score(m, depth) })).sort((x, y) => y.p - x.p).map(x => x.m);
    let maxEval = NEG, bestLocal = null;
    const nextCd = Math.max(0, cooldown - 1);
    for (let i = 0; i < sorted.length; i++) {
      if (this.stopped) break;
      const move = sorted[i];
      const b = cells.map(c => ({ ...c })), hh = h.slice(), ee = e.slice();
      const { waves } = this.simulate(b, move, turn, hh);
      this.updateElim(b, hh, ee);
      const np = this.nextPlayer(turn, ee);
      let ev;
      if (i >= 3 && depth >= 3 && cells[move.r * this.boardSize + move.c].count < 3) {
        ev = -this.alphaBeta(b, hh, ee, depth - 2, -a - 1, -a, np, tt, ord, true, nextCd, waves);
        if (ev > a) ev = -this.alphaBeta(b, hh, ee, depth - 1, -bv, -a, np, tt, ord, true, nextCd, waves);
      } else ev = -this.alphaBeta(b, hh, ee, depth - 1, -bv, -a, np, tt, ord, true, nextCd, waves);
      if (ev > maxEval) { maxEval = ev; bestLocal = move; }
      a = Math.max(a, ev);
      if (bv <= a) { ord.recordCutoff(move, depth); break; }
    }
    tt.store(hash, depth, maxEval, maxEval >= beta ? "lower" : "exact", bestLocal);
    return maxEval;
  }
  quiescence(cells, h, e, alpha, beta, turn, qs, tt) {
    if (this.stopped || qs <= 0) return this.evaluate(cells, this.currentPlayer, e, turn, 0);
    let a = alpha;
    const stand = this.evaluate(cells, this.currentPlayer, e, turn, 0);
    if (stand >= beta) return beta;
    if (stand > a) a = stand;
    const tactical = this.forcing(cells, turn);
    if (!tactical.length) return stand;
    for (const move of tactical) {
      const b = cells.map(c => ({ ...c })), hh = h.slice(), ee = e.slice();
      this.simulate(b, move, turn, hh);
      this.updateElim(b, hh, ee);
      const s = -this.quiescence(b, hh, ee, -beta, -a, this.nextPlayer(turn, ee), qs - 1, tt);
      if (s >= beta) return beta;
      if (s > a) a = s;
    }
    return a;
  }
  forcing(cells, player) {
    const out = [];
    for (const m of this.playable(player, cells)) {
      const idx = m.r * this.boardSize + m.c;
      if (cells[idx].count === 3) { out.push(m); continue; }
      if (this.neighborsMap[idx].some(n => cells[n].owner !== null && cells[n].owner !== player && cells[n].count === 3)) out.push(m);
    }
    return out;
  }
  maxN(cells, h, e, depth, turn, beam) {
    if (this.stopped || depth <= 0 || this.gameOver(e)) return this.multiVector(cells, e);
    const moves = this.playable(turn, cells);
    if (!moves.length) return this.maxN(cells, h, e, depth - 1, this.nextPlayer(turn, e), beam);
    const cands = moves.map(m => ({ m, p: this.priority(m, cells, turn) })).sort((a, b) => b.p - a.p).slice(0, beam).map(x => x.m);
    let bestVec = {}, maxVal = -Number.MAX_SAFE_INTEGER;
    for (const m of cands) {
      if (this.stopped) break;
      const b = cells.map(c => ({ ...c })), hh = h.slice(), ee = e.slice();
      this.simulate(b, m, turn, hh);
      this.updateElim(b, hh, ee);
      const vec = this.maxN(b, hh, ee, depth - 1, this.nextPlayer(turn, ee), beam);
      const s = vec[turn] ?? -999999;
      if (s > maxVal) { maxVal = s; bestVec = vec; }
    }
    return bestVec;
  }
  multiVector(cells, e) {
    const orbs = new Array(MAX_PLAYERS).fill(0), scores = new Array(MAX_PLAYERS).fill(0);
    for (let idx = 0; idx < cells.length; idx++) {
      const cell = cells[idx];
      if (cell.owner === null || cell.owner < 0 || cell.owner >= MAX_PLAYERS) continue;
      const ns = this.neighborsMap[idx] || [];
      let v = cell.count * 15 + ns.length * 5;
      if (cell.count === 3) {
        v += 35;
        for (const n of ns) { const x = cells[n]; if (x.owner !== null && x.owner !== cell.owner && x.count === 3) v -= 1500; }
      }
      orbs[cell.owner] += cell.count; scores[cell.owner] += v;
    }
    const maxOrb = Math.max(...orbs), leader = orbs.indexOf(maxOrb);
    const out = {};
    for (const p of this.activePlayers) {
      if (this.isElim(p, e)) out[p] = -999999;
      else {
        let f = scores[p];
        if (leader !== p && maxOrb > 5) f -= Math.trunc((orbs[leader] - orbs[p]) * 35);
        out[p] = f;
      }
    }
    return out;
  }
  evaluate(cells, player, e, turn, lastWaves) {
    if (this.isElim(player, e)) return -999999;
    let score = 0, myOrbs = 0, threat3 = 0;
    const enemyOrbs = {};
    for (let idx = 0; idx < cells.length; idx++) {
      const cell = cells[idx];
      if (cell.owner === null) continue;
      const owner = cell.owner, ns = this.neighborsMap[idx] || [];
      let v = cell.count * 15 + ns.length * 5;
      if (cell.count === 3) {
        v += 35;
        for (const n of ns) {
          const x = cells[n];
          if (x.owner !== null && x.owner !== owner) {
            if (x.count === 3) {
              if (owner === player) threat3++;
              if (turn === owner) v += owner === player ? 3000 : -3000;
              else v -= owner === player ? 3500 : -3500;
            } else if (x.count === 2) v += owner === player ? 400 : -400;
          }
        }
      } else if (cell.count <= 2) {
        for (const n of ns) { const x = cells[n]; if (x.owner !== null && x.owner !== owner && x.count === 3) v -= owner === player ? 800 : -800; }
      }
      if (owner === player) { myOrbs += cell.count; score += v; }
      else { enemyOrbs[owner] = (enemyOrbs[owner] || 0) + cell.count; score -= Math.trunc(v * 1.25); }
    }
    const vals = Object.values(enemyOrbs), maxEnemy = vals.length ? Math.max(...vals) : 0;
    score += this.chainGraph(cells, player);
    const ratio = myOrbs / Math.max(1, maxEnemy);
    if (ratio >= 1.35) { score -= threat3 * 1200; score += lastWaves * 30; }
    else if (ratio <= 0.65) { score -= threat3 * 200; score += lastWaves * 250; }
    else { score -= threat3 * 600; score += lastWaves * 80; }
    const elimEnemies = this.activePlayers.filter(p => p !== player && this.isElim(p, e)).length;
    return score + elimEnemies * 2000 + (myOrbs - maxEnemy) * 25;
  }
  chainGraph(cells, player) {
    const visited = new Array(cells.length).fill(false);
    let score = 0;
    for (let idx = 0; idx < cells.length; idx++) {
      const cell = cells[idx];
      if (visited[idx] || cell.count !== 3 || cell.owner === null) continue;
      let size = 0; const q = [idx]; visited[idx] = true;
      while (q.length) {
        const cur = q.shift(); size++;
        for (const n of this.neighborsMap[cur] || []) {
          const x = cells[n];
          if (!visited[n] && x.count === 3 && x.owner === cell.owner) { visited[n] = true; q.push(n); }
        }
      }
      const g = size * size * 50;
      score += cell.owner === player ? g : -Math.trunc(g * 1.3);
    }
    return score;
  }
  threatBonus(move, waves, affected, cells) {
    let s = 0;
    if (affected.size >= 2) s += affected.size * 450;
    if (waves >= 2) {
      let maxD = 0;
      cells.forEach((c, i) => {
        if (c.owner !== null && c.owner !== this.currentPlayer && c.count === 3) {
          const d = Math.abs(move.r - Math.floor(i / this.boardSize)) + Math.abs(move.c - i % this.boardSize);
          if (d > maxD) maxD = d;
        }
      });
      if (maxD >= 3) s += maxD * 160 + waves * 100;
    }
    return s;
  }
}
