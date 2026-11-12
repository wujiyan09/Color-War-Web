const { readFileSync } = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = readFileSync(new URL('./index.html', `file://${__filename}`), 'utf8');
const start = html.indexOf('        class AISolver {');
const end = html.indexOf('\n        window.addEventListener', start);
assert.notEqual(start, -1, 'AISolver class exists in the page');
assert.notEqual(end, -1, 'AISolver class has a closing marker');
const AISolver = new Function('MAX_PLAYERS', `${html.slice(start, end)}; return AISolver;`)(8);

function board(size = 5) {
    return Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({ owner: null, count: 0 })));
}
function solver({ grid = board(), active = [0, 1], current = 0, entered = [true, true], eliminated = [false, false], level = 1, roomCode = '', moveCounts = null } = {}) {
    return new AISolver(grid.length, active, current, 'Nightmare', level, grid, entered, eliminated, roomCode, moveCounts);
}

test('a player first placement adds three orbs', () => {
    const instance = solver({ entered: [false, false] });
    const state = {
        cells: instance.cells.map(cell => ({ ...cell })),
        hasEntered: [...instance.hasEntered],
        eliminated: [...instance.eliminated],
        turn: 0
    };
    instance.simulateSearchMove(state, 12);
    assert.deepEqual(state.cells[12], { owner: 0, count: 3 });
    assert.equal(state.hasEntered[0], true);
    assert.equal(state.turn, 1);
});

test('chain simulation captures cells and eliminates an entered player', () => {
    const grid = board();
    grid[2][2] = { owner: 0, count: 3 };
    grid[1][2] = { owner: 1, count: 1 };
    const instance = solver({ grid });
    const state = {
        cells: instance.cells.map(cell => ({ ...cell })),
        hasEntered: [...instance.hasEntered],
        eliminated: [...instance.eliminated],
        turn: 0
    };
    instance.simulateSearchMove(state, 12);
    assert.equal(state.cells[12].count, 0);
    assert.equal(state.cells[7].owner, 0);
    assert.equal(state.cells[7].count, 2);
    assert.equal(state.eliminated[1], true);
});

test('bounded MaxN search returns a legal move and scores three-player states', () => {
    const grid = board();
    grid[4][4] = { owner: 0, count: 1 };
    grid[0][0] = { owner: 1, count: 1 };
    const instance = solver({ grid, active: [0, 1, 2], entered: [true, true, false], level: 1 });
    const move = instance.calculateBestMove(null);
    assert.ok(move);
    assert.equal(grid[move.r][move.c].owner, 0);

    const state = {
        cells: instance.cells.map(cell => ({ ...cell })),
        hasEntered: [...instance.hasEntered],
        eliminated: [...instance.eliminated],
        turn: 0
    };
    const config = { beam: 4 };
    const result = instance.searchMaxN(state, 2, config, Date.now() + 1000, null, new Map(), () => true);
    assert.equal(result.complete, true);
    assert.deepEqual(Object.keys(result.scores).sort(), ['0', '1', '2']);
});

test('Drive opening selector has 13 deterministic geometries and uses a legal square', () => {
    assert.equal(AISolver.driveOpeningPatterns(6).length, 13);
    assert.deepEqual(AISolver.driveOpeningPatterns(9), AISolver.driveOpeningPatterns(9));
    assert.equal(AISolver.driveOpeningPatterns(5), null);
    const instance = solver({ grid: board(6), entered: [false, false] });
    instance.roomCode = 'TEST-ROOM';
    const legal = instance.getPlayableCells(0, instance.cells);
    const move = instance.driveOpeningMove(legal);
    assert.ok(move);
    assert.ok(legal.some(candidate => candidate.r === move.r && candidate.c === move.c));
});

