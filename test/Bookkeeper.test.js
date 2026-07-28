import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Account } from '../src/Account.js';
import { Mortgage } from '../src/Mortgage.js';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { TaxableAccount } from '../src/TaxableAccount.js';
import { TraditionalIra } from '../src/TraditionalIra.js';
import { RothIra } from '../src/RothIra.js';
import { NonSpousalInheritedIra } from '../src/NonSpousalInheritedIra.js';
import { HsaAccount } from '../src/HsaAccount.js';
import { LivingExpense } from '../src/LivingExpense.js';
import { Cash } from '../src/Cash.js';
import { JournalEntry } from '../src/JournalEntry.js';
import { Posting } from '../src/Posting.js';
import { testConfig, taxSpender } from './support/testConfig.js';

test('runYear grows an account and reconciles', () => {
    const config = testConfig({ sp500Rate: 0.05, withdrawalOrder: [{ name: 'Account', balance: 1000 }] });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Cash } });
    bookkeeper.runYear(2026);
    assert.equal(bookkeeper.accounts[0].balance, 1050);
    assert.equal(bookkeeper.balanceChange('Account', 2026), 50);
});

test('runYear pays down a mortgage and reconciles', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'Account', balance: 1000000 }],
        spendingOrder: [{ name: 'Mortgage', balance: -200000, rate: 0.06, endYear: 2055 }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Mortgage, Cash } });
    bookkeeper.runYear(2026);
    const mortgage = bookkeeper.accounts.find((a) => a.name === 'Mortgage');
    const change = mortgage.balance - (-200000);
    assert.ok(change > 0);
    assert.equal(bookkeeper.balanceChange('Mortgage', 2026), change);
});

test('runYear wipes the mortgage balance at sellYear and reconciles, and netWorth stops being reduced by it', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'Taxable', class: 'TaxableAccount', balance: 1000000, basis: 1000000 }],
        spendingOrder: [{ name: 'Mortgage', balance: -200000, rate: 0.06, endYear: 2055, sellYear: 2026 }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TaxableAccount, Mortgage, Cash } });

    bookkeeper.runYear(2026);

    const mortgage = bookkeeper.accounts.find((a) => a.name === 'Mortgage');
    assert.equal(mortgage.balance, 0);
    assert.equal(bookkeeper.balanceChange('Mortgage', 2026), 200000);
    assert.equal(bookkeeper.netWorth(), 1000000);
});

test('constructor resolves multiple instances of the same class via a dash-suffixed name, no explicit class needed', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'Account', balance: 2000000 }],
        spendingOrder: [
            { name: 'Mortgage-E26', balance: -100000, rate: 0.06, endYear: 2055 },
            { name: 'Mortgage-7999', balance: -200000, rate: 0.06, endYear: 2050 },
        ],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Mortgage, Cash } });

    bookkeeper.runYear(2026);

    const first = bookkeeper.accounts.find((a) => a.name === 'Mortgage-E26');
    const second = bookkeeper.accounts.find((a) => a.name === 'Mortgage-7999');
    assert.ok(first instanceof Mortgage);
    assert.ok(second instanceof Mortgage);
    assert.notEqual(first.balance, second.balance);
});

test('constructor builds accounts from Cash\'s withdrawalOrder and spendingOrder, resolving each one\'s class', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'Account', balance: 1000 }],
        spendingOrder: [{ name: 'Mortgage', balance: -200000, rate: 0.06, endYear: 2055 }],
    });

    const bookkeeper = new Bookkeeper({ config, classes: { Account, Mortgage, Cash } });

    assert.equal(bookkeeper.accounts.length, 3);
    assert.ok(bookkeeper.accounts[0] instanceof Account);
    assert.equal(bookkeeper.accounts[0].name, 'Account');
    assert.ok(bookkeeper.accounts[1] instanceof Mortgage);
    assert.equal(bookkeeper.accounts[1].name, 'Mortgage');
    assert.ok(bookkeeper.accounts[2] instanceof Cash);
    assert.equal(bookkeeper.accounts[2].name, 'Cash');
});

test('report dumps each account name and balance as a table', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'Account', balance: 1000 }],
        spendingOrder: [{ name: 'Mortgage', balance: -200000, rate: 0.06, endYear: 2055 }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Mortgage, Cash } });

    const rv = bookkeeper.report();

    const lines = rv.split('\n');
    assert.equal(lines.length, 5);
    assert.match(lines[0], /^Account\s+Balance$/);
    assert.match(lines[1], /^Account\s+1000$/);
    assert.match(lines[2], /^Mortgage\s+-200000$/);
    assert.match(lines[3], /^Cash\s+0$/);
    assert.match(lines[4], /^Total\s+-199000$/);
});

