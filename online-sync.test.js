import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

function section(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = html.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return html.slice(start, end);
}

test("online move sender animates its own move although the server omits sender echo", () => {
  const click = section("async function handleCellClick(r, c)", "function createFlyingOrbAnimation(");
  assert.match(click, /if \(sent\)\s*\{[\s\S]*?enqueueOnlinePacket\(\{[\s\S]*?localOptimisticMove: true/);
  assert.match(click, /pendingOnlineMove = true;/);
  assert.match(click, /scheduleOnlineStateRequest\(\);/);
});

test("received remote move packets enter the same serialized animation queue", () => {
  const receiver = section("roomSocket.onmessage = (event) =>", "roomSocket.onerror = () =>");
  assert.match(receiver, /case 'playerMove':[\s\S]*?enqueueOnlinePacket\(packet\)/);
  assert.match(receiver, /case 'stateSnapshot':[\s\S]*?enqueueOnlinePacket\(packet\)/);
});

test("queued move animation completes before authoritative snapshot replaces board and turn", () => {
  const queue = section("async function drainOnlinePacketQueue()", "function syncRoomSettingsToCloud()");
  assert.match(queue, /if \(packet\.action === 'playerMove'\)[\s\S]*?if \(!packet\.localOptimisticMove\) pendingOnlineMove = false;[\s\S]*?await executeMove\(packet\.row, packet\.col, packet\.playerIndex\)/);
  assert.match(queue, /else if \(packet\.action === 'stateSnapshot'\)[\s\S]*?board = nextBoard;[\s\S]*?currentPlayer = packet\.currentTurnIndex/);
  assert.match(queue, /updateBoardCellsDOM\(\);[\s\S]*?updateTurnHeader\(\);/);
});

test("each client animates chain-reaction transfers and host publishes only the completed snapshot", () => {
  const move = section("async function executeMove(row, col, player", "function sleep(ms)");
  assert.match(move, /createFlyingOrbAnimation\(r, c, nr, nc/);
  assert.match(move, /while \(wave\.length > 0\)/);
  assert.match(move, /if \(currentRoomId && isHost\) syncFullSnapshotToCloud\(\);/);
});


test("player roles are read-only in connected rooms and control panel", () => {
  const lobby = section("function renderPlayerList(", "function renderEmojiGrid()");
  assert.match(lobby, /const roleLocked = Boolean\(currentRoomId\)/);
  assert.match(lobby, /roleLocked[\s\S]*?WIRE_PLAYER_TYPES\[playerTypes\[i\]\][\s\S]*?p-type-\$\{i\}/);
  const modal = section("function openControlPanelModal()", "const WIRE_PLAYER_TYPES =");
  assert.match(modal, /currentRoomId[\s\S]*?WIRE_PLAYER_TYPES\[playerTypes\[p\]\][\s\S]*?if \(!currentRoomId\)/);
});


test("untrusted player names and emojis are escaped before HTML rendering", () => {
  assert.ok(html.includes("function escapeHTML(value)"));
  const helperMatch = html.match(/function escapeHTML\(value\) \{[\s\S]*?\n        \}/);
  assert.ok(helperMatch, "escapeHTML helper exists");
  const escapeHTML = new Function(`${helperMatch[0]}; return escapeHTML;`)();
  assert.equal(escapeHTML(`"><img src=x onerror=alert(1)>`), `&quot;&gt;&lt;img src=x onerror=alert(1)&gt;`);
  assert.match(html, /value="\$\{escapeHTML\(playerNames\[i\]\)\}"/);
  assert.match(html, /<span>\$\{escapeHTML\(playerNames\[pIdx\]\)\}<\/span>/);
  assert.match(html, /<span>\$\{escapeHTML\(playerNames\[p\]\)\}<\/span>/);
  assert.match(html, /escapeHTML\(playerEmojis\[/);
});

test("remote player colors accept only six-digit hex values with optional alpha", () => {
  const helperMatch = html.match(/function normalizePlayerColor\(value\) \{[\s\S]*?\n        \}/);
  assert.ok(helperMatch, "normalizePlayerColor helper exists");
  const normalizePlayerColor = new Function(`${helperMatch[0]}; return normalizePlayerColor;`)();
  assert.equal(normalizePlayerColor("#12ab34FF"), "#12ab34");
  assert.equal(normalizePlayerColor("#12ab34"), "#12ab34");
  assert.equal(normalizePlayerColor("url(javascript:alert(1))"), null);
  assert.equal(normalizePlayerColor("#112233; background:url(x)"), null);
  assert.match(html, /playerColors\[i\] = normalizePlayerColor\(color\)/);
});

test("remote explosion travel uses explicit keyframes and a visible destination impact", () => {
  const flying = section("function createFlyingOrbAnimation(", "function createCascadeImpactAnimation(");
  let animationCall;
  let removed = false;
  const rects = {
    "cell-1-2": { left: 20, top: 30, width: 40, height: 40 },
    "cell-1-3": { left: 80, top: 70, width: 40, height: 40 }
  };
  const layer = { appendChild() {} };
  const container = { getBoundingClientRect: () => ({ left: 10, top: 10 }), appendChild() {} };
  const orb = {
    style: {},
    animate: (frames, options) => {
      animationCall = { frames, options, animation: { onfinish: null } };
      return animationCall.animation;
    },
    remove: () => { removed = true; }
  };
  const document = {
    getElementById: id => id === "board-container" ? container : id === "board-animation-layer" ? layer : rects[id] ? { getBoundingClientRect: () => rects[id] } : null,
    createElement: () => orb
  };
  const createFlyingOrbAnimation = new Function("document", "hexToRgbA", "escapeHTML", `${flying}; return createFlyingOrbAnimation;`)(document, () => "rgba(1,2,3,.6)", value => value);
  createFlyingOrbAnimation(1, 2, 1, 3, "#123456", "");
  assert.ok(animationCall, "the remote client starts a real animation");
  assert.equal(animationCall.frames.length, 3);
  const travel = animationCall.frames[1].transform.match(/translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0\)/);
  assert.ok(travel, "flight keyframe contains a translated destination");
  assert.ok(Math.abs(Number(travel[1]) - 60) < 0.01);
  assert.ok(Math.abs(Number(travel[2]) - 40) < 0.01);
  assert.equal(animationCall.options.duration, 300);
  assert.match(html, /\.board-animation-layer\s*\{[^}]*z-index:\s*10;[^}]*pointer-events:\s*none;/s);
  animationCall.animation.onfinish();
  assert.equal(removed, true, "the temporary orb is removed after the flight");

  const impact = section("function createCascadeImpactAnimation(", "async function executeMove(");
  assert.match(impact, /cell\.animate\(\[/);
  assert.match(impact, /boxShadow: `0 0 20px/);
  const move = section("async function executeMove(row, col, player", "function updateEliminationStatus()");
  assert.match(move, /affectedCells\.forEach\(\(\[nr, nc\]\) => createCascadeImpactAnimation/);
});
