import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LivingExpense } from '../src/LivingExpense.js';
import { Config } from '../src/Config.js';

test('balance starts from the configured opening value', () => {
    const config = new Config({ LivingExpense: { balance: 60000 } });
    const a = new LivingExpense({ name: 'LivingExpense', rate: 0.025, config });
    assert.equal(a.balance, 60000);
});

test('grow inflates the balance by rate, like any account', () => {
    const config = new Config({ LivingExpense: { balance: 60000 } });
    const a = new LivingExpense({ name: 'LivingExpense', rate: 0.025, config });
    a.grow(a.rate);
    assert.equal(a.balance, 61500);
});

test('due returns the account name and the current amount', () => {
    const config = new Config({ LivingExpense: { balance: 60000 } });
    const a = new LivingExpense({ name: 'LivingExpense', rate: 0.025, config });
    assert.deepEqual(a.due(), { account: 'LivingExpense', amount: 60000 });
});
