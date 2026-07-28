import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LivingExpense } from '../src/LivingExpense.js';
import { Config } from '../src/Config.js';
import { FakeBookkeeper } from './support/FakeBookkeeper.js';

const build = () => new LivingExpense({ config: new Config({ LivingExpense: { balance: 60000 } }) });

test('balance starts from the configured opening value', () => {
    const a = build();
    assert.equal(a.balance, 60000);
});

test('grow inflates the balance by rate, like any account', () => {
    const a = build();
    a.grow(0.025);
    assert.equal(a.balance, 61500);
});

test('runYear grows via Economy.inflationRate, not a rate of its own', () => {
    const a = build();
    const bookkeeper = new FakeBookkeeper({ economy: { inflationRate: 0.025 } });

    a.runYear({ year: 2026, bookkeeper });

    assert.equal(a.balance, 61500);
});

test('due returns a distinct paid-expense account, not the account\'s own name, and the current amount', () => {
    const a = build();
    assert.deepEqual(a.due(), { account: 'LivingExpensePaid', amount: 60000 });
});
