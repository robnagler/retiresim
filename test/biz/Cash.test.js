import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cash } from '../../src/biz/Cash.js';
import { Account } from '../../src/biz/Account.js';
import { TraditionalIra } from '../../src/biz/TraditionalIra.js';
import { NonSpousalInheritedIra } from '../../src/biz/NonSpousalInheritedIra.js';
import { RothIra } from '../../src/biz/RothIra.js';
import { HsaAccount } from '../../src/biz/HsaAccount.js';
import { TaxableAccount } from '../../src/biz/TaxableAccount.js';
import { Mortgage } from '../../src/biz/Mortgage.js';
import { TaxCalculator } from '../../src/biz/TaxCalculator.js';
import { LivingExpense } from '../../src/biz/LivingExpense.js';
import { Bookkeeper } from '../../src/biz/Bookkeeper.js';
import { InsufficientFundsError } from '../../src/biz/InsufficientFundsError.js';
import { testConfig, taxSpender } from '../support/testConfig.js';

const buildConfig = () => testConfig({
    withdrawalOrder: [
        { name: 'Account', balance: 1000 },
        { name: 'TraditionalIra', balance: 5000, birthYear: 2000 },
    ],
});

test('runYear grows the balance at half of Economy.interestRate, not the full rate', () => {
    const config = testConfig({ interestRate: 0.04, balance: 1000 });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');

    cash.runYear({ year: 2026, bookkeeper });

    assert.equal(cash.balance, 1000 * 1.02);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 20);
});

test('payDirect withdraws from the named source account and posts straight to the expense category, not through Cash', () => {
    const config = testConfig({ withdrawalOrder: [{ name: 'Hsa', class: 'RothIra', balance: 5000, withdraw: 0 }] });
    const bookkeeper = new Bookkeeper({ config, classes: { RothIra, Cash } });
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');

    const remaining = cash.payDirect({ amount: 1000, sourceAccount: 'Hsa', destCategory: 'MedicarePremium', year: 2026, bookkeeper });

    const hsa = bookkeeper.accounts.find((a) => a.name === 'Hsa');
    assert.equal(remaining, 0);
    assert.equal(hsa.balance, 4000);
    assert.equal(cash.balance, 0);
    assert.equal(bookkeeper.balanceChange('Hsa', 2026), -1000);
    assert.equal(bookkeeper.balanceChange('MedicarePremium', 2026), 1000);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 0);
});

test('payDirect pays what the source account can cover and returns the rest as a shortfall, instead of throwing', () => {
    const config = testConfig({ withdrawalOrder: [{ name: 'Hsa', class: 'RothIra', balance: 500, withdraw: 0 }] });
    const bookkeeper = new Bookkeeper({ config, classes: { RothIra, Cash } });
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');

    const remaining = cash.payDirect({ amount: 1000, sourceAccount: 'Hsa', destCategory: 'MedicarePremium', year: 2026, bookkeeper });

    const hsa = bookkeeper.accounts.find((a) => a.name === 'Hsa');
    assert.equal(remaining, 500);
    assert.equal(hsa.balance, 0);
    assert.equal(bookkeeper.balanceChange('Hsa', 2026), -500);
    assert.equal(bookkeeper.balanceChange('MedicarePremium', 2026), 500);
});

test('runYear routes a spender with cfg.payFrom directly to that account, bypassing Cash\'s own balance entirely', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'Hsa', class: 'RothIra', balance: 5000, withdraw: 0 }],
        spendingOrder: [{ name: 'Expense', class: 'LivingExpense', balance: 1000, payFrom: 'Hsa' }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { RothIra, LivingExpense, Cash } });

    bookkeeper.runYear(2026);

    const hsa = bookkeeper.accounts.find((a) => a.name === 'Hsa');
    assert.equal(hsa.balance, 4000);
    assert.equal(bookkeeper.balanceChange('LivingExpensePaid', 2026), 1000);
    assert.equal(bookkeeper.accounts.find((a) => a.name === 'Cash').balance, 0);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 0);
});

