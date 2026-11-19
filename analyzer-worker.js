import { analyzerBestMove } from "./botpick-engine.js";
self.onmessage = (e) => {
  const { cells, size, side, timeMs } = e.data;
  let move = null;
  try { move = analyzerBestMove({ cells, size, side, timeMs }); } catch { move = null; }
  self.postMessage({ move });
};
