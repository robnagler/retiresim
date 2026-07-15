import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SocialSecurity } from '../src/SocialSecurity.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Cash } from '../src/Cash.js';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { Config } from '../src/Config.js';

test('earn posts the full benefit to SocialSecurityBenefit, not OrdinaryIncome, but the full amount still lands in Cash', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [],
            incomeOrder: [{ name: 'SocialSecurity', balance: 0, rate: 0, amount: 30000 }],
            spendingOrder: [{
                name: 'Tax',
                class: 'TaxCalculator',
                balance: 0,
                federalBrackets: [{ rate: 0.10, upTo: null }],
                ltcgBrackets: [{ rate: 0.15, upTo: null }],
                stateRate: 0.044,
                ssProvisionalIncomeThresholds: { low: 32000, high: 44000 },
            }],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { SocialSecurity, TaxCalculator, Cash } });

    bookkeeper.runYear(2026);

    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 0);
    assert.equal(bookkeeper.balanceChange('SocialSecurityBenefit', 2026), 30000);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 30000);
});
