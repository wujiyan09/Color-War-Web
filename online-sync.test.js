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
