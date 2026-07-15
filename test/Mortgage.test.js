import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mortgage } from '../src/Mortgage.js';
import { Config } from '../src/Config.js';
import { FakeBookkeeper } from './support/FakeBookkeeper.js';

test('makePayment amortizes principal and interest for one year', () => {
    const config = new Config({ Mortgage: { balance: -200000, rate: 0.06, monthlyPayment: 1200 } });
    const m = new Mortgage({ config });
    const rv = m.makePayment();
    assert.ok(rv.principal > 0);
    assert.ok(rv.interest > 0);
    assert.equal(rv.principal + rv.interest, 1200 * 12);
    assert.equal(m.balance, -200000 + rv.principal);
});

test('due reports the full payment (principal + interest), not interest alone -- Cash pays one check covering both', () => {
    const config = new Config({ Mortgage: { balance: -200000, rate: 0.06, monthlyPayment: 1200 } });
    const m = new Mortgage({ config });
    const rv = m.makePayment();
    assert.deepEqual(m.due(), { account: 'MortgagePayment', amount: rv.principal + rv.interest });
});

test('makePayment throws when payment does not cover interest', () => {
    const config = new Config({ Mortgage: { balance: -200000, rate: 0.06, monthlyPayment: 100 } });
    const m = new Mortgage({ config });
    assert.throws(() => m.makePayment(), /class=Mortgage/);
});

test('runYear posts principal to the ledger and reports interest to postAmount as MortgageInterestDeduction -- distinct from the MortgagePayment cash-flow category due() uses', () => {
    const config = new Config({ Mortgage: { balance: -200000, rate: 0.06, monthlyPayment: 1200 } });
    const m = new Mortgage({ config });
    const bookkeeper = new FakeBookkeeper();

    m.runYear({ year: 2026, bookkeeper });

    assert.equal(bookkeeper.ledger.length, 1);
    assert.equal(bookkeeper.ledger[0].dest, 'Mortgage');
    assert.equal(bookkeeper.ledger[0].amount, m.balance - (-200000));
    assert.deepEqual(bookkeeper.taxCalc, [{ cat: 'MortgageInterestDeduction', amount: m.interest, year: 2026 }]);
});
