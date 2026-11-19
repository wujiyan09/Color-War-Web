// JS port of iOS DriveBotpickEngine.swift (itself a port of DotsBoard `botpick`).
// Used by the 分析器 (analyzer): Dots rules (+1 per placement, simultaneous waves,
// win once both sides have moved and one side has no cells left).
// Cell code: bit 7 = owner (0 red / 1 blue), low 4 bits = charge, 0 = empty.

const CAP = 12, MAX_PLY = 48, WIN = 1000000, INF = 1000000000;
const M64 = (1n << 64n) - 1n;
function splitmix64(x) {
  let v = (x + 0x9e3779b97f4a7c15n) & M64;
  v = ((v ^ (v >> 30n)) * 0xbf58476d1ce4e5b9n) & M64;
  v = ((v ^ (v >> 27n)) * 0x94d049bb133111ebn) & M64;
  return v ^ (v >> 31n);
}
const ZOB = (() => { let s = 0xc0ffeen; const out = []; for (let i = 0; i < CAP * CAP * 2 * 8; i++) { s = splitmix64((s + BigInt(i)) & M64); out.push(s); } return out; })();
const SIDE_KEY = splitmix64((ZOB[ZOB.length - 1] + 0xabcdefn) & M64);

export const owner = code => code === 0 ? -1 : ((code & 0x80) === 0 ? 0 : 1);
export const charge = code => code & 0x0f;
export const encode = (side, amount) => (side === 1 ? 0x80 : 0) | (amount & 0x0f);
export const decodedOwner = code => code === 0 ? null : owner(code);
const nbCache = new Map();
function neighbors(i, size) {
  const key = size * 1000 + i;
  let v = nbCache.get(key);
  if (v) return v;
  const r = Math.floor(i / size), c = i % size; v = [];
  if (c + 1 < size) v.push(i + 1);
  if (c > 0) v.push(i - 1);
  if (r + 1 < size) v.push(i + size);
  if (r > 0) v.push(i - size);
  nbCache.set(key, v);
  return v;
}
function zkey(i, code) {
  if (code === 0) return 0n;
  const amount = Math.min(8, charge(code));
  if (amount <= 0) return 0n;
  return ZOB[(i * 2 + owner(code)) * 8 + amount - 1];
}

class Position {
  constructor(cells, size, side, movesRed, movesBlue, winner, redCount, blueCount, hash) {
    Object.assign(this, { cells, size, side, movesRed, movesBlue, winner, redCount, blueCount, hash });
    this.hashNegative = false; this.undo = []; this.frames = [];
  }
  setCell(i, value) {
    const old = this.cells[i];
    if (old === value) return;
    this.undo.push(i, old);
    if (old !== 0) { if (owner(old) === 0) this.redCount--; else this.blueCount--; this.hash ^= zkey(i, old); }
    if (value !== 0) { if (owner(value) === 0) this.redCount++; else this.blueCount++; this.hash ^= zkey(i, value); }
    this.cells[i] = value;
  }
  makeMove(index, capture = false) {
    this.frames.push({ u: this.undo.length, side: this.side, mr: this.movesRed, mb: this.movesBlue, w: this.winner, rc: this.redCount, bc: this.blueCount, h: this.hash });
    const mover = this.side, size = this.size, cells = this.cells;
    this.setCell(index, encode(mover, charge(cells[index]) + 1));
    const placementCells = capture ? Array.from(cells) : null;
    const waves = [];
    let resolved = false;
    for (let it = 0; it < size * size * 8; it++) {
      const wave = [];
      for (let i = 0; i < cells.length; i++) if (cells[i] !== 0 && charge(cells[i]) >= 4) wave.push(i);
      if (!wave.length) break;
      const exploded = [];
      for (const ei of wave) {
        const src = cells[ei];
        if (src === 0 || charge(src) < 4) continue;
        const so = owner(src);
        exploded.push(ei);
        this.setCell(ei, 0);
        for (const a of neighbors(ei, size)) this.setCell(a, encode(so, charge(cells[a]) + 1));
        if (this.redCount === 0 || this.blueCount === 0) { resolved = true; break; }
      }
      if (capture && exploded.length) waves.push({ cells: Array.from(cells), exploding: exploded });
      if (resolved) break;
    }
    if (mover === 0) this.movesRed++; else this.movesBlue++;
    if (this.movesRed >= 1 && this.movesBlue >= 1) {
      if (this.redCount === 0 && this.blueCount > 0) this.winner = 1;
      else if (this.blueCount === 0 && this.redCount > 0) this.winner = 0;
    }
    if (this.winner === null) { this.side = 1 - mover; this.hash ^= SIDE_KEY; }
    return capture ? { placementCells, waves } : null;
  }
  unmakeMove() {
    const f = this.frames.pop();
    if (!f) return;
    while (this.undo.length > f.u) { const old = this.undo.pop(); const i = this.undo.pop(); this.cells[i] = old; }
    this.side = f.side; this.movesRed = f.mr; this.movesBlue = f.mb; this.winner = f.w;
    this.redCount = f.rc; this.blueCount = f.bc; this.hash = f.h;
    this.hashNegative = (f.h >> 63n) === 1n;
  }
}

