import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TraditionalIra } from '../src/TraditionalIra.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Cash } from '../src/Cash.js';
import { Config } from '../src/Config.js';

test('below the RMD start age, runYear only grows the balance -- no distribution', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'TraditionalIra', balance: 1000, rate: 0.05, birthYear: 2000 }],
            spendingOrder: [],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TraditionalIra, Cash } });

    bookkeeper.runYear(2026);

    const a = bookkeeper.accounts[0];
    assert.equal(a.balance, 1000 * 1.05);
    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 0);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 0);
});

test('once age qualifies, Cash takes the RMD from the prior year-end balance, before growth, and it lands in Cash as ordinary income', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'TraditionalIra', balance: 23700, rate: 0.05, birthYear: 1950 }],
            spendingOrder: [],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TraditionalIra, Cash } });

    bookkeeper.runYear(2026);

    const a = bookkeeper.accounts[0];
    assert.equal(a.balance, (23700 - 1000) * 1.05);
    assert.equal(bookkeeper.balanceChange('TraditionalIra', 2026), a.balance - 23700);
    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 1000);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 1000);
});
