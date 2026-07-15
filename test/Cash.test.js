import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cash } from '../src/Cash.js';
import { Account } from '../src/Account.js';
import { TraditionalIra } from '../src/TraditionalIra.js';
import { TaxableAccount } from '../src/TaxableAccount.js';
import { Mortgage } from '../src/Mortgage.js';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { LivingExpense } from '../src/LivingExpense.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Config } from '../src/Config.js';

const buildConfig = () => new Config({
    Cash: {
        balance: 0,
        withdrawalOrder: [
            { name: 'Account', balance: 1000, rate: 0 },
            { name: 'TraditionalIra', balance: 5000, rate: 0, birthYear: 2000 },
        ],
        spendingOrder: [],
    },
});

test('produce withdraws from accounts in withdrawalOrder and posts a journal entry per source', () => {
    const config = buildConfig();
    const bookkeeper = new Bookkeeper({ config, classes: { Account, TraditionalIra, Cash } });
    const [account, tradIra] = bookkeeper.accounts;
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');

    const rv = cash.produce({ amount: 1500, year: 2026, bookkeeper });

    assert.deepEqual(rv, [
        { account: 'Account', amount: 1000 },
        { account: 'TraditionalIra', amount: 500 },
    ]);
    assert.equal(account.balance, 0);
    assert.equal(tradIra.balance, 4500);
    assert.equal(cash.balance, 1500);
    assert.equal(bookkeeper.balanceChange('Account', 2026), -1000);
    assert.equal(bookkeeper.balanceChange('TraditionalIra', 2026), -500);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 1500);
});

test('produce stops early once the amount is fully covered by earlier accounts', () => {
    const config = buildConfig();
    const bookkeeper = new Bookkeeper({ config, classes: { Account, TraditionalIra, Cash } });
    const [account, tradIra] = bookkeeper.accounts;
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');

    const rv = cash.produce({ amount: 400, year: 2026, bookkeeper });

    assert.deepEqual(rv, [{ account: 'Account', amount: 400 }]);
    assert.equal(account.balance, 600);
    assert.equal(tradIra.balance, 5000);
    assert.equal(cash.balance, 400);
});

test('produce throws when accounts in withdrawalOrder cannot cover the amount', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'Account', balance: 1000, rate: 0 }],
            spendingOrder: [],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Cash } });
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');

    assert.throws(() => cash.produce({ amount: 1500, year: 2026, bookkeeper }), /shortfall=500/);
});

test('produce posts the gain portion of a TaxableAccount withdrawal to LtcgIncome, not the full amount', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'Taxable', class: 'TaxableAccount', balance: 10000, rate: 0, basis: 6000 }],
            spendingOrder: [{
                name: 'Tax',
                class: 'TaxCalculator',
                balance: 0,
                federalBrackets: [{ rate: 0.10, upTo: null }],
                ltcgBrackets: [{ rate: 0.15, upTo: null }],
                stateRate: 0.044,
                standardDeduction: 0,
                priorYearMagi: 0,
            }],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TaxableAccount, TaxCalculator, Cash } });
    const taxable = bookkeeper.accounts.find((a) => a.name === 'Taxable');
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');

    cash.produce({ amount: 5000, year: 2026, bookkeeper });

    // basis fraction is 6000/10000 = 0.6, so basisUsed=3000, gain=2000 on a 5000 withdrawal
    assert.equal(taxable.balance, 5000);
    assert.equal(taxable.basis, 3000);
    assert.equal(bookkeeper.balanceChange('LtcgIncome', 2026), 2000);
    assert.equal(bookkeeper.balanceChange('Taxable', 2026), -5000);
});

test('produce does not post to LtcgIncome for non-TaxableAccount withdrawals', () => {
    const config = buildConfig();
    const bookkeeper = new Bookkeeper({ config, classes: { Account, TraditionalIra, Cash } });

    bookkeeper.accounts.find((a) => a.name === 'Cash').produce({ amount: 1500, year: 2026, bookkeeper });

    assert.equal(bookkeeper.balanceChange('LtcgIncome', 2026), 0);
});

test('spend withdraws from cash and posts a journal entry to the expense category', () => {
    const config = new Config({
        Cash: { balance: 1500, withdrawalOrder: [], spendingOrder: [] },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');

    cash.spend({ amount: 600, account: 'MortgageInterest', year: 2026, bookkeeper });

    assert.equal(cash.balance, 900);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), -600);
    assert.equal(bookkeeper.balanceChange('MortgageInterest', 2026), 600);
});

test('runYear produces the total owed by all spenders, then spends it per category', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'Account', balance: 20000, rate: 0 }],
            spendingOrder: [
                { name: 'Mortgage', balance: -200000, rate: 0.06, monthlyPayment: 1200 },
                {
                    name: 'Tax',
                    class: 'TaxCalculator',
                    balance: -3000,
                    federalBrackets: [{ rate: 0.10, upTo: null }],
                    ltcgBrackets: [{ rate: 0.15, upTo: null }],
                    stateRate: 0.044,
                    standardDeduction: 0,
                    priorYearMagi: 0,
                },
                { name: 'LivingExpense', balance: 2000, rate: 0.025 },
            ],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Mortgage, TaxCalculator, LivingExpense, Cash } });
    const account = bookkeeper.accounts.find((a) => a.name === 'Account');
    const mortgage = bookkeeper.accounts.find((a) => a.name === 'Mortgage');
    const tax = bookkeeper.accounts.find((a) => a.name === 'Tax');
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');
    mortgage.makePayment();
    tax.runYear({ year: 2026, bookkeeper });

    cash.runYear({ year: 2026, bookkeeper });

    const total = mortgage.principal + mortgage.interest + 3000 + 2000;
    assert.equal(account.balance, 20000 - total);
    assert.equal(cash.balance, 0);
    assert.equal(bookkeeper.balanceChange('MortgagePayment', 2026), mortgage.principal + mortgage.interest);
    assert.equal(bookkeeper.balanceChange('TaxPaid', 2026), 3000);
    assert.equal(bookkeeper.balanceChange('LivingExpensePaid', 2026), 2000);
});

test('spend can carry cash negative -- produce brings it back to reconcile', () => {
    const config = new Config({
        Cash: { balance: 100, withdrawalOrder: [], spendingOrder: [] },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');

    cash.spend({ amount: 600, account: 'MortgageInterest', year: 2026, bookkeeper });

    assert.equal(cash.balance, -500);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), -600);
});
