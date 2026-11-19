// Bot 3 in party games (3+ seats). Port of iOS Nov15ParanoidSearch.swift.
// Paranoid alpha-beta: Bot 3 maximises, every other alive seat minimises,
// turns follow seat order. When two seats remain the caller switches to the
// duel search in drive-duel-ai.js.
const MAX_SIDES = 8;
const WIN = 1_000_000;
const INF = 1_000_000_000;
const MAX_PLY = 64;

function owner(code) { return code === 0 ? -1 : (code >> 4) - 1; }
function charge(code) { return code & 15; }
function encode(o, c) { return c > 0 ? ((o + 1) << 4) | Math.min(15, c) : 0; }
function neighbors(index, size) {
  const r = Math.floor(index / size), c = index % size, out = [];
  if (c + 1 < size) out.push(index + 1);
  if (c > 0) out.push(index - 1);
  if (r + 1 < size) out.push(index + size);
  if (r > 0) out.push(index - size);
  return out;
}
function keyFor(s, side) {
  let k = `${side}|${s.entered}|${s.dead}|`;
  for (let i = 0; i < s.cells.length; i++) k += String.fromCharCode(s.cells[i] + 32);
  return k;
}
function legalMoves(s, side) {
  const out = [];
  if ((s.entered & (1 << side)) === 0) { for (let i = 0; i < s.cells.length; i++) if (!s.cells[i]) out.push(i); }
  else { for (let i = 0; i < s.cells.length; i++) if (owner(s.cells[i]) === side) out.push(i); }
  return out;
}
function counts(cells, sides) {
  const v = new Array(sides).fill(0);
  for (const code of cells) if (code) v[owner(code)]++;
  return v;
}
function aliveCount(s, sides) { let n = 0; for (let p = 0; p < sides; p++) if (!(s.dead & (1 << p))) n++; return n; }
function nextSide(side, s, sides) {
  for (let step = 1; step <= sides; step++) { const p = (side + step) % sides; if (!(s.dead & (1 << p))) return p; }
  return side;
}
function terminal(s, me, sides, depth) {
  if (s.dead & (1 << me)) return -WIN - depth;
  if (aliveCount(s, sides) === 1) return WIN + depth;
  return null;
}
function evaluate(s, me, sides) {
  const t = terminal(s, me, sides, 0);
  if (t !== null) return t;
  const cells = s.cells, size = Math.round(Math.sqrt(cells.length));
  const piece = new Array(sides).fill(0), total = piece.slice(), three = piece.slice(), exp3 = piece.slice(), expC = piece.slice();
  for (const code of cells) if (code) { const p = owner(code), a = charge(code); piece[p]++; total[p] += a; if (a === 3) three[p]++; }
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i] || charge(cells[i]) !== 3) continue;
    const p = owner(cells[i]);
    let enemy = 0;
    for (const n of neighbors(i, size)) if (cells[n] && owner(cells[n]) !== p) enemy += charge(cells[n]);
    if (enemy > 0) { exp3[p]++; expC[p] += enemy; }
  }
  const score = p => piece[p] * 35 + total[p] * 4 + three[p] * 8 + exp3[p] * 60 + expC[p] * 12;
  let strongest = null;
  for (let p = 0; p < sides; p++) if (p !== me && !(s.dead & (1 << p))) strongest = strongest === null ? score(p) : Math.max(strongest, score(p));
  return score(me) - (strongest ?? 0);
}
function simulate(s, move, side, size, sides) {
  const next = s.cells.slice();
  next[move] = encode(side, charge(next[move]) + ((s.entered & (1 << side)) ? 1 : 3));
  const entered = s.entered | (1 << side);
  for (let guard = 0; guard < size * size * 8; guard++) {
    const wave = [];
    for (let i = 0; i < next.length; i++) if (next[i] && charge(next[i]) >= 4) wave.push(i);
    if (!wave.length) break;
    for (const i of wave) {
      const code = next[i];
      if (!code || charge(code) < 4) continue;
      const o = owner(code);
      next[i] = encode(o, charge(code) - 4);
      for (const n of neighbors(i, size)) next[n] = encode(o, charge(next[n]) + 1);
    }
  }
  let dead = s.dead;
  const pieces = counts(next, sides);
  for (let p = 0; p < sides; p++) if ((entered & (1 << p)) && pieces[p] === 0) dead |= 1 << p;
  return { cells: next, entered, dead };
}
function orderScore(s, move, side, size, ply, ttMove, ctx) {
  if (move === ttMove) return 1e9;
  const cells = s.cells, code = cells[move];
  const first = (s.entered & (1 << side)) === 0;
  const nextCharge = charge(code) + (first ? 3 : 1);
  if (!(first ? code === 0 : owner(code) === side)) return -INF;
  const adj = neighbors(move, size);
  if (nextCharge >= 4) {
    let score = 1_000_000;
    for (const n of adj) if (cells[n] && owner(cells[n]) !== side) {
      const e = charge(cells[n]);
      score += 10 * e;
      if (e === 3) score += 200;
      if (side !== ctx.me && owner(cells[n]) === ctx.me) score += 50;
    }
    return score;
  }
  let score = 0;
  if (ctx.killers[ply][0] === move) score += 800_000;
  else if (ctx.killers[ply][1] === move) score += 700_000;
  score += ctx.history[side * 144 + move];
  if (nextCharge === 3) score += 100;
  score += nextCharge * 2;
  for (const n of adj) if (cells[n] && owner(cells[n]) !== side && charge(cells[n]) === 3) score -= nextCharge === 3 ? 300 : 80;
  return score;
}
function search(s, side, depth, alphaIn, betaIn, ply, ctx, size) {
  const { me, sides } = ctx;
  ctx.nodes++;
  if ((ctx.nodes & 4095) === 0 && Date.now() >= ctx.deadline) ctx.stopped = true;
  const t = terminal(s, me, sides, depth);
  if (t !== null) return { score: t, move: -1 };
  if (ctx.stopped || ply >= MAX_PLY || depth <= 0) return { score: evaluate(s, me, sides), move: -1 };
  const key = keyFor(s, side), cached = ctx.table.get(key);
  const ttMove = cached?.move ?? -1;
  let alpha = alphaIn, beta = betaIn;
  if (cached && cached.depth >= depth) {
    if (cached.flag === 0) return { score: cached.score, move: cached.move };
    if (cached.flag === 1) alpha = Math.max(alpha, cached.score);
    if (cached.flag === 2) beta = Math.min(beta, cached.score);
    if (alpha >= beta) return { score: cached.score, move: cached.move };
  }
  const moves = legalMoves(s, side)
    .map(move => ({ move, score: orderScore(s, move, side, size, ply, ttMove, ctx) }))
    .sort((a, b) => b.score - a.score).map(x => x.move);
  if (!moves.length) return { score: evaluate(s, me, sides), move: -1 };
  const maximizing = side === me, a0 = alpha, b0 = beta;
  let best = maximizing ? -INF : INF, bestMove = moves[0];
  for (const move of moves) {
    const next = simulate(s, move, side, size, sides);
    const score = search(next, nextSide(side, next, sides), depth - 1, alpha, beta, ply + 1, ctx, size).score;
    if (maximizing) { if (score > best) { best = score; bestMove = move; } alpha = Math.max(alpha, score); }
    else { if (score < best) { best = score; bestMove = move; } beta = Math.min(beta, score); }
    if (alpha >= beta) {
      const nc = charge(s.cells[move]) + ((s.entered & (1 << side)) ? 1 : 3);
      if (nc < 4) {
        const k = ctx.killers[ply];
        if (k[0] !== move) { k[1] = k[0]; k[0] = move; }
        const idx = side * 144 + move;
        ctx.history[idx] = Math.min(2_000_000, ctx.history[idx] + depth * depth);
      }
      break;
    }
    if (ctx.stopped) break;
  }
  if (!ctx.stopped) {
    const flag = best <= a0 ? 2 : best >= b0 ? 1 : 0;
    ctx.table.set(key, { depth, score: best, flag, move: bestMove });
  }
  return { score: best, move: bestMove };
}

