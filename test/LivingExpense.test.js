import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LivingExpense } from '../src/LivingExpense.js';
import { Config } from '../src/Config.js';
import { FakeBookkeeper } from './support/FakeBookkeeper.js';

test('balance starts from the configured opening value', () => {
    const config = new Config({ LivingExpense: { balance: 60000 } });
    const a = new LivingExpense({ config });
    assert.equal(a.balance, 60000);
});

test('grow inflates the balance by rate, like any account', () => {
    const config = new Config({ LivingExpense: { balance: 60000 } });
    const a = new LivingExpense({ config });
    a.grow(0.025);
    assert.equal(a.balance, 61500);
});

test('runYear grows via Economy.inflationRate, not a rate of its own', () => {
    const config = new Config({ LivingExpense: { balance: 60000 } });
    const a = new LivingExpense({ config });
    const bookkeeper = new FakeBookkeeper({ economy: { inflationRate: 0.025 } });

    a.runYear({ year: 2026, bookkeeper });

    assert.equal(a.balance, 61500);
});

test('due returns a distinct paid-expense account, not the account\'s own name, and the current amount', () => {
    const config = new Config({ LivingExpense: { balance: 60000 } });
    const a = new LivingExpense({ config });
    assert.deepEqual(a.due(), { account: 'LivingExpensePaid', amount: 60000 });
});
