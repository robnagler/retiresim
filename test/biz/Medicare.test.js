import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Medicare } from '../../src/biz/Medicare.js';
import { Config } from '../../src/biz/Config.js';
import { FakeBookkeeper } from '../support/FakeBookkeeper.js';

// birthYear defaults to one already past 65 as of the 2026 every test
// below runs, so the eligibility gate is satisfied and each test can focus
// on premium growth/IRMAA; the gate's own tests pass a later birthYear.
const build = ({ birthYear = 1955 } = {}) => new Medicare({
    name: 'Medicare',
    config: new Config({
        Medicare: {
            balance: 0,
            birthYear,
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

test('constructor derives the eligibility year from birthYear -- age 65, not a cfg input', () => {
    assert.equal(build({ birthYear: 1965 }).startYear, 2030);
});

// Built without build(), whose default birthYear would fill in the very
// thing this checks is required.
test('constructor throws on a cfg block with no birthYear rather than letting a NaN startYear silently disable the gate', () => {
    assert.throws(() => new Medicare({
        name: 'Medicare',
        config: new Config({ Medicare: { balance: 0, partBMonthly: 175, partDMonthly: 50, partGMonthly: 150 } }),
    }), /birthYear=undefined/);
});

test('runYear owes nothing before the year the person turns 65 -- pre-65 health premiums are part of yearly spending, not Medicare', () => {
    const m = build({ birthYear: 1975 });
    const bookkeeper = new FakeBookkeeper({ magi: 120000, economy: { inflationRate: 0.05 } });

    m.runYear({ year: 2026, bookkeeper });

    assert.equal(m.owed, 0);
    assert.deepEqual(m.due(), { account: 'MedicarePremium', amount: 0 });
});

test('runYear starts charging in the eligibility year itself, not the year after', () => {
    const m = build({ birthYear: 1961 });
    const bookkeeper = new FakeBookkeeper({ magi: 50000, economy: { inflationRate: 0.05 } });

    m.runYear({ year: 2026, bookkeeper });

    assert.equal(m.owed, (175 + 50 + 150) * 12 * 1.05);
});

test('the premium and IRMAA thresholds keep inflating through the pre-65 years, so the first eligible year costs what it would really cost by then', () => {
    const m = build({ birthYear: 1965 });
    const bookkeeper = new FakeBookkeeper({ magi: 50000, economy: { inflationRate: 0.05 } });

    for (const year of [2028, 2029, 2030]) {
        m.runYear({ year, bookkeeper });
    }

    assert.ok(Math.abs(m.owed - (175 + 50 + 150) * 12 * 1.05 ** 3) < 1e-9);
    assert.ok(Math.abs(m.irmaaBrackets[0].upTo - 106000 * 1.05 ** 3) < 1e-9);
});

test('due reports the amount computed by runYear under the MedicarePremium cash-flow category', () => {
    const m = build();
    const bookkeeper = new FakeBookkeeper({ magi: 50000, economy: { inflationRate: 0.05 } });
    m.runYear({ year: 2026, bookkeeper });

    assert.deepEqual(m.due(), { account: 'MedicarePremium', amount: m.owed });
});