// Same budgets as iOS (Nov15 level 3): <30 plies 400ms/soft120/min40/depth8, else 5000/1200/60/32.
export function paranoidParameters(movesPlayed) {
  return movesPlayed < 30
    ? { timeMs: 400, softTimeMs: 120, minTimeMs: 40, maxDepth: 8 }
    : { timeMs: 5000, softTimeMs: 1200, minTimeMs: 60, maxDepth: 32 };
}

export function chooseParanoidMove({ board, players, currentPlayer, hasEntered = [], eliminated = [], movesPlayed = 0, signal = null }) {
  const size = board.length;
  if (size < 2 || size > 12 || players.length < 3 || players.length > MAX_SIDES) return null;
  const me = players.indexOf(currentPlayer);
  if (me < 0) return null;
  const sides = players.length;
  const cells = new Array(size * size).fill(0);
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const cell = board[r][c];
    const local = players.indexOf(cell.owner ?? -1);
    if (local >= 0 && cell.count > 0) cells[r * size + c] = encode(local, cell.count);
  }
  let entered = 0, dead = 0;
  players.forEach((p, i) => { if (hasEntered[p]) entered |= 1 << i; if (eliminated[p]) dead |= 1 << i; });
  const root = { cells, entered, dead };
  const moves = legalMoves(root, me);
  if (!moves.length) return null;
  if (moves.length === 1) return { r: Math.floor(moves[0] / size), c: moves[0] % size };
  const params = paranoidParameters(movesPlayed);
  const start = Date.now();
  const ctx = { deadline: start + params.timeMs, me, sides, nodes: 0, stopped: false, table: new Map(),
    killers: Array.from({ length: MAX_PLY + 1 }, () => [-1, -1]), history: new Float64Array(sides * 144) };
  let best = moves.map(move => ({ move, score: orderScore(root, move, me, size, 0, -1, ctx) })).sort((a, b) => b.score - a.score)[0].move;
  const done = [], scores = [];
  for (let depth = 1; depth <= params.maxDepth; depth++) {
    if (Date.now() >= ctx.deadline || signal?.aborted) break;
    ctx.stopped = false;
    const result = search(root, me, depth, -INF, INF, 0, ctx, size);
    if (ctx.stopped || signal?.aborted || result.move < 0) break;
    best = result.move;
    done.push(result.move); scores.push(result.score);
    if (Math.abs(result.score) >= WIN - 1000) break;
    const elapsed = Date.now() - start;
    if (depth >= 6 && elapsed >= params.softTimeMs && elapsed >= params.minTimeMs && done.length >= 3) {
      const recent = done.slice(-3);
      if (recent.every(m => m === recent[0]) && Math.abs(result.score - scores[scores.length - 3]) <= 8) break;
    }
  }
  return { r: Math.floor(best / size), c: best % size };
}
