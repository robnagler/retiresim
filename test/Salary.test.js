import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Salary } from '../src/Salary.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Cash } from '../src/Cash.js';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { testConfig, taxSpender } from './support/testConfig.js';

const buildConfig = (endYear) => testConfig({
    incomeOrder: [{ name: 'Salary', balance: 0, monthlyAmount: 2500, endYear }],
    spendingOrder: [taxSpender({ ssProvisionalIncomeThresholds: { low: 32000, high: 44000 } })],
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
