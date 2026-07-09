import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cash } from '../src/Cash.js';
import { Account } from '../src/Account.js';
import { TraditionalIra } from '../src/TraditionalIra.js';
import { Mortgage } from '../src/Mortgage.js';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { LivingExpense } from '../src/LivingExpense.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Config } from '../src/Config.js';

const buildConfig = () => new Config({
    Bookkeeper: { accountClasses: ['Taxable', 'TradIra'] },
    Taxable: { class: 'Account', balance: 1000, rate: 0 },
    TradIra: { class: 'TraditionalIra', balance: 5000, rate: 0 },
    Cash: { balance: 0, withdrawalOrder: ['Taxable', 'TradIra'] },
});

test('produce withdraws from accounts in withdrawalOrder and posts a journal entry per source', () => {
    const config = buildConfig();
    const bookkeeper = new Bookkeeper({ config, classes: { Account, TraditionalIra } });
    const [taxable, tradIra] = bookkeeper.accounts;
    const cash = new Cash({ name: 'Cash', config, accounts: [taxable, tradIra] });

    const rv = cash.produce({ amount: 1500, year: 2026, bookkeeper });

    assert.deepEqual(rv, [
        { account: 'Taxable', amount: 1000 },
        { account: 'TradIra', amount: 500 },
    ]);
    assert.equal(taxable.balance, 0);
    assert.equal(tradIra.balance, 4500);
    assert.equal(cash.balance, 1500);
    assert.equal(bookkeeper.balanceChange('Taxable', 2026), -1000);
    assert.equal(bookkeeper.balanceChange('TradIra', 2026), -500);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 1500);
});

test('produce stops early once the amount is fully covered by earlier accounts', () => {
    const config = buildConfig();
    const bookkeeper = new Bookkeeper({ config, classes: { Account, TraditionalIra } });
    const [taxable, tradIra] = bookkeeper.accounts;
    const cash = new Cash({ name: 'Cash', config, accounts: [taxable, tradIra] });

    const rv = cash.produce({ amount: 400, year: 2026, bookkeeper });

    assert.deepEqual(rv, [{ account: 'Taxable', amount: 400 }]);
    assert.equal(taxable.balance, 600);
    assert.equal(tradIra.balance, 5000);
    assert.equal(cash.balance, 400);
});

test('produce throws when accounts in withdrawalOrder cannot cover the amount', () => {
    const config = new Config({
        Bookkeeper: { accountClasses: ['Taxable'] },
        Taxable: { class: 'Account', balance: 1000, rate: 0 },
        Cash: { balance: 0, withdrawalOrder: ['Taxable'] },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account } });
    const [taxable] = bookkeeper.accounts;
    const cash = new Cash({ name: 'Cash', config, accounts: [taxable] });

    assert.throws(() => cash.produce({ amount: 1500, year: 2026, bookkeeper }), /shortfall=500/);
});

test('spend withdraws from cash and posts a journal entry to the expense category', () => {
    const config = new Config({
        Bookkeeper: { accountClasses: [] },
        Cash: { balance: 1500, withdrawalOrder: [] },
    });
    const cash = new Cash({ name: 'Cash', config, accounts: [] });
    const bookkeeper = new Bookkeeper({ config, classes: {} });

    cash.spend({ amount: 600, account: 'MortgageInterest', year: 2026, bookkeeper });

    assert.equal(cash.balance, 900);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), -600);
    assert.equal(bookkeeper.balanceChange('MortgageInterest', 2026), 600);
});

test('runYear produces the total owed by all spenders, then spends it per category', () => {
    const config = new Config({
        Bookkeeper: { accountClasses: ['Taxable'] },
        Taxable: { class: 'Account', balance: 20000, rate: 0 },
        Mortgage: { balance: 200000, rate: 0.06, monthlyPayment: 1200 },
        Tax: {
            balance: 3000,
            federalBrackets: [{ rate: 0.10, upTo: null }],
            stateRate: 0.044,
        },
        LivingExpense: { balance: 2000, rate: 0.025 },
        Cash: { balance: 0, withdrawalOrder: ['Taxable'] },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account } });
    const [taxable] = bookkeeper.accounts;
    const mortgage = new Mortgage({ name: 'Mortgage', config });
    const tax = new TaxCalculator({ name: 'Tax', config });
    const livingExpense = new LivingExpense({ name: 'LivingExpense', config });
    mortgage.makePayment();
    const cash = new Cash({ name: 'Cash', config, accounts: [taxable], spenders: [mortgage, tax, livingExpense] });

    cash.runYear({ year: 2026, bookkeeper });

    const total = mortgage.interest + 3000 + 2000;
    assert.equal(taxable.balance, 20000 - total);
    assert.equal(cash.balance, 0);
    assert.equal(bookkeeper.balanceChange('MortgageInterest', 2026), mortgage.interest);
    assert.equal(bookkeeper.balanceChange('Tax', 2026), 3000);
    assert.equal(bookkeeper.balanceChange('LivingExpense', 2026), 2000);
});

test('spend can carry cash negative -- produce brings it back to reconcile', () => {
    const config = new Config({
        Bookkeeper: { accountClasses: [] },
        Cash: { balance: 100, withdrawalOrder: [] },
    });
    const cash = new Cash({ name: 'Cash', config, accounts: [] });
    const bookkeeper = new Bookkeeper({ config, classes: {} });

    cash.spend({ amount: 600, account: 'MortgageInterest', year: 2026, bookkeeper });

    assert.equal(cash.balance, -500);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), -600);
});
