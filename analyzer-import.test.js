import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { encodeFrame, decodeCell } from "./account.js";
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const acc = readFileSync(new URL("./account.js", import.meta.url), "utf8");

test("recent games list: rolling 5, pin, delete, import", () => {
  expect(acc).toContain("replays.filter(r => r.isSaved || ++unsaved <= 5)");
  expect(acc).toContain("toggleSavedReplay(id)");
  expect(acc).toContain("deleteReplay(id)");
  expect(acc).toContain("acc-import-analyzer");
  expect(html).toContain('id="an-recent"');
  expect(html).toContain("data-animport");
});

test("analyzer slider, best move and branching keep the imported line intact", () => {
  expect(html).toContain('id="an-frame"');
  expect(html).toContain("function anBestMove()");
  expect(html).toContain("if (AN.onLine) anLeaveLine();");
  expect(html).not.toMatch(/AN\.line\.(moves|frames)\s*(=|\.push|\.splice)/);
  expect(html).toContain("回到导入的对局");
});

test("frames decode to the same board", () => {
  const b = [[{ owner: 0, count: 1 }, { owner: null, count: 0 }], [{ owner: null, count: 0 }, { owner: 3, count: 2 }]];
  const f = encodeFrame(b);
  expect(decodeCell(f, 2, 0, 0)).toEqual({ owner: 0, count: 1 });
  expect(decodeCell(f, 2, 1, 1)).toEqual({ owner: 3, count: 2 });
});
