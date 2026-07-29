import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RobustnessValidator } from '../src/RobustnessValidator.js';
import { buildReturnSequence } from '../src/HistoricalReturns.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Config } from '../src/Config.js';
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
    const { sp500Rate } = buildReturnSequence({ startYear: 2026, endYear: 2026, trial: 0 }).get(2026);

    const results = new RobustnessValidator().run(configData, classes, 1);

    assert.equal(results[0].netWorth, 100000 * (1 + sp500Rate));
});

test('the sampled historical year\'s inflationRate (paired with, not independent of, sp500Rate) is what actually drives LivingExpense\'s growth', () => {
    // LivingExpense isn't a netWorth() asset, so it isn't observable
    // through RobustnessValidator.run()'s return value -- exercised one
    // level down instead, directly against Bookkeeper/Economy, the same
    // wiring RobustnessValidator itself uses.
    const configData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2026 },
        withdrawalOrder: [{ name: 'Taxable', class: 'TaxableAccount', balance: 1000000, basis: 1000000 }],
        spendingOrder: [{ name: 'Expense', class: 'LivingExpense', balance: 10000 }],
    });
    const sequence = buildReturnSequence({ startYear: 2026, endYear: 2026, trial: 0 });
    const config = new Config(configData);
    const bookkeeper = new Bookkeeper({ config, classes });
    bookkeeper.economy.setHistoricalReturns(sequence);

    bookkeeper.runYear(2026);

    const expense = bookkeeper.accounts.find((a) => a.name === 'Expense');
    assert.equal(expense.balance, 10000 * (1 + sequence.get(2026).inflationRate));
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
    assert.match(out, /Failure year range: 2040-2040 \(mean 2040\.0, sigma 0\.0\)/);
    assert.match(out, /min: 0/);
    assert.match(out, /max: 300/);
});

test('report()\'s failure-year mean/sigma are hand-computable for multiple failed trials', () => {
    const validator = new RobustnessValidator();
    // mean = (2030+2040+2050)/3 = 2040.0
    // variance = ((2030-2040)^2 + (2040-2040)^2 + (2050-2040)^2) / 3 = 200/3
    // sigma = sqrt(200/3) = 8.16496...
    const results = [
        { trial: 0, netWorth: 0, failedYear: 2030 },
        { trial: 1, netWorth: 0, failedYear: 2040 },
        { trial: 2, netWorth: 0, failedYear: 2050 },
    ];

    const out = validator.report(results);

    assert.match(out, /Failure year range: 2030-2050 \(mean 2040\.0, sigma 8\.2\)/);
});
