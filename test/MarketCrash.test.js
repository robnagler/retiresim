import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCrashSequence } from '../src/MarketCrash.js';

const CRASHES = [
    { name: 'A', rate: -0.10 },
    { name: 'B', rate: -0.20 },
    { name: 'C', rate: -0.30 },
];

test('buildCrashSequence applies crashes in the configured order, cycling, with a one-year cooldown after each -- annualProbability=1 makes every eligible year crash, so the exact pattern is hand-computable', () => {
    const sequence = buildCrashSequence({ startYear: 2026, endYear: 2031, annualProbability: 1, crashes: CRASHES, trial: 0 });

    assert.deepEqual([...sequence.entries()], [[2026, -0.10], [2028, -0.20], [2030, -0.30]]);
});

test('buildCrashSequence cycles back to the first crash once the list is exhausted', () => {
    const sequence = buildCrashSequence({ startYear: 2026, endYear: 2033, annualProbability: 1, crashes: CRASHES, trial: 0 });

    assert.deepEqual([...sequence.entries()], [[2026, -0.10], [2028, -0.20], [2030, -0.30], [2032, -0.10]]);
});

test('buildCrashSequence never crashes when annualProbability is 0', () => {
    const sequence = buildCrashSequence({ startYear: 2026, endYear: 2040, annualProbability: 0, crashes: CRASHES, trial: 0 });

    assert.equal(sequence.size, 0);
});

test('buildCrashSequence is deterministic -- the same trial produces the identical sequence every call', () => {
    const a = buildCrashSequence({ startYear: 2026, endYear: 2061, annualProbability: 0.1, crashes: CRASHES, trial: 3 });
    const b = buildCrashSequence({ startYear: 2026, endYear: 2061, annualProbability: 0.1, crashes: CRASHES, trial: 3 });

    assert.deepEqual([...a.entries()], [...b.entries()]);
});

test('buildCrashSequence gives different trials different sequences', () => {
    const a = buildCrashSequence({ startYear: 2026, endYear: 2061, annualProbability: 0.1, crashes: CRASHES, trial: 0 });
    const b = buildCrashSequence({ startYear: 2026, endYear: 2061, annualProbability: 0.1, crashes: CRASHES, trial: 1 });

    assert.notDeepEqual([...a.entries()], [...b.entries()]);
});
