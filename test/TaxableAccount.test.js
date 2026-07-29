import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaxableAccount } from '../src/TaxableAccount.js';
import { Config } from '../src/Config.js';
import { FakeBookkeeper } from './support/FakeBookkeeper.js';

const build = () => new TaxableAccount({ config: new Config({ TaxableAccount: { balance: 1000, basis: 600 } }) });

test('deposit increases balance and basis equally', () => {
    const a = build();
    a.deposit(200);
    assert.equal(a.balance, 1200);
    assert.equal(a.basis, 800);
});

test('grow increases balance but not basis', () => {
    const a = build();
    a.grow(0.1);
    assert.equal(a.balance, 1100);
    assert.equal(a.basis, 600);
});

test('withdraw reduces balance and basis proportionally and returns realized gain', () => {
    const a = build();
    const bookkeeper = new FakeBookkeeper();
    const rv = a.withdraw(500, bookkeeper, 2026);
    assert.equal(rv.balance, 500);
    assert.equal(rv.basisUsed, 300);
    assert.equal(rv.gain, 200);
    assert.equal(a.balance, 500);
    assert.equal(a.basis, 300);
});

test('withdraw reports the gain to bookkeeper.taxCalculator.postAmount as LtcgIncome', () => {
    const a = build();
    const bookkeeper = new FakeBookkeeper();

    a.withdraw(500, bookkeeper, 2026);

    assert.deepEqual(bookkeeper.taxCalc, [{ cat: 'LtcgIncome', amount: 200, year: 2026 }]);
});

test('constructor throws when basis exceeds balance', () => {
    const config = new Config({ TaxableAccount: { balance: 1000, basis: 1001 } });
    assert.throws(
        () => new TaxableAccount({ config }),
        /basis=1001/,
    );
});

test('grow with a negative rate (a market crash) can legitimately drop balance below basis -- an unrealized loss, not an error', () => {
    const a = build();

    a.grow(-0.9);

    assert.equal(a.balance, 100);
    assert.equal(a.basis, 600);
});

test('deposit does not throw once already underwater from a prior crash', () => {
    const a = build();
    a.grow(-0.9);

    a.deposit(50);

    assert.equal(a.balance, 150);
    assert.equal(a.basis, 650);
});

test('withdraw from an underwater position realizes a capital loss (negative gain), not a positive one', () => {
    const a = build();
    a.grow(-0.9);
    const bookkeeper = new FakeBookkeeper();

    const rv = a.withdraw(50, bookkeeper, 2026);

    // basis/balance = 600/100 = 6x -- withdrawing 50 uses 300 of basis,
    // realizing a 250 loss.
    assert.equal(rv.basisUsed, 300);
    assert.equal(rv.gain, -250);
    assert.deepEqual(bookkeeper.taxCalc, [{ cat: 'LtcgIncome', amount: -250, year: 2026 }]);
});
