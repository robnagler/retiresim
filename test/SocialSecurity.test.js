import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SocialSecurity } from '../src/SocialSecurity.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Cash } from '../src/Cash.js';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { Config } from '../src/Config.js';

const buildConfig = (startYear) => new Config({
    Cash: {
        balance: 0,
        withdrawalOrder: [],
        incomeOrder: [{ name: 'SocialSecurity', balance: 0, rate: 0, monthlyAmount: 2500, startYear }],
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

test('earn posts the full benefit to SocialSecurityBenefit, not OrdinaryIncome, but the full amount still lands in Cash', () => {
    const bookkeeper = new Bookkeeper({ config: buildConfig(2026), classes: { SocialSecurity, TaxCalculator, Cash } });

    bookkeeper.runYear(2026);

    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 0);
    assert.equal(bookkeeper.balanceChange('SocialSecurityBenefit', 2026), 30000);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 30000);
});

test('earn returns null and posts nothing before startYear', () => {
    const bookkeeper = new Bookkeeper({ config: buildConfig(2030), classes: { SocialSecurity, TaxCalculator, Cash } });

    bookkeeper.runYear(2026);

    assert.equal(bookkeeper.balanceChange('SocialSecurityBenefit', 2026), 0);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 0);
});

test('earn posts the benefit starting the exact startYear', () => {
    const bookkeeper = new Bookkeeper({ config: buildConfig(2030), classes: { SocialSecurity, TaxCalculator, Cash } });

    bookkeeper.runYear(2030);

    assert.equal(bookkeeper.balanceChange('SocialSecurityBenefit', 2030), 30000);
    assert.equal(bookkeeper.balanceChange('Cash', 2030), 30000);
});
