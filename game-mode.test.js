// gameMode is the single source of truth for duel / party / online (2026-11-23 regression:
// after an online room the local duel lost its diagonal opening).
import { test, expect } from "bun:test";
import { readFileSync } from "fs";
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const fn = (name) => { const i = html.indexOf(`function ${name}(`); return html.slice(i, html.indexOf("\n        }\n", i)); };

test("diagonal opening and duel AI read only gameMode", () => {
  expect(html).not.toContain("isDuelGame");
  expect(fn("initBoard")).toContain("if (gameMode === 'duel' && getActivePlayers().length === 2)");
  expect(html).not.toMatch(/gameMode === 'duel' && !currentRoomId/);
});

test("online -> duel / party leaves the room so local moves never reach it", () => {
  const enter = fn("enterLocalMode");
  expect(enter).toContain("if (gameMode === 'online' || currentRoomId) leaveCloudRoom();");
  expect(enter).toContain("gameMode = mode;");
  expect(fn("startDuelGame")).toContain("enterLocalMode('duel')");
  expect(fn("startLocalGame")).toContain("enterLocalMode('party')");
  expect(fn("restoreArchive")).toContain("enterLocalMode(duel ? 'duel' : 'party')");
});

test("duel -> online, leave -> rejoin, reconnect keep mode consistent", () => {
  expect(fn("connectRoom")).toMatch(/if \(!restoring\) \{\s*enterOnlineMode\(\);/);
  expect(fn("leaveCloudRoom")).toContain("if (gameMode === 'online') gameMode = lastLocalMode;");
  // A reconnect (restoring = true) never changes the mode.
  expect(fn("scheduleRoomReconnect") || "").not.toContain("gameMode =");
});

test("simulated transitions", () => {
  let gameMode = 'duel', lastLocalMode = 'duel', currentRoomId = null, left = 0;
  const leaveCloudRoom = () => { left++; currentRoomId = null; if (gameMode === 'online') gameMode = lastLocalMode; };
  const enterLocalMode = (m) => { if (gameMode === 'online' || currentRoomId) leaveCloudRoom(); gameMode = m; };
  const enterOnlineMode = () => { if (gameMode !== 'online') lastLocalMode = gameMode; gameMode = 'online'; };
  const corners = (n) => gameMode === 'duel' && n === 2;
  enterOnlineMode(); currentRoomId = '123456';           // duel -> online
  expect(corners(2)).toBe(false);
  enterLocalMode('duel');                                 // online -> duel
  expect(left).toBe(1); expect(currentRoomId).toBe(null); expect(corners(2)).toBe(true);
  enterOnlineMode(); currentRoomId = '654321';
  enterLocalMode('party');                                // online -> party
  expect(gameMode).toBe('party'); expect(corners(2)).toBe(false);
  enterOnlineMode(); currentRoomId = '1'; leaveCloudRoom(); // leave -> back to last local mode
  expect(gameMode).toBe('party');
  enterOnlineMode(); currentRoomId = '1';                 // rejoin
  expect(gameMode).toBe('online');
});
