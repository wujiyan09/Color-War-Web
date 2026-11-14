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

test("mode tabs expose duel, multiplayer, and online panels", () => {
  assert.match(html, /id="tab-duel"[^>]*>双人模式/);
  assert.match(html, /id="tab-multiplayer"[^>]*>多人模式/);
  assert.match(html, /id="tab-online"[^>]*>联机模式/);
  for (const mode of ["duel", "multiplayer", "online"]) {
    assert.match(html, new RegExp(`switchModeTab\\('${mode}'\\)`));
    assert.match(html, new RegExp(`id="panel-${mode}"`));
  }
});

test("duel setup contains only the board slider, two role cards, and start action", () => {
  const panel = between('id="panel-duel"', 'id="panel-multiplayer"');
  assert.match(panel, /id="duel-board-size-slider"/);
  assert.match(panel, /id="duel-player-cards"/);
  assert.match(panel, /id="btn-start-duel"/);
  assert.doesNotMatch(panel, /ai-level-slider|random-first-toggle|local-player-list/);
  assert.match(html, /duelPlayerTypes\[index\] === 'human' \? 'mathNightmare' : 'human'/);
  assert.match(html, /function startDuelGame\(\)/);
  assert.match(html, /runRandomWheel\(active, \(selected\) => initBoard\(selected\)\)/);
});

test("multiplayer and online setup controls remain present", () => {
  const multiplayer = between('id="panel-multiplayer"', 'id="panel-online"');
  const online = between('id="panel-online"', '<!-- 对局界面 -->');
  for (const id of ["board-size-slider", "random-first-toggle", "ai-level-slider", "local-player-list", "btn-start-local"]) {
    assert.match(multiplayer, new RegExp(`id="${id}"`));
  }
  for (const id of ["online-nickname", "btn-create-room", "join-code-input", "online-room-hall", "online-player-list", "host-start-online-btn"]) {
    assert.match(online, new RegExp(`id="${id}"`));
  }
});

test("board-size controls stay synchronized across modes", () => {
  assert.match(html, /function syncBoardSizeControls\(\)/);
  assert.match(html, /\['duel', '', 'online'\]/);
  assert.match(html, /syncBoardSizeControls\(\);/);
});