function makePosition(cells, size, side, movesRed, movesBlue) {
  let rc = 0, bc = 0, h = 0n;
  for (let i = 0; i < cells.length; i++) if (cells[i] !== 0) { if (owner(cells[i]) === 0) rc++; else bc++; h ^= zkey(i, cells[i]); }
  if (side === 1) h ^= SIDE_KEY;
  return new Position(Uint8Array.from(cells), size, side, movesRed, movesBlue, null, rc, bc, h);
}
function legalMoves(p) {
  if (p.winner !== null) return [];
  const out = [];
  for (let i = 0; i < p.cells.length; i++) if (owner(p.cells[i]) === p.side) out.push(i);
  return out;
}
function evaluate(p) {
  if (p.winner !== null) return p.winner === p.side ? WIN : -WIN;
  const side = p.side, pieces = [0, 0], tot = [0, 0], crit = [0, 0], expC = [0, 0], expQ = [0, 0];
  for (const code of p.cells) if (code !== 0) { const o = owner(code), a = charge(code); pieces[o]++; tot[o] += a; if (a === 3) crit[o]++; }
  for (let i = 0; i < p.cells.length; i++) {
    const code = p.cells[i];
    if (code === 0 || charge(code) !== 3) continue;
    const pl = owner(code); let adj = 0;
    for (const a of neighbors(i, p.size)) { const c = p.cells[a]; if (c !== 0 && owner(c) !== pl) adj += charge(c); }
    if (adj > 0) { expC[pl]++; expQ[pl] += adj; }
  }
  const o = 1 - side;
  return (pieces[side] - pieces[o]) * 35 + (tot[side] - tot[o]) * 4 + (crit[side] - crit[o]) * 8 + (expC[side] - expC[o]) * 60 + (expQ[side] - expQ[o]) * 12;
}
function orderScore(p, move, ttMove, ply, ctx) {
  if (move === ttMove) return 1000000000;
  const side = p.side, next = charge(p.cells[move]) + 1, adj = neighbors(move, p.size);
  if (next >= 4) {
    let s = 1000000;
    for (const i of adj) { const c = p.cells[i]; if (c !== 0 && owner(c) !== side) { const a = charge(c); s += a * 10; if (a === 3) s += 200; } }
    return s;
  }
  let s = ctx.killers[ply][0] === move ? 800000 : (ctx.killers[ply][1] === move ? 700000 : 0);
  s += ctx.history[side * 144 + move];
  if (next === 3) s += 100;
  s += next * 2;
  for (const i of adj) { const c = p.cells[i]; if (c !== 0 && owner(c) !== side && charge(c) === 3) s -= next === 3 ? 300 : 80; }
  return s;
}
function search(p, depth, alphaIn, beta, ply, ctx, pv) {
  ctx.nodes++;
  if ((ctx.nodes & 4095) === 0 && (ctx.now() >= ctx.deadline || ctx.signal?.aborted)) ctx.stopped = true;
  if (ctx.stopped) return { score: 0, move: -1 };
  if (p.winner !== null) return { score: p.winner === p.side ? WIN + depth : -WIN - depth, move: -1 };
  const key = p.hash.toString(16) + (p.hashNegative ? "n" : "");
  const cached = ctx.table.get(key);
  const ttMove = cached ? cached.move : -1;
  let alpha = alphaIn;
  if (cached && cached.depth >= depth) {
    if (cached.flag === 0) return { score: cached.score, move: cached.move };
    if (cached.flag === 1 && cached.score >= beta) return { score: cached.score, move: cached.move };
    if (cached.flag === 2 && cached.score <= alpha) return { score: cached.score, move: cached.move };
  }
  if (depth <= 0) return { score: evaluate(p), move: -1 };
  const side = p.side;
  if (pv && depth >= 3 && beta - alpha === 1 && (side === 0 ? p.redCount : p.blueCount) >= 3) {
    p.side = 1 - side; p.hash ^= SIDE_KEY;
    const red = depth >= 6 ? 3 : 2;
    const nr = search(p, depth - 1 - red, -beta, -beta + 1, ply + 1, ctx, false);
    p.side = side; p.hash ^= SIDE_KEY;
    if (ctx.stopped) return { score: 0, move: -1 };
    if (-nr.score >= beta) return { score: -nr.score, move: -1 };
  }
  const moves = legalMoves(p);
  if (!moves.length) return { score: evaluate(p), move: -1 };
  const ordered = moves.map(m => ({ m, s: orderScore(p, m, ttMove, ply, ctx) }));
  for (let i = 1; i < ordered.length; i++) {
    const item = ordered[i]; let d = i - 1;
    while (d >= 0 && ordered[d].s < item.s) { ordered[d + 1] = ordered[d]; d--; }
    ordered[d + 1] = item;
  }
  const origAlpha = alpha;
  let best = -INF, bestMove = ordered[0].m;
  for (const { m } of ordered) {
    const quiet = charge(p.cells[m]) + 1 < 4;
    p.makeMove(m);
    let score;
    if (p.winner !== null) score = p.winner === side ? WIN + depth : -WIN - depth;
    else score = -search(p, depth - 1, -beta, -alpha, ply + 1, ctx, true).score;
    p.unmakeMove();
    if (ctx.stopped) return { score: 0, move: -1 };
    if (score > best) { best = score; bestMove = m; }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (quiet) {
        if (ctx.killers[ply][0] !== m) { ctx.killers[ply][1] = ctx.killers[ply][0]; ctx.killers[ply][0] = m; }
        ctx.history[side * 144 + m] += depth * depth;
      }
      break;
    }
  }
  const flag = best <= origAlpha ? 2 : (best >= beta ? 1 : 0);
  ctx.table.set(key, { depth, score: best, flag, move: bestMove });
  return { score: best, move: bestMove };
}

