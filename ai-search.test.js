const { readFileSync } = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = readFileSync(new URL('./index.html', `file://${__filename}`), 'utf8');
const start = html.indexOf('        class AISolver {');
const end = html.indexOf('\n        window.addEventListener', start);
assert.notEqual(start, -1, 'AISolver class exists in the page');
assert.notEqual(end, -1, 'AISolver class has a closing marker');
const AISolver = new Function(`${html.slice(start, end)}; return AISolver;`)();

function board(size = 5) {
    return Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({ owner: null, count: 0 })));
}
function solver({ grid = board(), active = [0, 1], current = 0, entered = [true, true], eliminated = [false, false], level = 1 } = {}) {
    return new AISolver(grid.length, active, current, 'Nightmare', level, grid, entered, eliminated);
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
    const instance = solver({ grid: board(5) });
    const center = instance.driveMovePriority({ r: 2, c: 2 }, {
        cells: instance.cells, hasEntered: [true, true], eliminated: [false, false], turn: 0
    });
    assert.equal(center, 21.5);
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
