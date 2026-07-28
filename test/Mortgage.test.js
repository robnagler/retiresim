import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mortgage } from '../src/Mortgage.js';
import { Config } from '../src/Config.js';
import { FakeBookkeeper } from './support/FakeBookkeeper.js';

const build = (overrides = {}) => new Mortgage({
    config: new Config({ Mortgage: { balance: -200000, rate: 0.06, endYear: 2055, ...overrides } }),
});

test('the derived monthly payment matches the standard fixed-payment amortization formula ($200,000, 6%, 30-year term)', () => {
    const m = build();
    m.makePayment(2026);
    const r = 0.06 / 12;
    const months = 30 * 12;
    const expected = (200000 * r) / (1 - (1 + r) ** -months);
    assert.ok(Math.abs(m.monthlyPayment - expected) < 1e-9);
});

test('makePayment amortizes principal and interest for one year', () => {
    const m = build();
    const rv = m.makePayment(2026);
    assert.ok(rv.principal > 0);
    assert.ok(rv.interest > 0);
    assert.equal(rv.principal + rv.interest, m.monthlyPayment * 12);
    assert.equal(m.balance, -200000 + rv.principal);
});

test('due reports the full payment (principal + interest), not interest alone -- Cash pays one check covering both', () => {
    const m = build();
    const rv = m.makePayment(2026);
    assert.deepEqual(m.due(), { account: 'MortgagePayment', amount: rv.principal + rv.interest });
});

test('the balance amortizes to (approximately) zero by endYear when run every year', () => {
    const m = build({ endYear: 2030 });
    for (let year = 2026; year <= 2030; year++) {
        m.makePayment(year);
    }
    assert.ok(Math.abs(m.balance) < 0.01);
});

test('makePayment throws when endYear is not after the given year', () => {
    const m = build({ endYear: 2025 });
    assert.throws(() => m.makePayment(2026), /endYear=2025/);
});

test('runYear posts principal to the ledger and reports interest to postAmount as MortgageInterestDeduction -- distinct from the MortgagePayment cash-flow category due() uses', () => {
    const m = build();
    const bookkeeper = new FakeBookkeeper();

    m.runYear({ year: 2026, bookkeeper });

    assert.equal(bookkeeper.ledger.length, 1);
    assert.equal(bookkeeper.ledger[0].dest, 'Mortgage');
    assert.equal(bookkeeper.ledger[0].amount, m.balance - (-200000));
    assert.deepEqual(bookkeeper.taxCalc, [{ cat: 'MortgageInterestDeduction', amount: m.interest, year: 2026 }]);
});

test('runYear stops charging a payment once year is past endYear', () => {
    const m = build({ endYear: 2026 });
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

test('runYear wipes the remaining balance to zero and stops paying once year reaches sellYear', () => {
    const m = build({ sellYear: 2030 });
    const bookkeeper = new FakeBookkeeper();
    for (let year = 2026; year < 2030; year++) {
        m.runYear({ year, bookkeeper });
    }
    assert.ok(m.balance < 0);

    m.runYear({ year: 2030, bookkeeper });

    assert.equal(m.balance, 0);
    assert.equal(m.principal, 0);
    assert.equal(m.interest, 0);
    assert.deepEqual(m.due(), { account: 'MortgagePayment', amount: 0 });
    const last = bookkeeper.ledger.at(-1);
    assert.equal(last.category, 'mortgageSale');
    assert.equal(last.dest, 'Mortgage');
});

test('runYear posts the sellYear forgiveness only once -- later years touch nothing further', () => {
    const m = build({ sellYear: 2026 });
    const bookkeeper = new FakeBookkeeper();
    m.runYear({ year: 2026, bookkeeper });
    assert.equal(bookkeeper.ledger.length, 1);

    m.runYear({ year: 2027, bookkeeper });

    assert.equal(m.balance, 0);
    assert.equal(bookkeeper.ledger.length, 1);
});

test('runYear ignores sellYear when it is not set, behaving exactly as before', () => {
    const m = build();
    const bookkeeper = new FakeBookkeeper();

    m.runYear({ year: 2026, bookkeeper });

    assert.ok(m.balance < -190000);
});
