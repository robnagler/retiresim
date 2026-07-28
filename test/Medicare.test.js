import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Medicare } from '../src/Medicare.js';
import { Config } from '../src/Config.js';
import { FakeBookkeeper } from './support/FakeBookkeeper.js';

const build = () => new Medicare({
    name: 'Medicare',
    config: new Config({
        Medicare: {
            balance: 0,
            partBMonthly: 175,
            partDMonthly: 50,
            partGMonthly: 150,
        },
    }),
});

test('constructor combines partB/partD/partGMonthly into one yearly premium -- the raw cfg values aren\'t duplicated onto the instance', () => {
    const m = build();
    assert.equal(m.yearly, (175 + 50 + 150) * 12);
    assert.equal(m.partBMonthly, undefined);
    assert.equal(m.partDMonthly, undefined);
    assert.equal(m.partGMonthly, undefined);
});

test('irmaaSurcharge returns the lowest bracket that covers magi', () => {
    const m = build();
    assert.deepEqual(m.irmaaSurcharge(50000), { upTo: 106000, partB: 0, partD: 0 });
    assert.deepEqual(m.irmaaSurcharge(106000), { upTo: 106000, partB: 0, partD: 0 });
});

test('irmaaSurcharge jumps to the whole next tier just above the threshold -- a cliff, not a marginal stack', () => {
    const m = build();
    assert.deepEqual(m.irmaaSurcharge(106001), { upTo: 133000, partB: 900, partD: 170 });
});

test('irmaaSurcharge falls into the top open-ended bracket above the highest threshold', () => {
    const m = build();
    assert.deepEqual(m.irmaaSurcharge(999999), { upTo: null, partB: 5400, partD: 1050 });
});

test('runYear inflates the combined yearly premium by rate and adds the IRMAA surcharge for the given magi', () => {
    const m = build();
    const bookkeeper = new FakeBookkeeper({ magi: 50000, economy: { inflationRate: 0.05 } });

    m.runYear({ year: 2026, bookkeeper });

    assert.equal(m.yearly, (175 + 50 + 150) * 12 * 1.05);
    assert.equal(m.owed, (175 + 50 + 150) * 12 * 1.05);
});

test('runYear adds the IRMAA surcharge on top of the inflated base premium when magi crosses a threshold -- Medigap has no IRMAA', () => {
    const m = build();
    const bookkeeper = new FakeBookkeeper({ magi: 120000, economy: { inflationRate: 0.05 } });

    m.runYear({ year: 2026, bookkeeper });

    assert.equal(m.owed, (175 + 50 + 150) * 12 * 1.05 + 900 + 170);
});

test('runYear reads bookkeeper.taxCalculator.magi -- last year\'s value, since TaxCalculator.prepareNextYear updates it later in the same annual cycle', () => {
    const m = build();
    const bookkeeper = new FakeBookkeeper({ magi: 600000, economy: { inflationRate: 0.05 } });

    m.runYear({ year: 2026, bookkeeper });

    assert.equal(m.owed, (175 + 50 + 150) * 12 * 1.05 + 5400 + 1050);
});

test('runYear grows the IRMAA upTo thresholds by inflationRate, which can move magi into a lower tier than the un-grown brackets would', () => {
    const m = build();
    // 110000 is just above the base $106,000 threshold (900/170 tier), but
    // one year of 10% growth moves that threshold to $116,600 -- enough to
    // pull 110000 back under it, into the no-surcharge tier.
    const bookkeeper = new FakeBookkeeper({ magi: 110000, economy: { inflationRate: 0.10 } });

    m.runYear({ year: 2026, bookkeeper });

    assert.deepEqual(m.irmaaBrackets[0], { upTo: 106000 * 1.10, partB: 0, partD: 0 });
    assert.equal(m.owed, (175 + 50 + 150) * 12 * 1.10);
});

test('due reports the amount computed by runYear under the MedicarePremium cash-flow category', () => {
    const m = build();
    const bookkeeper = new FakeBookkeeper({ magi: 50000, economy: { inflationRate: 0.05 } });
    m.runYear({ year: 2026, bookkeeper });

    assert.deepEqual(m.due(), { account: 'MedicarePremium', amount: m.owed });
});