test('manual Drive ordinary move ordering retains tuned center/charge terms', () => {
    const instance = solver({ grid: board(5), entered: [false, true] });
    const center = instance.driveMovePriority({ r: 2, c: 2 }, {
        cells: instance.cells, hasEntered: [false, true], eliminated: [false, false], turn: 0
    });
    assert.equal(center, 27, 'a first placement adds three, so the empty-cell ordering score uses charge 3');
});


test("Drive two-player opening sequence resumes at this player's move count", () => {
    const roomCode = 'TEST-ROOM';
    const instance = solver({ grid: board(6), entered: [false, false], level: 4, roomCode, moveCounts: [0, 0] });
    const pattern = AISolver.driveOpeningPatterns(6)[AISolver.fnv1a(roomCode) % 13];
    const allCells = Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => ({ r, c }))).flat();
    assert.deepEqual(instance.driveOpeningMove(allCells), { r: pattern[0][1], c: pattern[0][0] });
    instance.moveCounts[0] = 1;
    assert.deepEqual(instance.driveOpeningMove(allCells), { r: pattern[1][1], c: pattern[1][0] });
    instance.moveCounts[0] = 11;
    assert.deepEqual(instance.driveOpeningMove(allCells), { r: pattern[11][1], c: pattern[11][0] });
});

test('Drive move-order chain terms require linked opposing critical cells and use their charges', () => {
    const grid = board(5);
    grid[2][2] = { owner: 0, count: 3 };
    grid[2][3] = { owner: 1, count: 3 };
    grid[4][4] = { owner: 0, count: 1 };
    const instance = solver({ grid, entered: [true, true], current: 0, level: 4 });
    const move = { r: 4, c: 4 };
    const state = { cells: instance.cells, hasEntered: instance.hasEntered, eliminated: instance.eliminated, turn: 0 };
    assert.equal(instance.driveMovePriority(move, state), -319.5,
        '280 + 12×3 is penalized only because an own critical cell touches an enemy critical cell');
});

test('multiplayer legacy move priority still includes own critical-cell charge', () => {
    const grid = board(5);
    grid[2][2] = { owner: 0, count: 3 };
    const instance = solver({ grid, active: [0, 1, 2], entered: [true, true, true], current: 0, level: 4 });
    const state = { cells: instance.cells, hasEntered: instance.hasEntered, eliminated: instance.eliminated, turn: 0 };
    assert.equal(instance.driveMovePriority({ r: 2, c: 1 }, state), -316.25);
});

test('two-player null-move pruning uses Drive depth and material gates', () => {
    assert.match(html, /depth>=3&&beta-alpha===1&&state\.cells\.filter\(cell=>cell\.owner===state\.turn\)\.length>=3/);
    assert.match(html, /reduction=depth>=6\?3:2/);
});

test('two-player static score uses Drive turn-dependent best-capture multiplier without doubling zero-sum scores', () => {
    const grid = board(5);
    grid[2][2] = { owner: 0, count: 3 };
    grid[0][0] = { owner: 1, count: 1 };
    const instance = solver({ grid, entered: [true, true], current: 0, level: 4 });
    const state = { cells: instance.cells, hasEntered: instance.hasEntered, eliminated: instance.eliminated, turn: 0 };
    const vector = instance.driveEvaluationVector(state);
    assert.equal(instance.driveEvaluationScalar(state, 0), vector[0]);
    assert.notEqual(instance.driveEvaluationScalar(state, 0), vector[0] - vector[1]);
});

