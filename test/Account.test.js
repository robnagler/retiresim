import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Account } from '../src/Account.js';

test('grow compounds the balance by rate', () => {
    const a = new Account({ balance: 1000 });
    a.grow(0.05);
    assert.equal(a.balance, 1050);
});

test('deposit increases the balance', () => {
    const a = new Account({ balance: 1000 });
    a.deposit(250);
    assert.equal(a.balance, 1250);
});

test('withdraw decreases the balance', () => {
    const a = new Account({ balance: 1000 });
    a.withdraw(400);
    assert.equal(a.balance, 600);
});

test('withdraw throws when amount exceeds balance', () => {
    const a = new Account({ name: 'Test', balance: 1000 });
    assert.throws(() => a.withdraw(1001), /amount=1001 class=Account name=Test balance=1000/);
});
