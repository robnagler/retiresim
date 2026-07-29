import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReturnSequence } from '../../src/biz/HistoricalReturns.js';

test('buildReturnSequence returns exactly one entry per simulated year, every year, unconditionally -- no crash gate, every year is a real sampled return', () => {
    const sequence = buildReturnSequence({ startYear: 2026, endYear: 2035, trial: 0 });

    assert.equal(sequence.size, 10);
    for (let year = 2026; year <= 2035; year++) {
        assert.ok(sequence.has(year));
    }
});

test('buildReturnSequence only ever returns real historical annual (return, inflation) pairs, never a synthesized number', () => {
    // Every S&P 500 annual total return since 1965 comfortably fits within
    // -50%..+50%, and every annual inflation rate within -5%..+20% -- if
    // this ever failed, buildReturnSequence would be computing something
    // instead of looking up a committed historical figure.
    const sequence = buildReturnSequence({ startYear: 2026, endYear: 2126, trial: 0 });

    for (const { sp500Rate, inflationRate } of sequence.values()) {
        assert.ok(sp500Rate > -0.5 && sp500Rate < 0.5, `sp500Rate=${sp500Rate} outside plausible historical range`);
        assert.ok(inflationRate > -0.05 && inflationRate < 0.2, `inflationRate=${inflationRate} outside plausible historical range`);
    }
});

test('buildReturnSequence pairs each year\'s sp500Rate with the SAME historical year\'s inflationRate, not an independent draw', () => {
    // If sp500Rate and inflationRate were drawn independently, a given
    // sp500Rate value could show up paired with more than one distinct
    // inflationRate value across many draws. Since they're actually the
    // same historical year's two figures, every occurrence of a given
    // sp500Rate must always carry the identical inflationRate.
    const sequence = buildReturnSequence({ startYear: 2026, endYear: 2226, trial: 0 });
    const pairingByReturn = new Map();

    for (const { sp500Rate, inflationRate } of sequence.values()) {
        if (pairingByReturn.has(sp500Rate)) {
            assert.equal(inflationRate, pairingByReturn.get(sp500Rate));
        } else {
            pairingByReturn.set(sp500Rate, inflationRate);
        }
    }
    assert.ok(pairingByReturn.size > 1, 'expected more than one distinct historical year to have been sampled');
});

test('buildReturnSequence never repeats a historical year within one 61-year cycle', () => {
    // A horizon of exactly 61 years consumes the whole shuffled pool once,
    // with no reshuffle -- every sp500Rate value drawn must be distinct.
    const sequence = buildReturnSequence({ startYear: 2026, endYear: 2086, trial: 0 });
    const rates = [...sequence.values()].map((r) => r.sp500Rate);

    assert.equal(sequence.size, 61);
    assert.equal(new Set(rates).size, 61, 'expected all 61 draws to be distinct historical years');
});

test('buildReturnSequence reshuffles (a fresh permutation, not a repeat of the first) once the 61-year pool is exhausted', () => {
    // A 122-year horizon exhausts the pool exactly twice -- each half
    // should independently contain all 61 distinct years, but the second
    // half's order should differ from the first's (an actual reshuffle,
    // not the same permutation replayed).
    const sequence = buildReturnSequence({ startYear: 2026, endYear: 2147, trial: 0 });
    const rates = [...sequence.values()].map((r) => r.sp500Rate);
    const firstCycle = rates.slice(0, 61);
    const secondCycle = rates.slice(61, 122);

    assert.equal(rates.length, 122);
    assert.equal(new Set(firstCycle).size, 61);
    assert.equal(new Set(secondCycle).size, 61);
    assert.notDeepEqual(firstCycle, secondCycle, 'expected the second cycle to be a different shuffle order than the first');
});

test('buildReturnSequence is deterministic -- the same trial produces the identical sequence every call', () => {
    const a = buildReturnSequence({ startYear: 2026, endYear: 2061, trial: 3 });
    const b = buildReturnSequence({ startYear: 2026, endYear: 2061, trial: 3 });

    assert.deepEqual([...a.entries()], [...b.entries()]);
});

test('buildReturnSequence gives different trials different sequences', () => {
    const a = buildReturnSequence({ startYear: 2026, endYear: 2061, trial: 0 });
    const b = buildReturnSequence({ startYear: 2026, endYear: 2061, trial: 1 });

    assert.notDeepEqual([...a.entries()], [...b.entries()]);
});
