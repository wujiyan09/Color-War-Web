const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const INF = 1e9;
const TERMINAL = 1e6;
const MAX_PLY = 48;
const MASK64 = (1n << 64n) - 1n;

export const DRIVE_DIFFICULTY = Object.freeze({
  1: Object.freeze({ name: "easy", timeMs: 80, maxDepth: 1, randomize: true }),
  2: Object.freeze({ name: "medium", timeMs: 1200, maxDepth: 8, randomize: false }),
  3: Object.freeze({ name: "hard", timeMs: 6000, maxDepth: 32, randomize: false }),
  4: Object.freeze({ name: "hard", timeMs: 6000, maxDepth: 32, randomize: false }),
});

// The Drive local-game scheduler supplies independent phase caps. When both it
// and Color War's selected difficulty constrain the same search, honor the
// stricter wall-clock/depth limit while retaining Drive's soft-stop settings.
export const DRIVE_LOCAL_PHASES = Object.freeze({
  opening: Object.freeze({ movesBefore: 30, timeMs: 400, softTimeMs: 120, minTimeMs: 40, maxDepth: 8 }),
  later: Object.freeze({ movesBefore: 30, timeMs: 5000, softTimeMs: 600, minTimeMs: 80, maxDepth: 32 }),
});

export function effectiveSearchConfig(difficulty, movesPlayed = 0) {
  const selected = DRIVE_DIFFICULTY[difficulty] || DRIVE_DIFFICULTY[2];
  const phase = movesPlayed < DRIVE_LOCAL_PHASES.opening.movesBefore
    ? DRIVE_LOCAL_PHASES.opening : DRIVE_LOCAL_PHASES.later;
  const timeMs = Math.min(selected.timeMs, phase.timeMs);
  const softTimeMs = Math.min(phase.softTimeMs, timeMs);
  return {
    name: selected.name,
    phase: phase === DRIVE_LOCAL_PHASES.opening ? "opening" : "later",
    timeMs,
    softTimeMs,
    minTimeMs: Math.min(phase.minTimeMs, softTimeMs),
    maxDepth: Math.min(selected.maxDepth, phase.maxDepth),
    randomize: selected.randomize,
  };
}

