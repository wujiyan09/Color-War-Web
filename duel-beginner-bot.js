// 双人 Bot 3「入门」（强度 0）：包在 Bot 3 规则外的弱化外壳，不改任何引擎 / 搜索代码。
// drive-duel-ai.js 只导出 chooseDriveDuelMove（返回一步、不给候选排名），最低档也有深度 4，
// 所以这里自己排名：用和对局 / 引擎相同的规则（入场 +3、满 4 减 4 爆开、按格序逐波结算）走出每个合法步，
// 做 2 层（我走一步 → 对手最好回应）评估，加 ±40 噪声，并有 30% 概率在前 3 名里随机挑。
export const BEGINNER_STRENGTH = 0;
export const BEGINNER_NAME = '入门';
export const BEGINNER_DETAIL = '只看两步 · 带随机失误';
export const BEGINNER_AI_KEY = 'bot3-s0';
export const BEGINNER_AI_LABEL = 'Bot 3 · 入门';
export const BEGINNER_NOISE = 40;
export const BEGINNER_TOP_RANDOM = 0.3;
const MAX_REPLIES = 48;

function neighbors(i, n) {
  const r = Math.floor(i / n), c = i % n, out = [];
  if (c + 1 < n) out.push(i + 1); if (c > 0) out.push(i - 1);
  if (r + 1 < n) out.push(i + n); if (r > 0) out.push(i - n);
  return out;
}
// cells: [{o: -1|0|1, k: count}]
export function legalMoves(cells, side, entered) {
  const out = [];
  cells.forEach((x, i) => { if (entered ? (x.o === side && x.k > 0) : x.k === 0) out.push(i); });
  return out;
}
export function applyMove(cells, move, side, entered) {
  if (!legalMoves(cells, side, entered).includes(move)) return null;
  const n = Math.round(Math.sqrt(cells.length));
  const next = cells.map(x => ({ ...x }));
  next[move] = { o: side, k: next[move].k + (entered ? 1 : 3) };
  for (let guard = 0; guard < n * n * 8; guard++) {
    const wave = [];
    for (let i = 0; i < next.length; i++) if (next[i].k >= 4) wave.push(i);
    if (!wave.length) break;
    for (const i of wave) {
      const src = next[i]; if (src.k < 4) continue;
      const left = src.k - 4;
      next[i] = left > 0 ? { o: src.o, k: left } : { o: -1, k: 0 };
      for (const nb of neighbors(i, n)) next[nb] = { o: src.o, k: next[nb].k + 1 };
    }
  }
  return next;
}
function evaluate(cells, side) {
  const p = [0, 0], q = [0, 0];
  for (const x of cells) if (x.k > 0 && (x.o === 0 || x.o === 1)) { p[x.o]++; q[x.o] += x.k; }
  const opp = 1 - side;
  if (p[opp] === 0 && p[side] > 0) return 1e6;
  if (p[side] === 0 && p[opp] > 0) return -1e6;
  return (p[side] - p[opp]) * 35 + (q[side] - q[opp]) * 4;
}
export function rankedCandidates(cells, side, entered) {
  const opp = 1 - side, out = [];
  for (const m of legalMoves(cells, side, entered[side])) {
    const next = applyMove(cells, m, side, entered[side]);
    if (!next) continue;
    let score = evaluate(next, side);
    if (Math.abs(score) < 9e5) {
      let worst = score;
      for (const r of legalMoves(next, opp, entered[opp]).slice(0, MAX_REPLIES)) {
        const after = applyMove(next, r, opp, entered[opp]);
        if (after) worst = Math.min(worst, evaluate(after, side));
      }
      score = worst;
    }
    out.push({ move: m, score });
  }
  return out.sort((a, b) => b.score - a.score);
}
export function chooseBeginnerMove({ board, activePlayers = [0, 1], currentPlayer, hasEntered = [], random = Math.random }) {
  const n = board.length;
  if (activePlayers.length !== 2) return null;
  const side = activePlayers.indexOf(currentPlayer);
  if (side < 0) return null;
  const cells = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x = board[r][c], s = x && x.count > 0 ? activePlayers.indexOf(x.owner) : -1;
    cells.push(s >= 0 ? { o: s, k: x.count } : { o: -1, k: 0 });
  }
  const entered = activePlayers.map(p => Boolean(hasEntered[p]));
  const noisy = rankedCandidates(cells, side, entered)
    .map(x => ({ move: x.move, score: x.score + (random() * 2 - 1) * BEGINNER_NOISE }))
    .sort((a, b) => b.score - a.score);
  if (!noisy.length) return null;
  let pick = noisy[0];
  if (noisy.length > 1 && random() < BEGINNER_TOP_RANDOM) {
    const top = noisy.slice(0, 3);
    pick = top[Math.min(top.length - 1, Math.floor(random() * top.length))];
  }
  return { r: Math.floor(pick.move / n), c: pick.move % n };
}
