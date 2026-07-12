import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RothIra } from '../src/RothIra.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Cash } from '../src/Cash.js';
import { Config } from '../src/Config.js';

test('runYear withdrawal is not taxable -- does not post to OrdinaryIncome', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'RothIra', balance: 1000, rate: 0, withdraw: 300 }],
            spendingOrder: [],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { RothIra, Cash } });

    bookkeeper.runYear(2026);

    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 0);
    assert.equal(bookkeeper.balanceChange('RothWithdrawal', 2026), 300);
});
