import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mortgage } from '../src/Mortgage.js';
import { Config } from '../src/Config.js';

test('makePayment amortizes principal and interest for one year', () => {
    const config = new Config({ Mortgage: { balance: 200000 } });
    const m = new Mortgage({ rate: 0.06, monthlyPayment: 1200, config });
    const rv = m.makePayment();
    assert.ok(rv.principal > 0);
    assert.ok(rv.interest > 0);
    assert.equal(rv.principal + rv.interest, 1200 * 12);
    assert.equal(m.balance, 200000 - rv.principal);
});

test('makePayment stores interest for due() to report', () => {
    const config = new Config({ Mortgage: { balance: 200000 } });
    const m = new Mortgage({ rate: 0.06, monthlyPayment: 1200, config });
    const rv = m.makePayment();
    assert.equal(m.interest, rv.interest);
    assert.deepEqual(m.due(), { account: 'MortgageInterest', amount: rv.interest });
});

test('makePayment throws when payment does not cover interest', () => {
    const config = new Config({ Mortgage: { balance: 200000 } });
    const m = new Mortgage({ rate: 0.06, monthlyPayment: 100, config });
    assert.throws(() => m.makePayment(), /class=Mortgage/);
});
