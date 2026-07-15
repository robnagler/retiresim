import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Medicare } from '../src/Medicare.js';
import { Config } from '../src/Config.js';
import { FakeBookkeeper } from './support/FakeBookkeeper.js';

const buildConfig = () => new Config({
    Medicare: {
        balance: 0,
        rate: 0.05,
        partBBase: 2000,
        partDMonthly: 50,
        partGMonthly: 150,
    },
});

test('constructor keeps partDMonthly/partGMonthly as raw monthly cfg values, like Mortgage.monthlyPayment, and derives partDYearly/partGYearly', () => {
    const m = new Medicare({ name: 'Medicare', config: buildConfig() });
    assert.equal(m.partDMonthly, 50);
    assert.equal(m.partGMonthly, 150);
    assert.equal(m.partDYearly, 50 * 12);
    assert.equal(m.partGYearly, 150 * 12);
    assert.equal(m.partBBase, 2000);
});

test('irmaaSurcharge returns the lowest bracket that covers magi', () => {
    const m = new Medicare({ name: 'Medicare', config: buildConfig() });
    assert.deepEqual(m.irmaaSurcharge(50000), { upTo: 106000, partB: 0, partD: 0 });
    assert.deepEqual(m.irmaaSurcharge(106000), { upTo: 106000, partB: 0, partD: 0 });
});

test('irmaaSurcharge jumps to the whole next tier just above the threshold -- a cliff, not a marginal stack', () => {
    const m = new Medicare({ name: 'Medicare', config: buildConfig() });
    assert.deepEqual(m.irmaaSurcharge(106001), { upTo: 133000, partB: 900, partD: 170 });
});

test('irmaaSurcharge falls into the top open-ended bracket above the highest threshold', () => {
    const m = new Medicare({ name: 'Medicare', config: buildConfig() });
    assert.deepEqual(m.irmaaSurcharge(999999), { upTo: null, partB: 5400, partD: 1050 });
});

test('runYear inflates partBBase/partDYearly/partGYearly by rate and adds the IRMAA surcharge for the given magi', () => {
    const m = new Medicare({ name: 'Medicare', config: buildConfig() });
    const bookkeeper = new FakeBookkeeper({ magi: 50000 });

    m.runYear({ year: 2026, bookkeeper });

    assert.equal(m.partBBase, 2000 * 1.05);
    assert.equal(m.partDYearly, 50 * 12 * 1.05);
    assert.equal(m.partGYearly, 150 * 12 * 1.05);
    assert.equal(m.owed, 2000 * 1.05 + 50 * 12 * 1.05 + 150 * 12 * 1.05);
});

test('runYear adds the IRMAA surcharge on top of the inflated base premiums when magi crosses a threshold -- partGYearly is unaffected, Medigap has no IRMAA', () => {
    const m = new Medicare({ name: 'Medicare', config: buildConfig() });
    const bookkeeper = new FakeBookkeeper({ magi: 120000 });

    m.runYear({ year: 2026, bookkeeper });

    assert.equal(m.owed, 2000 * 1.05 + 50 * 12 * 1.05 + 150 * 12 * 1.05 + 900 + 170);
});

test('runYear reads bookkeeper.taxCalculator.magi -- last year\'s value, since TaxCalculator.prepareNextYear updates it later in the same annual cycle', () => {
    const m = new Medicare({ name: 'Medicare', config: buildConfig() });
    const bookkeeper = new FakeBookkeeper({ magi: 600000 });

    m.runYear({ year: 2026, bookkeeper });

    assert.equal(m.owed, 2000 * 1.05 + 50 * 12 * 1.05 + 150 * 12 * 1.05 + 5400 + 1050);
});

test('due reports the amount computed by runYear under the MedicarePremium cash-flow category', () => {
    const m = new Medicare({ name: 'Medicare', config: buildConfig() });
    const bookkeeper = new FakeBookkeeper({ magi: 50000 });
    m.runYear({ year: 2026, bookkeeper });

    assert.deepEqual(m.due(), { account: 'MedicarePremium', amount: m.owed });
});
