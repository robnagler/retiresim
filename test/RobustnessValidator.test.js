import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RobustnessValidator } from '../src/RobustnessValidator.js';
import { TaxableAccount } from '../src/TaxableAccount.js';
import { LivingExpense } from '../src/LivingExpense.js';
import { Cash } from '../src/Cash.js';
import { testConfigData } from './support/testConfig.js';

const CRASHES = [{ name: 'X', rate: -0.50 }];
const classes = { TaxableAccount, LivingExpense, Cash };

test('run() catches InsufficientFundsError per trial (a scenario that is always insolvent regardless of crashes) instead of throwing', () => {
    const configData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2026 },
        MarketCrash: { annualProbability: 0, crashes: CRASHES },
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

test('run() reports zero insolvency and a positive net worth for a robustly solvent scenario', () => {
    const configData = testConfigData({
        Simulator: { startYear: 2026, endYear: 2030 },
        sp500Rate: 0.05,
        MarketCrash: { annualProbability: 0, crashes: CRASHES },
        withdrawalOrder: [{ name: 'Taxable', class: 'TaxableAccount', balance: 1000000, basis: 1000000 }],
    });

    const results = new RobustnessValidator().run(configData, classes, 5);

    for (const r of results) {
        assert.equal(r.failedYear, null);
        assert.ok(r.netWorth > 1000000);
    }
});

test('a guaranteed crash (annualProbability=1) actually reduces the ending balance versus no crash -- the crash sequence is wired all the way through Bookkeeper/Economy, not just unit-tested in isolation', () => {
    const base = {
        Simulator: { startYear: 2026, endYear: 2026 },
        sp500Rate: 0.05,
        withdrawalOrder: [{ name: 'Taxable', class: 'TaxableAccount', balance: 100000, basis: 100000 }],
    };
    const noCrash = testConfigData({ ...base, MarketCrash: { annualProbability: 0, crashes: CRASHES } });
    const guaranteedCrash = testConfigData({ ...base, MarketCrash: { annualProbability: 1, crashes: CRASHES } });

    const noCrashResults = new RobustnessValidator().run(noCrash, classes, 3);
    const crashResults = new RobustnessValidator().run(guaranteedCrash, classes, 3);

    // annualProbability=1 makes every trial crash the same single year the
    // same way (no trial-to-trial variation possible), so this is exact,
    // not just "on average": 100000 * (1 - 0.50) = 50000, vs
    // 100000 * 1.05 = 105000 with no crash at all.
    for (const r of noCrashResults) {
        assert.equal(r.netWorth, 105000);
    }
    for (const r of crashResults) {
        assert.equal(r.netWorth, 50000);
    }
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
