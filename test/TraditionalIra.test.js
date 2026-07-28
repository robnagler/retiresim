import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TraditionalIra } from '../src/TraditionalIra.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Cash } from '../src/Cash.js';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { testConfig, taxSpender } from './support/testConfig.js';

test('below the RMD start age, runYear only grows the balance -- no distribution', () => {
    const config = testConfig({
        sp500Rate: 0.05,
        withdrawalOrder: [{ name: 'TraditionalIra', balance: 1000, birthYear: 2000 }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TraditionalIra, Cash } });

    bookkeeper.runYear(2026);

    const a = bookkeeper.accounts[0];
    assert.equal(a.balance, 1000 * 1.05);
    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 0);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 0);
});

test('once age qualifies, Cash takes the RMD from the prior year-end balance, before growth, and it lands in Cash as ordinary income', () => {
    const config = testConfig({
        sp500Rate: 0.05,
        withdrawalOrder: [{ name: 'TraditionalIra', balance: 23700, birthYear: 1950 }],
        spendingOrder: [taxSpender()],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TraditionalIra, TaxCalculator, Cash } });

    bookkeeper.runYear(2026);

    const a = bookkeeper.accounts[0];
    assert.equal(a.balance, (23700 - 1000) * 1.05);
    assert.equal(bookkeeper.balanceChange('TraditionalIra', 2026), a.balance - 23700);
    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 1000);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 1000);
});

test('earn throws when the computed age is not reasonable', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'TraditionalIra', balance: 1000, birthYear: 2030 }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TraditionalIra, Cash } });

    assert.throws(() => bookkeeper.runYear(2026), /age=-4 not reasonable/);
});
