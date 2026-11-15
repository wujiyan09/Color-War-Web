import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

function between(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return html.slice(start, end);
}

test("duel starts with two human players by default and always starts red", () => {
  assert.match(html, /let duelPlayerTypes = \['human', 'human'\]/);
  const duelStart = between("function startDuelGame()", "function renderPlayerList(");
  assert.match(duelStart, /isDuelGame = true;\s*isRandomFirst = false;\s*initBoard\(active\[0\]\)/);
  assert.doesNotMatch(duelStart, /runRandomWheel/);
});

test("local two-player duel seeds red and blue in opposite corners", () => {
  const init = between("function initBoard(firstPlayer)", "function getOrbPercentage(");
  assert.match(init, /if \(isDuelGame && !currentRoomId && getActivePlayers\(\)\.length === 2\)/);
  assert.match(init, /board\[0\]\[0\] = \{ owner: redPlayer, count: 1 \}/);
  assert.match(init, /board\[boardSize - 1\]\[boardSize - 1\] = \{ owner: bluePlayer, count: 1 \}/);
  assert.match(init, /hasEntered\[redPlayer\] = true/);
  assert.match(init, /hasEntered\[bluePlayer\] = true/);
  assert.match(init, /currentPlayer = redPlayer/);
});

test("in-game role editing is disabled only for local two-player duel", () => {
  const controls = between("function openControlPanelModal()", "const WIRE_PLAYER_TYPES =");
  assert.match(controls, /const isLocalTwoPlayerDuel = isDuelGame && !currentRoomId && getActivePlayers\(\)\.length === 2/);
  assert.match(controls, /currentRoomId \|\| isLocalTwoPlayerDuel\s*\? `<span>/);
  assert.match(controls, /if \(!currentRoomId && !isLocalTwoPlayerDuel\)/);
  assert.match(controls, /<select id="ctrl-p-\$\{p\}">/);
});

test("multiplayer random-first and difficulty controls remain available", () => {
  assert.match(html, /id="random-first-toggle"/);
  assert.match(html, /id="ai-level-slider"/);
  assert.match(html, /function startLocalGame\(\)[\s\S]*?runRandomWheel\(active, \(selected\) => initBoard\(selected\)\)/);
});


test("duel role-switch buttons trigger guarded vibration feedback", () => {
  const haptics = between("const Haptics = {", "// Roster names/emojis");
  assert.match(haptics, /light\(\) \{ if \(typeof navigator !== 'undefined' && typeof navigator\.vibrate === 'function'\) navigator\.vibrate\(12\); \}/);
  const cards = between("function renderDuelPlayerCards()", "function startDuelGame()");
  assert.match(cards, /card\.onclick = \(\) => \{[\s\S]*?Haptics\.light\(\);[\s\S]*?duelPlayerTypes\[index\] =/);
});

test("duel board-size slider offers only 6, 9, and 12 while other modes remain unchanged", () => {
  assert.match(html, /id="duel-board-size-slider" min="6" max="12" step="3" value="9"/);
  assert.match(html, /const DUEL_BOARD_SIZES = \[6, 9, 12\]/);
  assert.match(html, /function nearestDuelBoardSize\(size\)/);
  const duelInput = between("document.getElementById('duel-board-size-slider').oninput", "document.getElementById('board-size-slider').oninput");
  assert.match(duelInput, /nearestDuelBoardSize\(parseInt\(e\.target\.value, 10\)\)/);
  assert.match(duelInput, /e\.target\.value = boardSize/);
  const modeSwitch = between("function switchModeTab(mode)", "function syncBoardSizeControls()");
  assert.match(modeSwitch, /if \(mode === 'duel'\) boardSize = nearestDuelBoardSize\(boardSize\)/);
  assert.match(html, /id="board-size-slider" min="5" max="12" value="8"/);
  assert.match(html, /id="online-board-size-slider" min="5" max="12" value="8"/);
});