test('Medium has a deliberate second-best branch; Easy follows the 25/45/30 mix', () => {
    const grid = board();
    grid[4][4] = { owner: 0, count: 1 };
    grid[4][3] = { owner: 0, count: 1 };
    grid[0][0] = { owner: 1, count: 1 };
    const medium = solver({ grid, entered: [true, true], level: 2 });
    const ranked = medium.getPlayableCells(0, medium.cells)
        .map(move => ({ move, score: medium.driveMovePriority(move, {
            cells: medium.cells, hasEntered: medium.hasEntered, eliminated: medium.eliminated, turn: 0
        }) })).sort((a, b) => b.score - a.score);
    const originalRandom = Math.random;
    try {
        Math.random = () => 0.1;
        const secondBest = medium.calculateBestMove(null);
        assert.deepEqual(secondBest, ranked[1].move);

        const easy = solver({ grid, entered: [true, true], level: 1 });
        let seq = [0.1, 0];
        Math.random = () => seq.shift() ?? 0;
        const randomLegal = easy.calculateBestMove(null);
        assert.ok(easy.getPlayableCells(0, easy.cells).some(m => m.r === randomLegal.r && m.c === randomLegal.c));
        seq = [0.5, 0];
        const topHalf = easy.calculateBestMove(null);
        const top = easy.getPlayableCells(0, easy.cells).map(move => ({ move, score: easy.driveMovePriority(move, {
            cells: easy.cells, hasEntered: easy.hasEntered, eliminated: easy.eliminated, turn: 0
        }) })).sort((a, b) => b.score - a.score).slice(0, Math.ceil(easy.getPlayableCells(0,easy.cells).length/2));
        assert.ok(top.some(item => item.move.r === topHalf.r && item.move.c === topHalf.c));
        seq = [0.9];
        const best = easy.calculateBestMove(null);
        assert.deepEqual(best, top[0].move);
    } finally {
        Math.random = originalRandom;
    }
});

test('multiplayer first placement uses legacy non-corner opening, then Drive MaxN search', () => {
    const multiplayer = solver({ grid: board(5), active: [0, 1, 2], current: 0,
        entered: [false, false, false], eliminated: [false, false, false], level: 4 });
    const originalLegacyOpening = multiplayer.selectOptimalOpeningMove;
    let usedLegacyOpening = false;
    let usedDriveOpening = false;
    multiplayer.selectOptimalOpeningMove = function (moves) {
        usedLegacyOpening = true;
        assert.ok(moves.length > 0);
        assert.ok(moves.every(move => !this.isCornerCell(move)), 'legacy selector receives non-corner candidates when available');
        return originalLegacyOpening.call(this, moves);
    };
    multiplayer.driveOpeningMove = () => { usedDriveOpening = true; return { r: 0, c: 0 }; };
    const opening = multiplayer.calculateBestMove(null);
    assert.equal(usedLegacyOpening, true);
    assert.equal(usedDriveOpening, false);
    assert.equal(multiplayer.isCornerCell(opening), false);

    // Once the player has entered, the same >2-player game goes through the newer MaxN search.
    const midgameBoard = board(5);
    midgameBoard[2][2] = { owner: 0, count: 1 };
    midgameBoard[0][1] = { owner: 1, count: 1 };
    midgameBoard[1][0] = { owner: 2, count: 1 };
    const midgame = solver({ grid: midgameBoard, active: [0, 1, 2], current: 0,
        entered: [true, true, true], eliminated: [false, false, false], level: 4 });
    let maxNSearchCalls = 0;
    midgame.searchMaxN = function () {
        maxNSearchCalls++;
        return { scores: { 0: 10, 1: 0, 2: 0 }, complete: true };
    };
    const searchedMove = midgame.calculateBestMove(null);
    assert.ok(searchedMove);
    assert.ok(maxNSearchCalls > 0, 'multiplayer midgame uses the Drive-derived MaxN search');
});

test('configured multiplayer keeps the legacy opening after live seats fall to two', () => {
    const multiplayer = solver({ grid: board(5), active: [0, 1, 2], current: 0,
        entered: [false, true, false], eliminated: [false, false, true], level: 4 });
    let usedLegacy = false;
    multiplayer.selectOptimalOpeningMove = moves => { usedLegacy = true; return moves[0]; };
    multiplayer.driveOpeningMove = () => { throw new Error('multiplayer must not enter the two-player book'); };
    multiplayer.calculateBestMove(null);
    assert.equal(usedLegacy, true);
});