test('runYear falls back to the normal Cash/produce() path for whatever a payFrom account can\'t cover, instead of throwing', () => {
    const config = testConfig({
        withdrawalOrder: [
            { name: 'Hsa', class: 'RothIra', balance: 300, withdraw: 0 },
            { name: 'Account', balance: 5000 },
        ],
        spendingOrder: [{ name: 'Expense', class: 'LivingExpense', balance: 1000, payFrom: 'Hsa' }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { RothIra, Account, LivingExpense, Cash } });

    bookkeeper.runYear(2026);

    const hsa = bookkeeper.accounts.find((a) => a.name === 'Hsa');
    const account = bookkeeper.accounts.find((a) => a.name === 'Account');
    assert.equal(hsa.balance, 0);
    assert.equal(account.balance, 5000 - 700);
    assert.equal(bookkeeper.balanceChange('LivingExpensePaid', 2026), 1000);
    assert.equal(bookkeeper.accounts.find((a) => a.name === 'Cash').balance, 0);
});

test('runYear pays a spender without cfg.payFrom through the shared Cash pool as before, unaffected by other spenders using payFrom', () => {
    const config = testConfig({
        withdrawalOrder: [
            { name: 'Account', balance: 5000 },
            { name: 'Hsa', class: 'RothIra', balance: 5000, withdraw: 0 },
        ],
        spendingOrder: [
            { name: 'FromHsa', class: 'LivingExpense', balance: 1000, payFrom: 'Hsa' },
            { name: 'FromCash', class: 'LivingExpense', balance: 300 },
        ],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { RothIra, Account, LivingExpense, Cash } });

    bookkeeper.runYear(2026);

    assert.equal(bookkeeper.accounts.find((a) => a.name === 'Hsa').balance, 4000);
    assert.equal(bookkeeper.accounts.find((a) => a.name === 'Account').balance, 5000 - 300);
    assert.equal(bookkeeper.balanceChange('LivingExpensePaid', 2026), 1300);
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
    const config = testConfig({ withdrawalOrder: [{ name: 'Account', balance: 1000 }] });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Cash } });
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');

    assert.throws(() => cash.produce({ amount: 1500, year: 2026, bookkeeper }), /shortfall=500/);
});

test('produce throws InsufficientFundsError carrying the year, not just a plain Error', () => {
    const config = testConfig({ withdrawalOrder: [{ name: 'Account', balance: 1000 }] });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Cash } });
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');

    try {
        cash.produce({ amount: 1500, year: 2026, bookkeeper });
        assert.fail('expected produce to throw');
    } catch (err) {
        assert.ok(err instanceof InsufficientFundsError);
        assert.equal(err.year, 2026);
    }
});

test('produce posts the gain portion of a TaxableAccount withdrawal to LtcgIncome, not the full amount', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'Taxable', class: 'TaxableAccount', balance: 10000, basis: 6000 }],
        spendingOrder: [taxSpender()],
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

test('produce caps TraditionalIra withdrawals at incomeCeilingBracket\'s resolved dollar amount, falling through to the next account for the remainder', () => {
    const config = testConfig({
        incomeCeilingBracket: 0,
        withdrawalOrder: [
            { name: 'TraditionalIra', balance: 5000, birthYear: 2000 },
            { name: 'Account', balance: 1000 },
        ],
        spendingOrder: [taxSpender({ federalBrackets: [{ rate: 0.10, upTo: 3000 }, { rate: 0.22, upTo: null }] })],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, TraditionalIra, TaxCalculator, Cash } });

    const rv = bookkeeper.accounts.find((a) => a.name === 'Cash').produce({ amount: 4000, year: 2026, bookkeeper });

    assert.deepEqual(rv, [
        { account: 'TraditionalIra', amount: 3000 },
        { account: 'Account', amount: 1000 },
    ]);
});

