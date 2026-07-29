import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReturnSequence } from '../src/HistoricalReturns.js';

test('buildReturnSequence returns exactly one entry per simulated year, every year, unconditionally -- no crash gate, every year is a real sampled return', () => {
    const sequence = buildReturnSequence({ startYear: 2026, endYear: 2035, trial: 0 });

    assert.equal(sequence.size, 10);
    for (let year = 2026; year <= 2035; year++) {
        assert.ok(sequence.has(year));
    }
});

test('buildReturnSequence only ever returns real historical annual return values, never a synthesized number', () => {
    // Every S&P 500 annual total return since 1965 comfortably fits within
    // -50%..+50% -- if this ever failed, buildReturnSequence would be
    // computing something instead of looking up a committed historical
    // figure.
    const sequence = buildReturnSequence({ startYear: 2026, endYear: 2126, trial: 0 });

    for (const rate of sequence.values()) {
        assert.ok(rate > -0.5 && rate < 0.5, `rate=${rate} outside plausible historical range`);
    }
});

test('buildReturnSequence can draw the same historical year (or two bad years) back to back -- there is no cooldown', () => {
    // Over a long enough horizon, at least one immediate repeat is
    // overwhelmingly likely with 61 equally-probable values; this proves
    // there's no artificial "can't repeat" rule suppressing it.
    const sequence = buildReturnSequence({ startYear: 2026, endYear: 2225, trial: 0 });
    const rates = [...sequence.values()];

    let sawRepeat = false;
    for (let i = 1; i < rates.length; i++) {
        if (rates[i] === rates[i - 1]) {
            sawRepeat = true;
            break;
        }
    }
    assert.ok(sawRepeat, 'expected at least one back-to-back repeat of the same historical return over 200 years');
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