test('multiplayer scalar keeps legacy strongest-opponent comparison', () => {
    const grid = board(5);
    grid[2][2] = { owner: 0, count: 2 };
    grid[0][0] = { owner: 1, count: 1 };
    grid[4][4] = { owner: 2, count: 3 };
    const instance = solver({ grid, active: [0, 1, 2], entered: [true, true, true], current: 0, level: 4 });
    const state = { cells: instance.cells, hasEntered: instance.hasEntered, eliminated: instance.eliminated, turn: 0 };
    const scores = instance.driveEvaluationVector(state);
    assert.equal(instance.driveEvaluationScalar(state, 0), scores[0] - Math.max(scores[1], scores[2]));
});

test('two-player first placement keeps the Drive opening behavior', () => {
    const instance = solver({ grid: board(5), active: [0, 1], entered: [false, false], level: 4 });
    const expected = { r: 0, c: 1 };
    let legacyCalled = false;
    instance.selectOptimalOpeningMove = () => { legacyCalled = true; return { r: 2, c: 2 }; };
    instance.driveOpeningMove = () => expected;
    assert.deepEqual(instance.calculateBestMove(null), expected);
    assert.equal(legacyCalled, false);
});



test('three-player search stays MaxN even when one seat is eliminated', () => {
    const grid = board(5);
    grid[2][2] = { owner: 0, count: 1 };
    grid[0][1] = { owner: 1, count: 1 };
    const instance = solver({ grid, active: [0, 1, 2], current: 0,
        entered: [true, true, true], eliminated: [false, false, true], level: 4 });
    let maxNCalls = 0;
    instance.searchMaxN = () => { maxNCalls++; return { scores: { 0: 5, 1: 0, 2: -5 }, complete: true }; };
    instance.searchRootPVS = () => { throw new Error('configured multiplayer must not use two-player root PVS'); };
    instance.calculateBestMove(null);
    assert.ok(maxNCalls > 0);
});

test('two-player root uses PVS scout then full re-search for an in-window improvement', () => {
    const instance = solver();
    const windows = [];
    instance.searchNegamax = (_child, _depth, alpha, beta, _ctx, _ply) => {
        windows.push([alpha,beta]);
        return { value: -7, complete: true };
    };
    const result = instance.searchRootPVS({}, 4, 5, 10, {}, 1, false);
    assert.deepEqual(windows, [[-6,-5],[-10,-5]]);
    assert.equal(result.value, -7);
});

test('root PVS first child gets the full window and later fail-soft scout can avoid re-search', () => {
    const instance = solver();
    const windows = [];
    instance.searchNegamax = (_child, _depth, alpha, beta) => {
        windows.push([alpha,beta]);
        return { value: -12, complete: true };
    };
    instance.searchRootPVS({}, 3, 5, 10, {}, 1, true);
    assert.deepEqual(windows, [[-10,-5]]);
    windows.length = 0;
    instance.searchRootPVS({}, 3, 5, 10, {}, 1, false);
    assert.deepEqual(windows, [[-6,-5]]);
});

test('soft-stop requires three identical root moves and score gap at most eight', () => {
    const instance = solver();
    assert.equal(instance.driveStableSoftStop(['a','a','a'], [10,15,18]), true);
    assert.equal(instance.driveStableSoftStop(['a','b','a'], [10,15,18]), false);
    assert.equal(instance.driveStableSoftStop(['a','a','a'], [10,15,19]), false);
    assert.equal(instance.driveStableSoftStop(['a','a'], [10,15]), false);
});


test('aspiration failures widen asymmetrically and cap at the Drive threshold', () => {
    const instance = solver();
    assert.deepEqual(instance.driveAspirationWindow(40, 100, true), { alpha: -60, beta: 41 });
    assert.deepEqual(instance.driveAspirationWindow(40, 100, false), { alpha: 39, beta: 140 });
    assert.equal(instance.driveAspirationWindow(40, 8000, true), null);
});
