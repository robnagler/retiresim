import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SecurityAccount } from '../src/SecurityAccount.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Config } from '../src/Config.js';

test('runYear does not grow the account or post any journal entry', () => {
    const config = new Config({ SecurityAccount: { balance: 1000 } });
    const a = new SecurityAccount({ name: 'Security', basis: 600, config });
    const bookkeeper = new Bookkeeper({ accounts: [a] });
    bookkeeper.runYear(2026);
    assert.equal(a.balance, 1000);
    assert.equal(bookkeeper.journal.length, 0);
});

test('withdraw sells against the fixed cost basis and realizes a gain', () => {
    const config = new Config({ SecurityAccount: { balance: 1000 } });
    const a = new SecurityAccount({ name: 'Security', basis: 600, config });
    const rv = a.withdraw(500);
    assert.equal(rv.balance, 500);
    assert.equal(rv.basisUsed, 300);
    assert.equal(rv.gain, 200);
    assert.equal(a.balance, 500);
    assert.equal(a.basis, 300);
});