test('produce\'s incomeCeilingBracket accounts for OrdinaryIncome already posted this year (e.g. Salary), leaving less room', () => {
    const config = testConfig({
        incomeCeilingBracket: 0,
        withdrawalOrder: [
            { name: 'TraditionalIra', balance: 5000, birthYear: 2000 },
            { name: 'Account', balance: 5000 },
        ],
        spendingOrder: [taxSpender({ federalBrackets: [{ rate: 0.10, upTo: 3000 }, { rate: 0.22, upTo: null }] })],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, TraditionalIra, TaxCalculator, Cash } });
    bookkeeper.simplePost(2026, 'earn', 'TaxCalcInput', 'OrdinaryIncome', 2000);

    const rv = bookkeeper.accounts.find((a) => a.name === 'Cash').produce({ amount: 4000, year: 2026, bookkeeper });

    assert.deepEqual(rv, [
        { account: 'TraditionalIra', amount: 1000 },
        { account: 'Account', amount: 3000 },
    ]);
});

test('produce\'s incomeCeilingBracket does not limit ltcg-category (TaxableAccount) withdrawals', () => {
    const config = testConfig({
        incomeCeilingBracket: 0,
        withdrawalOrder: [{ name: 'Taxable', class: 'TaxableAccount', balance: 10000, basis: 6000 }],
        spendingOrder: [taxSpender({ federalBrackets: [{ rate: 0.10, upTo: 0 }, { rate: 0.22, upTo: null }] })],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TaxableAccount, TaxCalculator, Cash } });

    const rv = bookkeeper.accounts.find((a) => a.name === 'Cash').produce({ amount: 5000, year: 2026, bookkeeper });

    assert.deepEqual(rv, [{ account: 'Taxable', amount: 5000 }]);
});

test('produce caps TaxableAccount withdrawals at ltcgCeilingBracket\'s resolved dollar amount based on realized gain, falling through for the remainder', () => {
    // 6000/10000 basis fraction -- each $1 withdrawn realizes $0.40 of
    // gain, so a $2500 ceiling allows a $6250 withdrawal (2500/0.4)
    // before the room runs out.
    const config = testConfig({
        ltcgCeilingBracket: 0,
        withdrawalOrder: [
            { name: 'Taxable', class: 'TaxableAccount', balance: 10000, basis: 6000 },
            { name: 'Account', balance: 5000 },
        ],
        spendingOrder: [taxSpender({ ltcgBrackets: [{ rate: 0.00, upTo: 2500 }, { rate: 0.15, upTo: null }] })],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TaxableAccount, Account, TaxCalculator, Cash } });

    const rv = bookkeeper.accounts.find((a) => a.name === 'Cash').produce({ amount: 8000, year: 2026, bookkeeper });

    assert.deepEqual(rv, [
        { account: 'Taxable', amount: 6250 },
        { account: 'Account', amount: 1750 },
    ]);
    assert.equal(bookkeeper.balanceChange('LtcgIncome', 2026), 2500);
});

test('produce\'s ltcgCeilingBracket does not limit income-category (TraditionalIra) withdrawals', () => {
    const config = testConfig({
        ltcgCeilingBracket: 0,
        withdrawalOrder: [{ name: 'TraditionalIra', balance: 5000, birthYear: 2000 }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TraditionalIra, Cash } });

    const rv = bookkeeper.accounts.find((a) => a.name === 'Cash').produce({ amount: 3000, year: 2026, bookkeeper });

    assert.deepEqual(rv, [{ account: 'TraditionalIra', amount: 3000 }]);
});

