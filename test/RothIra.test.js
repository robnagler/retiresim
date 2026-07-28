import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RothIra } from '../src/RothIra.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Cash } from '../src/Cash.js';
import { Config } from '../src/Config.js';

test('earn withdrawal is not taxable -- does not post to OrdinaryIncome, and lands in Cash', () => {
    const config = new Config({
        Economy: { inflationRate: 0, colaRate: 0, interestRate: 0, sp500Rate: 0 },
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'RothIra', balance: 1000, withdraw: 300 }],
            spendingOrder: [],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { RothIra, Cash } });

    bookkeeper.runYear(2026);

    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 0);
    assert.equal(bookkeeper.balanceChange('RothIra', 2026), -300);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 300);
});
