import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SecurityAccount } from '../src/SecurityAccount.js';
import { Bookkeeper } from '../src/Bookkeeper.js';

test('runYear does not grow the account or post any journal entry', () => {
    const a = new SecurityAccount({ name: 'Security', balance: 1000, basis: 600 });
    const bookkeeper = new Bookkeeper({ accounts: [a] });
    bookkeeper.runYear(2026);
    assert.equal(a.balance, 1000);
    assert.equal(bookkeeper.journal.length, 0);
});

test('withdraw sells against the fixed cost basis and realizes a gain', () => {
    const a = new SecurityAccount({ name: 'Security', balance: 1000, basis: 600 });
    const rv = a.withdraw(500);
    assert.equal(rv.balance, 500);
    assert.equal(rv.basisUsed, 300);
    assert.equal(rv.gain, 200);
    assert.equal(a.balance, 500);
    assert.equal(a.basis, 300);
});
