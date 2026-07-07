import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaxableAccount } from '../src/TaxableAccount.js';

test('deposit increases balance and basis equally', () => {
    const a = new TaxableAccount({ name: 'Taxable', balance: 1000, basis: 600 });
    a.deposit(200);
    assert.equal(a.balance, 1200);
    assert.equal(a.basis, 800);
});

test('grow increases balance but not basis', () => {
    const a = new TaxableAccount({ name: 'Taxable', balance: 1000, basis: 600 });
    a.grow(0.1);
    assert.equal(a.balance, 1100);
    assert.equal(a.basis, 600);
});

test('withdraw reduces balance and basis proportionally and returns realized gain', () => {
    const a = new TaxableAccount({ name: 'Taxable', balance: 1000, basis: 600 });
    const rv = a.withdraw(500);
    assert.equal(rv.balance, 500);
    assert.equal(rv.basisUsed, 300);
    assert.equal(rv.gain, 200);
    assert.equal(a.balance, 500);
    assert.equal(a.basis, 300);
});

test('constructor throws when basis exceeds balance', () => {
    assert.throws(
        () => new TaxableAccount({ name: 'Taxable', balance: 1000, basis: 1001 }),
        /basis=1001/,
    );
});