export function applyMove({ cells, size, side, movesRed, movesBlue, move }) {
  if (size < 2 || size > CAP || cells.length !== size * size || (side !== 0 && side !== 1) || move < 0 || move >= cells.length) return null;
  const p = makePosition(cells, size, side, movesRed, movesBlue);
  if (!legalMoves(p).includes(move)) return null;
  const trace = p.makeMove(move, true);
  return { cells: Array.from(p.cells), placementCells: trace.placementCells, cascadeFrames: trace.waves, nextSide: p.side, winner: p.winner };
}

export function bestMove({ cells, size, side, movesRed, movesBlue, limits, signal = null, now = () => performance.now() }) {
  if (size < 2 || size > CAP || cells.length !== size * size || (side !== 0 && side !== 1)) return null;
  const p = makePosition(cells, size, side, movesRed, movesBlue);
  if (movesRed >= 1 && movesBlue >= 1 && ((p.redCount === 0 && p.blueCount > 0) || (p.blueCount === 0 && p.redCount > 0))) return null;
  const root = legalMoves(p);
  if (!root.length) return null;
  if (root.length === 1) return { move: root[0], depth: 1, score: 0, nodes: 0 };
  const started = now();
  const hard = started + Math.max(0, limits.timeMs);
  const soft = limits.softTimeMs != null ? started + Math.min(limits.softTimeMs, limits.timeMs) : hard;
  const minD = limits.softTimeMs != null ? started + Math.min(limits.minTimeMs, limits.softTimeMs) : started;
  const ctx = { deadline: hard, now, signal, nodes: 0, stopped: false, table: new Map(),
    killers: Array.from({ length: MAX_PLY + 4 }, () => [-1, -1]), history: new Array(288).fill(0) };
  let best = -1, bestScore = 0, depthDone = 0;
  const pm = [], ps = [];
  for (let depth = 1; depth <= limits.maxDepth; depth++) {
    if (now() >= hard || signal?.aborted) break;
    ctx.stopped = false;
    const r = search(p, depth, -INF, INF, 0, ctx, true);
    if (ctx.stopped || signal?.aborted) break;
    best = r.move; bestScore = r.score; depthDone = depth; pm.push(r.move); ps.push(r.score);
    if (r.score > 900000 || r.score < -900000) break;
    if (limits.softTimeMs != null && depth >= 6) {
      const t = now();
      if (t >= minD && t >= soft && pm.length >= 3) {
        const recent = pm.slice(-3);
        if (recent.every(x => x === recent[0]) && Math.abs(bestScore - ps[ps.length - 3]) <= 8) break;
      }
    }
  }
  if (best < 0) best = root[0];
  return { move: best, depth: depthDone, score: bestScore, nodes: ctx.nodes };
}

// Analyzer entry (iOS directBotpickSearch): 5 s, depth 32, fixed 20/20 move counts.
export function analyzerBestMove({ cells, size, side, signal = null, timeMs = 5000 }) {
  const r = bestMove({ cells, size, side, movesRed: 20, movesBlue: 20,
    limits: { timeMs: Math.min(5000, Math.max(20, timeMs)), softTimeMs: null, minTimeMs: 60, maxDepth: 32 }, signal });
  if (r) return r.move;
  const first = cells.findIndex(c => owner(c) === side);
  return first >= 0 ? first : null;
}
