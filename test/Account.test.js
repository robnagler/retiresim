import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Account } from '../src/Account.js';
import { Config } from '../src/Config.js';

test('grow compounds the balance by rate', () => {
    const config = new Config({ Account: { balance: 1000 } });
    const a = new Account({ config });
    a.grow(0.05);
    assert.equal(a.balance, 1050);
});

test('deposit increases the balance', () => {
    const config = new Config({ Account: { balance: 1000 } });
    const a = new Account({ config });
    a.deposit(250);
    assert.equal(a.balance, 1250);
});

test('withdraw decreases the balance', () => {
    const config = new Config({ Account: { balance: 1000 } });
    const a = new Account({ config });
    a.withdraw(400);
    assert.equal(a.balance, 600);
});

test('withdraw throws when amount exceeds balance', () => {
    const config = new Config({ Test: { balance: 1000 } });
    const a = new Account({ name: 'Test', config });
    assert.throws(() => a.withdraw(1001), /amount=1001.*balance=1000/);
});
