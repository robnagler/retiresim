import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mortgage } from '../src/Mortgage.js';
import { Config } from '../src/Config.js';
import { FakeBookkeeper } from './support/FakeBookkeeper.js';

test('the derived monthly payment matches the standard fixed-payment amortization formula ($200,000, 6%, 30-year term)', () => {
    const config = new Config({ Mortgage: { balance: -200000, rate: 0.06, endYear: 2055 } });
    const m = new Mortgage({ config });
    m.makePayment(2026);
    const r = 0.06 / 12;
    const months = 30 * 12;
    const expected = (200000 * r) / (1 - (1 + r) ** -months);
    assert.ok(Math.abs(m.monthlyPayment - expected) < 1e-9);
});

test('makePayment amortizes principal and interest for one year', () => {
    const config = new Config({ Mortgage: { balance: -200000, rate: 0.06, endYear: 2055 } });
    const m = new Mortgage({ config });
    const rv = m.makePayment(2026);
    assert.ok(rv.principal > 0);
    assert.ok(rv.interest > 0);
    assert.equal(rv.principal + rv.interest, m.monthlyPayment * 12);
    assert.equal(m.balance, -200000 + rv.principal);
});

test('due reports the full payment (principal + interest), not interest alone -- Cash pays one check covering both', () => {
    const config = new Config({ Mortgage: { balance: -200000, rate: 0.06, endYear: 2055 } });
    const m = new Mortgage({ config });
    const rv = m.makePayment(2026);
    assert.deepEqual(m.due(), { account: 'MortgagePayment', amount: rv.principal + rv.interest });
});

test('the balance amortizes to (approximately) zero by endYear when run every year', () => {
    const config = new Config({ Mortgage: { balance: -200000, rate: 0.06, endYear: 2030 } });
    const m = new Mortgage({ config });
    for (let year = 2026; year <= 2030; year++) {
        m.makePayment(year);
    }
    assert.ok(Math.abs(m.balance) < 0.01);
});

test('makePayment throws when endYear is not after the given year', () => {
    const config = new Config({ Mortgage: { balance: -200000, rate: 0.06, endYear: 2025 } });
    const m = new Mortgage({ config });
    assert.throws(() => m.makePayment(2026), /endYear=2025/);
});

test('runYear posts principal to the ledger and reports interest to postAmount as MortgageInterestDeduction -- distinct from the MortgagePayment cash-flow category due() uses', () => {
    const config = new Config({ Mortgage: { balance: -200000, rate: 0.06, endYear: 2055 } });
    const m = new Mortgage({ config });
    const bookkeeper = new FakeBookkeeper();

    m.runYear({ year: 2026, bookkeeper });

    assert.equal(bookkeeper.ledger.length, 1);
    assert.equal(bookkeeper.ledger[0].dest, 'Mortgage');
    assert.equal(bookkeeper.ledger[0].amount, m.balance - (-200000));
    assert.deepEqual(bookkeeper.taxCalc, [{ cat: 'MortgageInterestDeduction', amount: m.interest, year: 2026 }]);
});

test('runYear stops charging a payment once year is past endYear', () => {
    const config = new Config({ Mortgage: { balance: -200000, rate: 0.06, endYear: 2026 } });
    const m = new Mortgage({ config });
    const bookkeeper = new FakeBookkeeper();
    m.runYear({ year: 2026, bookkeeper });
    const balanceAfterPayoff = m.balance;

    m.runYear({ year: 2027, bookkeeper });

    assert.equal(m.principal, 0);
    assert.equal(m.interest, 0);
    assert.deepEqual(m.due(), { account: 'MortgagePayment', amount: 0 });
    assert.equal(m.balance, balanceAfterPayoff);
    assert.equal(bookkeeper.ledger.length, 1);
});
