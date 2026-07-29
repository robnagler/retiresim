import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomValue, RANDOM_TABLE_LENGTH } from '../src/RandomTable.js';

test('randomValue is deterministic and stable across repeated calls for the same (year, trial)', () => {
    const a = randomValue(2026, 2030, 0);
    const b = randomValue(2026, 2030, 0);

    assert.equal(a, b);
    assert.ok(a >= 0 && a < 1);
});

test('randomValue advances by one table entry per year within the same trial', () => {
    const year0 = randomValue(2026, 2026, 0);
    const year1 = randomValue(2026, 2027, 0);

    assert.notEqual(year0, year1);
});

test('randomValue gives different trials a well-separated slice of the table, not the same window shifted by one', () => {
    const trial0 = randomValue(2026, 2026, 0);
    const trial1 = randomValue(2026, 2026, 1);

    assert.notEqual(trial0, trial1);
});

test('randomValue wraps around the table length instead of going out of bounds for a far-future year', () => {
    const farYear = 2026 + RANDOM_TABLE_LENGTH * 3 + 5;

    const value = randomValue(2026, farYear, 0);

    assert.ok(value >= 0 && value < 1);
});
