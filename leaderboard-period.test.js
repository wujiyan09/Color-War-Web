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
test("periods are 周榜/月榜/总榜 and stats refresh after uploading matches", () => {
  expect(acc).toContain("const PERIODS = [['week', '周榜'], ['month', '月榜'], ['all', '总榜']];");
  expect(acc).not.toContain("季榜");
  expect(acc).toContain("try { setUser((await api('GET', '/api/me')).user); render(); }");
});
test("friends list cached locally and refreshed once on load", () => {
  expect(acc).toContain("readJSON('CW_Account_CachedFriends', null)");
  expect(acc).toContain("writeJSON('CW_Account_CachedFriends', S.friends)");
  expect(acc).toContain("refreshFriends().then(render); // 先显示本机缓存的好友");
});
test("修改密码 dialog posts old + new twice to /api/me/password", () => {
  expect(acc).toContain("api('POST', '/api/me/password', { oldPassword: old, password: pw, confirmPassword: pw2 })");
  expect(acc).toContain("$('acc-change-pw').onclick = showChangePassword");
});
