import { test, expect } from "bun:test";
import { readFileSync } from "fs";
const acc = readFileSync(new URL("./account.js", import.meta.url), "utf8");
test("leaderboard auto period falls back week→month→season→year, manual pick is respected", () => {
  expect(acc).toContain("lbAutoPeriod: true");
  expect(acc).toContain("S.lbAutoPeriod ? PERIODS.map(([k]) => k) : [S.lbPeriod]");
  expect(acc).toContain("S.lbPeriod = el.dataset.period; S.lbAutoPeriod = false;");
  // switching difficulty/size does not turn manual mode off or on
  expect(acc).toMatch(/S\.lbKey = el\.dataset\.lbkey; S\.lbSize = null;/);
});