function splitmix64(x) {
  x = (x + 0x9e3779b97f4a7c15n) & MASK64;
  x = ((x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
  x = ((x ^ (x >> 27n)) * 0x94d049bb133111ebn) & MASK64;
  return (x ^ (x >> 31n)) & MASK64;
}

function makeKeys() {
  const cells = [];
  let seed = 0xc0ffeen;
  for (let i = 0; i < 12 * 12 * 2 * 8; i++) {
    seed = splitmix64(seed + BigInt(i));
    cells.push(seed);
  }
  return {
    cells,
    side: splitmix64(seed + 0xabcdefn),
    entered0: splitmix64(seed + 0x111111n),
    entered1: splitmix64(seed + 0x222222n),
  };
}
const ZOBRIST = makeKeys();

function cellOwner(code) { return code === 0 ? -1 : (code >> 4) - 1; }
function cellCharge(code) { return code & 15; }
function encode(owner, charge) { return charge ? ((owner + 1) << 4) | charge : 0; }

function neighbors(index, size) {
  const r = Math.floor(index / size), c = index % size, out = [];
  if (c + 1 < size) out.push(index + 1);
  if (c > 0) out.push(index - 1);
  if (r + 1 < size) out.push(index + size);
  if (r > 0) out.push(index - size);
  return out;
}

function keyFor(cells, side, enteredMask, size) {
  let key = 0n;
  for (let i = 0; i < cells.length; i++) {
    const code = cells[i];
    if (!code) continue;
    const owner = cellOwner(code), charge = Math.min(8, cellCharge(code));
    key ^= ZOBRIST.cells[(i * 2 + owner) * 8 + charge - 1];
  }
  if (side === 1) key ^= ZOBRIST.side;
  if (enteredMask & 1) key ^= ZOBRIST.entered0;
  if (enteredMask & 2) key ^= ZOBRIST.entered1;
  return key;
}

function legalMoves(cells, side, entered, size) {
  const out = [];
  if (!entered[side]) {
    for (let i = 0; i < size * size; i++) if (!cells[i]) out.push(i);
  } else {
    for (let i = 0; i < size * size; i++) if (cellOwner(cells[i]) === side) out.push(i);
  }
  return out;
}

function counts(cells) {
  const result = [0, 0];
  for (const code of cells) if (code) result[cellOwner(code)]++;
  return result;
}

function terminalScore(cells, side, enteredMask) {
  if (enteredMask !== 3) return null;
  const c = counts(cells);
  if (c[0] === 0 && c[1] > 0) return side === 1 ? TERMINAL : -TERMINAL;
  if (c[1] === 0 && c[0] > 0) return side === 0 ? TERMINAL : -TERMINAL;
  return null;
}

function evaluate(cells, side, enteredMask) {
  const terminal = terminalScore(cells, side, enteredMask);
  if (terminal !== null) return terminal;
  const other = 1 - side;
  let myCells = 0, theirCells = 0, myCharge = 0, theirCharge = 0;
  let myCharge3 = 0, theirCharge3 = 0, myExposed3 = 0, theirExposed3 = 0;
  let myExposedCharge = 0, theirExposedCharge = 0;
  for (let i = 0; i < cells.length; i++) {
    const code = cells[i];
    if (!code) continue;
    const owner = cellOwner(code), charge = cellCharge(code);
    if (owner === side) {
      myCells++; myCharge += charge; if (charge === 3) myCharge3++;
    } else {
      theirCells++; theirCharge += charge; if (charge === 3) theirCharge3++;
    }
  }
  for (let i = 0; i < cells.length; i++) {
    const code = cells[i];
    if (!code || cellCharge(code) !== 3) continue;
    const owner = cellOwner(code);
    let enemyCharge = 0;
    for (const n of neighbors(i, Math.sqrt(cells.length))) {
      const near = cells[n];
      if (near && cellOwner(near) !== owner) enemyCharge += cellCharge(near);
    }
    if (enemyCharge > 0) {
      if (owner === side) { myExposed3++; myExposedCharge += enemyCharge; }
      else { theirExposed3++; theirExposedCharge += enemyCharge; }
    }
  }
  return (myCells - theirCells) * 35
    + (myCharge - theirCharge) * 4
    + (myCharge3 - theirCharge3) * 8
    + (myExposed3 - theirExposed3) * 60
    + (myExposedCharge - theirExposedCharge) * 12;
}

function simulate(cells, move, side, enteredMask, size) {
  const next = cells.slice();
  const entered = (enteredMask & (1 << side)) !== 0;
  next[move] = encode(side, cellCharge(next[move]) + (entered ? 1 : 3));
  enteredMask |= 1 << side;
  // Match the reference bitboard engine: collect each wave in index order,
  // then resolve queued explosions sequentially against the live board.
  for (let guard = 0; guard < size * size * 8; guard++) {
    const wave = [];
    for (let i = 0; i < next.length; i++) if (next[i] && cellCharge(next[i]) >= 4) wave.push(i);
    if (!wave.length) break;
    for (const i of wave) {
      const source = next[i];
      if (!source || cellCharge(source) < 4) continue;
      const owner = cellOwner(source), charge = cellCharge(source);
      next[i] = encode(owner, charge - 4);
      for (const n of neighbors(i, size)) {
        next[n] = encode(owner, cellCharge(next[n]) + 1);
      }
    }
  }
  return { cells: next, enteredMask };
}

function exposedThreatTotals(cells, side, size) {
  let count = 0, charge = 0;
  for (let i = 0; i < cells.length; i++) {
    const code = cells[i];
    if (!code || cellOwner(code) !== side || cellCharge(code) !== 3) continue;
    let nearby = 0;
    for (const n of neighbors(i, size)) {
      const other = cells[n];
      if (other && cellOwner(other) !== side) nearby += cellCharge(other);
    }
    if (nearby > 0) { count++; charge += nearby; }
  }
  return { count, charge };
}

function driveMoveScore(cells, move, side, size, ply, context) {
  if (context.ttMove === move) return 1e9;
  const old = cells[move], nextCharge = cellCharge(old) + (context.entered[side] ? 1 : 3);
  const own = context.entered[side] ? cellOwner(old) === side : old === 0;
  if (!own) return -INF;
  const ns = neighbors(move, size);
  let score = 0;
  if (nextCharge >= 4) {
    score += 1e6;
    for (const n of ns) {
      const code = cells[n];
      if (code && cellOwner(code) !== side) {
        const charge = cellCharge(code);
        score += 10 * charge;
        if (charge === 3) score += 200;
      }
    }
  } else {
    const plyMoves = context.killers[ply] || [];
    if (plyMoves[0] === move) score += 8e5;
    else if (plyMoves[1] === move) score += 7e5;
    score += context.history[side * 144 + move] || 0;
    if (nextCharge === 3) score += 100;
    score += nextCharge * 2;
    for (const n of ns) {
      const code = cells[n];
      if (code && cellOwner(code) !== side && cellCharge(code) === 3) score -= nextCharge === 3 ? 300 : 80;
    }
  }
  return score;
}

export function quietHeuristic(cells, move, side, entered, size) {
  const ownCode = cells[move], first = !entered[side];
  const newCharge = cellCharge(ownCode) + (first ? 3 : 1);
  const enemy = 1 - side, ns = neighbors(move, size);
  let enemyCount = 0, enemy3 = 0, maxEnemy = 0, enemy2 = 0, own3 = 0, ownCount = 0, empty = 0;
  let enemyCharge = 0;
  for (const n of ns) {
    const code = cells[n];
    if (!code) { empty++; continue; }
    const owner = cellOwner(code), charge = cellCharge(code);
    if (owner === side) { ownCount++; if (charge === 3) own3++; }
    else { enemyCount++; enemyCharge += charge; maxEnemy = Math.max(maxEnemy, charge); if (charge === 3) enemy3++; if (charge === 2) enemy2++; }
  }
  if (newCharge >= 4) {
    const after = simulate(cells, move, side, (entered[0] ? 1 : 0) | (entered[1] ? 2 : 0), size).cells;
    const beforeCount = counts(cells), afterCount = counts(after);
    let score = (afterCount[side] - beforeCount[side]) * 18 + (beforeCount[enemy] - afterCount[enemy]) * 26;
    if (afterCount[enemy] === 0 && beforeCount[enemy] > 0) score += 500000;
    score += enemyCount * 30 + enemy3 * 90 + empty * 0.4;
    const readyThreat = exposedThreatTotals(cells, side, size);
    if (readyThreat.count > 0) score += 280 + readyThreat.charge * 12;
    return score;
  }
  let score = 0;
  if (enemy3 > 0) {
    score -= 95 + newCharge * 24 + maxEnemy * 18;
    if (newCharge === 3) score -= 250 + own3 * 95;
  }
  if (newCharge === 3 && enemy2 > 0) score -= 105 * enemy2;
  if (newCharge === 3 && enemyCount > 0) score -= 30 * enemyCount;
  if (newCharge === 3 && enemyCount === 0) score += 22 + own3 * 4;
  const ownExposed = exposedThreatTotals(cells, side, size);
  if (ownExposed.count > 0) score -= 290 + ownExposed.charge * 12;
  score += newCharge * 0.5 + (4 - newCharge) * 2.5 + ownCount + empty * 0.25 - enemyCount * 2;
  const total = counts(cells).reduce((a, b) => a + b, 0);
  if (total <= 8 && !first) {
    const r = Math.floor(move / size), c = move % size, center = Math.floor(size / 2);
    score += Math.max(0, center - (side === 0 ? r + c : 2 * (size - 1) - r - c)) * 2.5;
  }
  if (total >= 30 && newCharge === 3) score -= 8;
  return score + (Math.random() - 0.5) * 0.01;
}

function makeContext(deadline) {
  return { deadline, nodes: 0, stopped: false, tt: new Map(), killers: Array.from({ length: MAX_PLY + 1 }, () => [-1, -1]), history: new Int32Array(2 * 144) };
}

function search(cells, side, enteredMask, depth, alpha, beta, ply, context, size) {
  context.nodes++;
  if ((context.nodes & 255) === 0 && Date.now() >= context.deadline) context.stopped = true;
  if (context.stopped || ply >= MAX_PLY) return { score: evaluate(cells, side, enteredMask), move: -1 };
  const terminal = terminalScore(cells, side, enteredMask);
  if (terminal !== null) return { score: terminal, move: -1 };
  const entered = [(enteredMask & 1) !== 0, (enteredMask & 2) !== 0];
  const key = keyFor(cells, side, enteredMask, size), cached = context.tt.get(key);
  const ttMove = cached?.move ?? -1, oldAlpha = alpha;
  if (cached && cached.depth >= depth) {
    if (cached.flag === 0) return { score: cached.score, move: cached.move };
    if (cached.flag === 1 && cached.score >= beta) return { score: cached.score, move: cached.move };
    if (cached.flag === 2 && cached.score <= alpha) return { score: cached.score, move: cached.move };
  }
  if (depth <= 0) return { score: evaluate(cells, side, enteredMask), move: -1 };
  const moves = legalMoves(cells, side, entered, size);
  if (!moves.length) return { score: evaluate(cells, side, enteredMask), move: -1 };
  const orderContext = { ttMove, killers: context.killers, history: context.history, entered };
  moves.sort((a, b) => driveMoveScore(cells, b, side, size, ply, orderContext) - driveMoveScore(cells, a, side, size, ply, orderContext));
  let best = -INF, bestMove = moves[0];
  for (const move of moves) {
    const next = simulate(cells, move, side, enteredMask, size);
    const result = search(next.cells, 1 - side, next.enteredMask, depth - 1, -beta, -alpha, ply + 1, context, size);
    const score = -result.score;
    if (score > best) { best = score; bestMove = move; }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      const oldCharge = cellCharge(cells[move]);
      const newCharge = oldCharge + (entered[side] ? 1 : 3);
      if (newCharge < 4) {
        const killers = context.killers[ply];
        if (killers[0] !== move) { killers[1] = killers[0]; killers[0] = move; }
        const idx = side * 144 + move;
        context.history[idx] = Math.min(2_000_000, context.history[idx] + depth * depth);
      }
      break;
    }
    if (context.stopped) break;
  }
  const flag = best <= oldAlpha ? 2 : best >= beta ? 1 : 0;
  context.tt.set(key, { depth, score: best, flag, move: bestMove });
  return { score: best, move: bestMove };
}

export function chooseDriveDuelMove({ board, activePlayers = [0, 1], currentPlayer, hasEntered = [], difficulty = 2, movesPlayed = 0, signal = null }) {
  const size = board.length;
  if (size < 2 || size > 12 || board.some(row => row.length !== size)) return null;
  if (activePlayers.length !== 2) return null;
  const players = activePlayers;
  if (!players.includes(currentPlayer)) return null;
  const side = players.indexOf(currentPlayer);
  const entered = players.map(player => Boolean(hasEntered[player]));
  const enteredMask = (entered[0] ? 1 : 0) | (entered[1] ? 2 : 0);
  const cells = new Uint8Array(size * size);
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const cell = board[r][c];
    if (cell.owner === null || cell.owner === undefined || cell.count <= 0) continue;
    const localOwner = players.indexOf(cell.owner);
    if (localOwner >= 0) cells[r * size + c] = encode(localOwner, Math.min(15, cell.count));
  }
  const moves = legalMoves(cells, side, entered, size);
  if (!moves.length) return null;
  const config = effectiveSearchConfig(difficulty, movesPlayed);
  const startedAt = Date.now();
  const deadline = startedAt + config.timeMs;
  const context = makeContext(deadline);
  const moveContext = { ttMove: -1, killers: context.killers, history: context.history, entered };
  moves.sort((a, b) => driveMoveScore(cells, b, side, size, 0, moveContext) - driveMoveScore(cells, a, side, size, 0, moveContext));
  let bestMove = moves[0], bestScore = 0, completedDepth = 0;
  const completedMoves = [], completedScores = [];
  if (config.randomize && config.maxDepth <= 1) {
    const candidates = moves.slice(0, Math.min(3, moves.length));
    const picked = Math.random() < 0.3 ? candidates[Math.floor(Math.random() * candidates.length)] : candidates[0];
    return { r: Math.floor(picked / size), c: picked % size, depth: 1, score: quietHeuristic(cells, picked, side, entered, size) };
  }
  for (let depth = 1; depth <= config.maxDepth && Date.now() < deadline && !signal?.aborted; depth++) {
    context.stopped = false;
    const result = search(cells, side, enteredMask, depth, -INF, INF, 0, context, size);
    if (context.stopped || signal?.aborted || result.move < 0) break;
    bestMove = result.move; bestScore = result.score; completedDepth = depth;
    completedMoves.push(bestMove); completedScores.push(bestScore);
    if (Math.abs(bestScore) >= TERMINAL - 1000) break;
    if (depth >= 6 && Date.now() - startedAt >= config.softTimeMs && Date.now() - startedAt >= config.minTimeMs && completedMoves.length >= 3) {
      const recentMoves = completedMoves.slice(-3);
      const scoreDelta = Math.abs(bestScore - completedScores[completedScores.length - 3]);
      if (recentMoves.every(move => move === recentMoves[0]) && scoreDelta <= 8) break;
    }
  }
  return { r: Math.floor(bestMove / size), c: bestMove % size, depth: completedDepth || 1, score: bestScore };
}