test('produce falls back to an uncapped second pass over the same order when the capped pass alone would leave a shortfall, instead of throwing InsufficientFundsError', () => {
    const config = testConfig({
        incomeCeilingBracket: 0,
        withdrawalOrder: [{ name: 'TraditionalIra', balance: 5000, birthYear: 2000 }],
        spendingOrder: [taxSpender({ federalBrackets: [{ rate: 0.10, upTo: 100 }, { rate: 0.22, upTo: null }] })],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TraditionalIra, TaxCalculator, Cash } });
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');

    const rv = cash.produce({ amount: 3000, year: 2026, bookkeeper });

    assert.deepEqual(rv, [
        { account: 'TraditionalIra', amount: 100 },
        { account: 'TraditionalIra', amount: 2900 },
    ]);
    assert.equal(bookkeeper.accounts.find((a) => a.name === 'TraditionalIra').balance, 2000);
    assert.equal(cash.balance, 3000);
});

test('produce walks categoryOrder category-by-category when set, ignoring withdrawalOrder\'s literal sequence', () => {
    // withdrawalOrder lists TraditionalIra (income) before RothIra
    // (taxFree), but categoryOrder puts taxFree first.
    const config = testConfig({
        categoryOrder: ['taxFree', 'income'],
        withdrawalOrder: [
            { name: 'TraditionalIra', balance: 5000, birthYear: 2000 },
            { name: 'Roth', class: 'RothIra', balance: 2000, withdraw: 0 },
        ],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TraditionalIra, RothIra, Cash } });

    const rv = bookkeeper.accounts.find((a) => a.name === 'Cash').produce({ amount: 3000, year: 2026, bookkeeper });

    assert.deepEqual(rv, [
        { account: 'Roth', amount: 2000 },
        { account: 'TraditionalIra', amount: 1000 },
    ]);
});

test('produce never withdraws from a real HsaAccount, even when it\'s first in categoryOrder/withdrawalOrder with plenty of balance -- only payFrom can spend it', () => {
    const config = testConfig({
        categoryOrder: ['taxFree', 'income'],
        withdrawalOrder: [
            { name: 'Hsa', class: 'HsaAccount', balance: 50000, withdraw: 0 },
            { name: 'TraditionalIra', balance: 5000, birthYear: 2000 },
        ],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { HsaAccount, TraditionalIra, Cash } });

    const rv = bookkeeper.accounts.find((a) => a.name === 'Cash').produce({ amount: 3000, year: 2026, bookkeeper });

    assert.deepEqual(rv, [{ account: 'TraditionalIra', amount: 3000 }]);
    assert.equal(bookkeeper.accounts.find((a) => a.name === 'Hsa').balance, 50000);
});

test('produce\'s uncapped fallback pass also skips a real HsaAccount, throwing InsufficientFundsError instead of draining it', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'Hsa', class: 'HsaAccount', balance: 50000, withdraw: 0 }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { HsaAccount, Cash } });

    assert.throws(() => bookkeeper.accounts.find((a) => a.name === 'Cash').produce({ amount: 3000, year: 2026, bookkeeper }), /shortfall=3000/);
    assert.equal(bookkeeper.accounts.find((a) => a.name === 'Hsa').balance, 50000);
});

test('produce\'s income category room already reflects an inherited account\'s forced RMD, posted via earn() before produce() runs', () => {
    const config = testConfig({
        incomeCeilingBracket: 0,
        withdrawalOrder: [
            { name: 'Inherited', class: 'NonSpousalInheritedIra', balance: 25000, inheritedYear: 2021 },
            { name: 'Account', balance: 5000 },
        ],
        spendingOrder: [taxSpender({ federalBrackets: [{ rate: 0.10, upTo: 6000 }, { rate: 0.22, upTo: null }] })],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { NonSpousalInheritedIra, Account, TaxCalculator, Cash } });
    // deadline 2031, 2026 has 6 years remaining -- forces a 25000/6 RMD,
    // already posted to OrdinaryIncome before produce() runs (see
    // Bookkeeper.runYear()'s call order).
    bookkeeper.earners.find((a) => a.name === 'Inherited').earn(2026, bookkeeper);

    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');
    const rv = cash.produce({ amount: 4000, year: 2026, bookkeeper });

    const rmd = 25000 / 6;
    const roomLeft = 6000 - rmd;
    assert.deepEqual(rv, [
        { account: 'Inherited', amount: roomLeft },
        { account: 'Account', amount: 4000 - roomLeft },
    ]);
});