test('netWorth sums Taxable + Traditional/Inherited IRA + Roth/HSA + Cash balances plus Mortgage (already negative), excluding LivingExpense/Tax', () => {
    const config = testConfig({
        balance: 700,
        withdrawalOrder: [
            { name: 'TaxableAccount', balance: 1000, basis: 0 },
            { name: 'TraditionalIra', balance: 2000, birthYear: 2000 },
            { name: 'RothIra', balance: 3000, withdraw: 0 },
            { name: 'NonSpousalInheritedIra', balance: 4000, birthYear: 2000, inheritedYear: 2021 },
            { name: 'HsaAccount', balance: 5000, withdraw: 0 },
        ],
        spendingOrder: [
            { name: 'Mortgage', balance: -6000, rate: 0.06, endYear: 2100 },
            { name: 'LivingExpense', balance: 700 },
            taxSpender({ balance: -50 }),
        ],
    });
    const bookkeeper = new Bookkeeper({
        config,
        classes: { TaxableAccount, TraditionalIra, RothIra, NonSpousalInheritedIra, HsaAccount, Mortgage, LivingExpense, TaxCalculator, Cash },
    });

    assert.equal(bookkeeper.netWorth(), 1000 + 2000 + 3000 + 4000 + 5000 - 6000 + 700);
});

test('reportTransactions dumps each journal entry for the given year as a category/source/dest/amount table', () => {
    const config = testConfig({ sp500Rate: 0.1, withdrawalOrder: [{ name: 'Account', balance: 1000 }] });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Cash } });

    bookkeeper.runYear(2026);
    const rv = bookkeeper.reportTransactions(2026);

    const lines = rv.split('\n');
    assert.match(lines[0], /^Category\s+Source\s+Dest\s+Amount$/);
    assert.match(lines[1], /^growth\s+UnrealizedGrowth\s+Account\s+100\.00$/);
});

test('reportTransactions is empty (just the header) for a year with no journal entries', () => {
    const config = testConfig();
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });

    const rv = bookkeeper.reportTransactions(2026);

    assert.equal(rv.split('\n').length, 1);
    assert.match(rv, /^Category\s+Source\s+Dest\s+Amount$/);
});

test('reportYear combines that year\'s transactions and the current balances table under a year header', () => {
    const config = testConfig({ sp500Rate: 0.1, withdrawalOrder: [{ name: 'Account', balance: 1000 }] });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Cash } });

    bookkeeper.runYear(2026);
    const rv = bookkeeper.reportYear(2026);

    assert.match(rv, /^Year 2026\n\nTransactions\n/);
    assert.match(rv, /\n\nBalances\nAccount\s+Balance\n/);
    assert.match(rv, /Account\s+1100\n/);
});

test('taxCalculator is found among accounts by type, and its postAmount posts through this bookkeeper', () => {
    const config = testConfig({ spendingOrder: [taxSpender()] });
    const bookkeeper = new Bookkeeper({ config, classes: { TaxCalculator, Cash } });

    bookkeeper.taxCalculator.postAmount('OrdinaryIncome', 1000, 2026, bookkeeper);

    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 1000);
});

test('taxCalculator is undefined when no TaxCalculator is configured -- lets accounts be tested without a Tax spender', () => {
    const config = testConfig();
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });

    assert.equal(bookkeeper.taxCalculator, undefined);
});

test('a gain realized to cover a shortfall is taxed the same year it is realized', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'TaxableAccount', balance: 1000, basis: 200 }],
        spendingOrder: [
            { name: 'LivingExpense', balance: 1000 },
            taxSpender({ ssProvisionalIncomeThresholds: { low: 0, high: 0 } }),
        ],
    });
    const bookkeeper = new Bookkeeper({
        config,
        classes: { TaxableAccount, LivingExpense, TaxCalculator, Cash },
    });

    bookkeeper.runYear(2026);

    // The shortfall-covering withdrawal from TaxableAccount realizes an
    // $800 gain ($1000 withdrawn, $200 basis) -- the ledger has it.
    assert.equal(bookkeeper.balanceChange('LtcgIncome', 2026), 800);
    // That gain must be reflected in the same year's tax calculation.
    // Currently fails: TaxCalculator.prepareNextYear() runs (inside
    // Cash.runYear()) before produce() withdraws to cover the shortfall,
    // so magi comes out 0 -- the gain is dropped, not deferred.
    assert.equal(bookkeeper.taxCalculator.magi, 800);
});

test('runYear throws when the journal does not match an account change', () => {
    const config = testConfig({ sp500Rate: 0.05, withdrawalOrder: [{ name: 'Account', balance: 1000 }] });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Cash } });
    bookkeeper.post(new JournalEntry({
        year: 2026,
        category: 'error',
        source: new Posting({ account: 'UnrealizedGrowth', amount: -10 }),
        dest: new Posting({ account: 'Account', amount: 10 }),
    }));
    assert.throws(() => bookkeeper.runYear(2026), /name=Account/);
});
