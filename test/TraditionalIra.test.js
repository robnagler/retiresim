import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TraditionalIra } from '../src/TraditionalIra.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Cash } from '../src/Cash.js';
import { Config } from '../src/Config.js';

test('withdraw treats the entire amount as taxable income', () => {
    const config = new Config({ TraditionalIra: { balance: 1000, withdraw: 400 } });
    const a = new TraditionalIra({ config });
    const rv = a.withdraw(400);
    assert.equal(rv.balance, 600);
    assert.equal(rv.income, 400);
    assert.equal(a.balance, 600);
});

test('withdraw throws when amount exceeds balance', () => {
    const config = new Config({ TraditionalIra: { balance: 1000, withdraw: 1001 } });
    const a = new TraditionalIra({ config });
    assert.throws(() => a.withdraw(1001), /amount=1001.*balance=1000/);
});

test('runYear grows the balance then withdraws the configured amount and reconciles', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'TraditionalIra', balance: 1000, rate: 0.05, withdraw: 300 }],
            spendingOrder: [],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TraditionalIra, Cash } });

    bookkeeper.runYear(2026);

    const a = bookkeeper.accounts[0];
    assert.equal(a.balance, 1000 * 1.05 - 300);
    assert.equal(bookkeeper.balanceChange('TraditionalIra', 2026), a.balance - 1000);
});

test('runYear throws when no withdrawal amount is configured', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'TraditionalIra', balance: 1000, rate: 0.05 }],
            spendingOrder: [],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TraditionalIra, Cash } });

    assert.throws(() => bookkeeper.runYear(2026), /amount=undefined/);
});
