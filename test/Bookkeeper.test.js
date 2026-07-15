import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Account } from '../src/Account.js';
import { Mortgage } from '../src/Mortgage.js';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { Cash } from '../src/Cash.js';
import { JournalEntry } from '../src/JournalEntry.js';
import { Posting } from '../src/Posting.js';
import { Config } from '../src/Config.js';

test('runYear grows an account and reconciles', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'Account', balance: 1000, rate: 0.05 }],
            spendingOrder: [],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Cash } });
    bookkeeper.runYear(2026);
    assert.equal(bookkeeper.accounts[0].balance, 1050);
    assert.equal(bookkeeper.balanceChange('Account', 2026), 50);
});

test('runYear pays down a mortgage and reconciles', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'Account', balance: 1000000, rate: 0 }],
            spendingOrder: [{ name: 'Mortgage', balance: -200000, rate: 0.06, monthlyPayment: 1200 }],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Mortgage, Cash } });
    bookkeeper.runYear(2026);
    const mortgage = bookkeeper.accounts.find((a) => a.name === 'Mortgage');
    const change = mortgage.balance - (-200000);
    assert.ok(change > 0);
    assert.equal(bookkeeper.balanceChange('Mortgage', 2026), change);
});

test('constructor builds accounts from Cash\'s withdrawalOrder and spendingOrder, resolving each one\'s class', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'Account', balance: 1000, rate: 0.05 }],
            spendingOrder: [{ name: 'Mortgage', balance: -200000, rate: 0.06, monthlyPayment: 1200 }],
        },
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
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'Account', balance: 1000, rate: 0 }],
            spendingOrder: [{ name: 'Mortgage', balance: -200000, rate: 0.06, monthlyPayment: 1200 }],
        },
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

test('taxCalculator is found among accounts by type, and its postAmount posts through this bookkeeper', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [],
            spendingOrder: [{
                name: 'Tax',
                class: 'TaxCalculator',
                balance: 0,
                federalBrackets: [{ rate: 0.10, upTo: null }],
                ltcgBrackets: [{ rate: 0.15, upTo: null }],
                stateRate: 0.044,
            }],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { TaxCalculator, Cash } });

    bookkeeper.taxCalculator.postAmount('OrdinaryIncome', 1000, 2026, bookkeeper);

    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 1000);
});

test('taxCalculator is undefined when no TaxCalculator is configured -- lets accounts be tested without a Tax spender', () => {
    const config = new Config({
        Cash: { balance: 0, withdrawalOrder: [], spendingOrder: [] },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });

    assert.equal(bookkeeper.taxCalculator, undefined);
});

test('runYear throws when the journal does not match an account change', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'Account', balance: 1000, rate: 0.05 }],
            spendingOrder: [],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Cash } });
    bookkeeper.post(new JournalEntry({
        year: 2026,
        category: 'error',
        source: new Posting({ account: 'UnrealizedGrowth', amount: -10 }),
        dest: new Posting({ account: 'Account', amount: 10 }),
    }));
    assert.throws(() => bookkeeper.runYear(2026), /name=Account/);
});