test('spend withdraws from cash and posts a journal entry to the expense category', () => {
    const config = testConfig({ balance: 1500 });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');

    cash.spend({ amount: 600, account: 'MortgageInterest', year: 2026, bookkeeper });

    assert.equal(cash.balance, 900);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), -600);
    assert.equal(bookkeeper.balanceChange('MortgageInterest', 2026), 600);
});

test('runYear produces the total owed by all spenders, then spends it per category', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'Account', balance: 20000 }],
        spendingOrder: [
            { name: 'Mortgage', balance: -200000, rate: 0.06, endYear: 2055 },
            taxSpender({ balance: -3000 }),
            { name: 'LivingExpense', balance: 2000 },
        ],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Mortgage, TaxCalculator, LivingExpense, Cash } });
    const account = bookkeeper.accounts.find((a) => a.name === 'Account');
    const mortgage = bookkeeper.accounts.find((a) => a.name === 'Mortgage');
    const tax = bookkeeper.accounts.find((a) => a.name === 'Tax');
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');
    mortgage.makePayment(2026);
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
    const config = testConfig({ balance: 100 });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');

    cash.spend({ amount: 600, account: 'MortgageInterest', year: 2026, bookkeeper });

    assert.equal(cash.balance, -500);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), -600);
});

test('sweepSurplus moves a positive year-end Cash balance into TaxableAccount, increasing basis by the same amount -- not a taxable event', () => {
    const config = testConfig({
        balance: 800,
        withdrawalOrder: [{ name: 'Taxable', class: 'TaxableAccount', balance: 10000, basis: 6000 }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TaxableAccount, Cash } });
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');
    const taxable = bookkeeper.accounts.find((a) => a.name === 'Taxable');

    cash.sweepSurplus(2026, bookkeeper);

    assert.equal(cash.balance, 0);
    assert.equal(taxable.balance, 10800);
    assert.equal(taxable.basis, 6800);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), -800);
    assert.equal(bookkeeper.balanceChange('Taxable', 2026), 800);
});

test('sweepSurplus does nothing when Cash has no positive balance to sweep', () => {
    const config = testConfig({
        balance: 0,
        withdrawalOrder: [{ name: 'Taxable', class: 'TaxableAccount', balance: 10000, basis: 6000 }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TaxableAccount, Cash } });
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');
    const taxable = bookkeeper.accounts.find((a) => a.name === 'Taxable');

    cash.sweepSurplus(2026, bookkeeper);

    assert.equal(taxable.balance, 10000);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 0);
});

test('sweepSurplus does nothing (does not throw) when no TaxableAccount is configured', () => {
    const config = testConfig({ balance: 800 });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });
    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');

    cash.sweepSurplus(2026, bookkeeper);

    assert.equal(cash.balance, 800);
});

test('runYear sweeps whatever\'s left of the starting Cash balance into TaxableAccount after paying spenders', () => {
    const config = testConfig({
        balance: 1000,
        withdrawalOrder: [{ name: 'Taxable', class: 'TaxableAccount', balance: 10000, basis: 6000 }],
        spendingOrder: [{ name: 'Expense', class: 'LivingExpense', balance: 300 }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TaxableAccount, LivingExpense, Cash } });

    bookkeeper.runYear(2026);

    const cash = bookkeeper.accounts.find((a) => a.name === 'Cash');
    const taxable = bookkeeper.accounts.find((a) => a.name === 'Taxable');
    assert.equal(cash.balance, 0);
    // Starting Cash balance 1000, LivingExpense costs 300, leaving a 700
    // surplus that should land entirely in TaxableAccount.
    assert.equal(taxable.balance, 10000 + 700);
    assert.equal(taxable.basis, 6000 + 700);
});
