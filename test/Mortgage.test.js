import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mortgage } from '../src/Mortgage.js';

test('makePayment amortizes principal and interest for one year', () => {
    const m = new Mortgage({ balance: 200000, rate: 0.06, monthlyPayment: 1200 });
    const rv = m.makePayment();
    assert.ok(rv.principal > 0);
    assert.ok(rv.interest > 0);
    assert.equal(rv.principal + rv.interest, 1200 * 12);
    assert.equal(m.balance, 200000 - rv.principal);
});

test('makePayment throws when payment does not cover interest', () => {
    const m = new Mortgage({ balance: 200000, rate: 0.06, monthlyPayment: 100 });
    assert.throws(() => m.makePayment(), /class=Mortgage/);
});
