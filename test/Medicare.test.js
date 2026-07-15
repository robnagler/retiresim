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
        partDBase: 600,
        irmaaBrackets: [
            { upTo: 106000, partB: 0, partD: 0 },
            { upTo: 133000, partB: 900, partD: 84 },
            { upTo: null, partB: 3000, partD: 300 },
        ],
    },
});

test('irmaaSurcharge returns the lowest bracket that covers magi', () => {
    const m = new Medicare({ name: 'Medicare', config: buildConfig() });
    assert.deepEqual(m.irmaaSurcharge(50000), { upTo: 106000, partB: 0, partD: 0 });
    assert.deepEqual(m.irmaaSurcharge(106000), { upTo: 106000, partB: 0, partD: 0 });
});

test('irmaaSurcharge jumps to the whole next tier just above the threshold -- a cliff, not a marginal stack', () => {
    const m = new Medicare({ name: 'Medicare', config: buildConfig() });
    assert.deepEqual(m.irmaaSurcharge(106001), { upTo: 133000, partB: 900, partD: 84 });
});

test('irmaaSurcharge falls into the top open-ended bracket above the highest threshold', () => {
    const m = new Medicare({ name: 'Medicare', config: buildConfig() });
    assert.deepEqual(m.irmaaSurcharge(999999), { upTo: null, partB: 3000, partD: 300 });
});

test('irmaaSurcharge throws when no bracket matches -- a caller/config bug, not a silent 0', () => {
    const m = new Medicare({
        name: 'Medicare',
        config: new Config({ Medicare: { balance: 0, rate: 0, partBBase: 0, partDBase: 0, irmaaBrackets: [{ upTo: 100, partB: 0, partD: 0 }] } }),
    });
    assert.throws(() => m.irmaaSurcharge(200), /class=Medicare/);
});

test('runYear inflates the base premiums by rate and adds the IRMAA surcharge for the given magi', () => {
    const m = new Medicare({ name: 'Medicare', config: buildConfig() });
    const bookkeeper = new FakeBookkeeper({ magi: 50000 });

    m.runYear({ year: 2026, bookkeeper });

    assert.equal(m.partBBase, 2000 * 1.05);
    assert.equal(m.partDBase, 600 * 1.05);
    assert.equal(m.owed, 2000 * 1.05 + 600 * 1.05);
});

test('runYear adds the IRMAA surcharge on top of the inflated base premiums when magi crosses a threshold', () => {
    const m = new Medicare({ name: 'Medicare', config: buildConfig() });
    const bookkeeper = new FakeBookkeeper({ magi: 120000 });

    m.runYear({ year: 2026, bookkeeper });

    assert.equal(m.owed, 2000 * 1.05 + 600 * 1.05 + 900 + 84);
});

test('runYear reads bookkeeper.taxCalculator.magi -- last year\'s value, since TaxCalculator.prepareNextYear updates it later in the same annual cycle', () => {
    const m = new Medicare({ name: 'Medicare', config: buildConfig() });
    const bookkeeper = new FakeBookkeeper({ magi: 200000 });

    m.runYear({ year: 2026, bookkeeper });

    assert.equal(m.owed, 2000 * 1.05 + 600 * 1.05 + 3000 + 300);
});

test('due reports the amount computed by runYear under the MedicarePremium cash-flow category', () => {
    const m = new Medicare({ name: 'Medicare', config: buildConfig() });
    const bookkeeper = new FakeBookkeeper({ magi: 50000 });
    m.runYear({ year: 2026, bookkeeper });

    assert.deepEqual(m.due(), { account: 'MedicarePremium', amount: m.owed });
});
