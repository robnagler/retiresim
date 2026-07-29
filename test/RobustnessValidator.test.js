import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RobustnessValidator } from '../src/RobustnessValidator.js';
import { buildReturnSequence } from '../src/HistoricalReturns.js';
import { TaxableAccount } from '../src/TaxableAccount.js';
import { LivingExpense } from '../src/LivingExpense.js';
import { Cash } from '../src/Cash.js';
import { testConfigData } from './support/testConfig.js';

const classes = { TaxableAccount, LivingExpense, Cash };

test('run() catches InsufficientFundsError per trial (a scenario that is always insolvent regardless of which historical return gets sampled) instead of throwing', () => {
    const configData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2026 },
        withdrawalOrder: [{ name: 'Taxable', class: 'TaxableAccount', balance: 100, basis: 100 }],
        spendingOrder: [{ name: 'Expense', class: 'LivingExpense', balance: 1000 }],
    });

    const results = new RobustnessValidator().run(configData, classes, 5);

    assert.equal(results.length, 5);
    for (const r of results) {
        assert.equal(r.netWorth, 0);
        assert.equal(r.failedYear, 2026);
    }
});

test('run() reports zero insolvency for a scenario with no spending at all -- solvent regardless of which historical returns get sampled', () => {
    const configData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2030 },
        withdrawalOrder: [{ name: 'Taxable', class: 'TaxableAccount', balance: 1000000, basis: 1000000 }],
    });

    const results = new RobustnessValidator().run(configData, classes, 20);

    for (const r of results) {
        assert.equal(r.failedYear, null);
    }
});

test('the sampled historical return is what actually drives the ending balance -- wired all the way through Bookkeeper/Economy, not just unit-tested in isolation', () => {
    const configData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2026 },
        withdrawalOrder: [{ name: 'Taxable', class: 'TaxableAccount', balance: 100000, basis: 100000 }],
    });
    const expectedRate = buildReturnSequence({ startYear: 2026, endYear: 2026, trial: 0 }).get(2026);

    const results = new RobustnessValidator().run(configData, classes, 1);

    assert.equal(results[0].netWorth, 100000 * (1 + expectedRate));
});

test('report() summarizes insolvency rate, failure year range, and the net worth distribution', () => {
    const validator = new RobustnessValidator();
    const results = [
        { trial: 0, netWorth: 100, failedYear: null },
        { trial: 1, netWorth: 200, failedYear: null },
        { trial: 2, netWorth: 0, failedYear: 2040 },
        { trial: 3, netWorth: 300, failedYear: null },
    ];

    const out = validator.report(results);

    assert.match(out, /Robustness check: 4 trials/);
    assert.match(out, /Insolvent: 1 \(25\.0%\)/);
    assert.match(out, /Failure year range: 2040-2040/);
    assert.match(out, /min: 0/);
    assert.match(out, /max: 300/);
});
