import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaxableAccount } from '../src/TaxableAccount.js';
import { Config } from '../src/Config.js';
import { FakeBookkeeper } from './support/FakeBookkeeper.js';

test('deposit increases balance and basis equally', () => {
    const config = new Config({ TaxableAccount: { balance: 1000, basis: 600 } });
    const a = new TaxableAccount({ config });
    a.deposit(200);
    assert.equal(a.balance, 1200);
    assert.equal(a.basis, 800);
});

test('grow increases balance but not basis', () => {
    const config = new Config({ TaxableAccount: { balance: 1000, basis: 600 } });
    const a = new TaxableAccount({ config });
    a.grow(0.1);
    assert.equal(a.balance, 1100);
    assert.equal(a.basis, 600);
});

test('withdraw reduces balance and basis proportionally and returns realized gain', () => {
    const config = new Config({ TaxableAccount: { balance: 1000, basis: 600 } });
    const a = new TaxableAccount({ config });
    const bookkeeper = new FakeBookkeeper();
    const rv = a.withdraw(500, bookkeeper, 2026);
    assert.equal(rv.balance, 500);
    assert.equal(rv.basisUsed, 300);
    assert.equal(rv.gain, 200);
    assert.equal(a.balance, 500);
    assert.equal(a.basis, 300);
});

test('withdraw reports the gain to bookkeeper.postIncome as LtcgIncome', () => {
    const config = new Config({ TaxableAccount: { balance: 1000, basis: 600 } });
    const a = new TaxableAccount({ config });
    const bookkeeper = new FakeBookkeeper();

    a.withdraw(500, bookkeeper, 2026);

    assert.deepEqual(bookkeeper.income, [{ kind: 'LtcgIncome', amount: 200, year: 2026 }]);
});

test('constructor throws when basis exceeds balance', () => {
    const config = new Config({ TaxableAccount: { balance: 1000, basis: 1001 } });
    assert.throws(
        () => new TaxableAccount({ config }),
        /basis=1001/,
    );
});
