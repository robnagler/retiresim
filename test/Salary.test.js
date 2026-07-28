import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Salary } from '../src/Salary.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Cash } from '../src/Cash.js';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { Config } from '../src/Config.js';

const buildConfig = (endYear) => new Config({
    Economy: { inflationRate: 0, interestRate: 0, sp500Rate: 0 },
    Cash: {
        balance: 0,
        withdrawalOrder: [],
        incomeOrder: [{ name: 'Salary', balance: 0, monthlyAmount: 2500, endYear }],
        spendingOrder: [{
            name: 'Tax',
            class: 'TaxCalculator',
            balance: 0,
            federalBrackets: [{ rate: 0.10, upTo: null }],
            ltcgBrackets: [{ rate: 0.15, upTo: null }],
            stateRate: 0.044,
            standardDeduction: 0,
            initialMagi: 0,
            ssProvisionalIncomeThresholds: { low: 32000, high: 44000 },
        }],
    },
});

test('earn posts OrdinaryIncome and it lands in Cash, on or before endYear', () => {
    const bookkeeper = new Bookkeeper({ config: buildConfig(2026), classes: { Salary, TaxCalculator, Cash } });

    bookkeeper.runYear(2026);

    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 30000);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 30000);
});

test('earn returns null and posts nothing after endYear', () => {
    const bookkeeper = new Bookkeeper({ config: buildConfig(2026), classes: { Salary, TaxCalculator, Cash } });

    bookkeeper.runYear(2027);

    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2027), 0);
    assert.equal(bookkeeper.balanceChange('Cash', 2027), 0);
});
