import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Account } from '../src/Account.js';
import { Mortgage } from '../src/Mortgage.js';
import { JournalEntry } from '../src/JournalEntry.js';
import { Posting } from '../src/Posting.js';
import { Config } from '../src/Config.js';

test('runYear grows an account and reconciles', () => {
    const config = new Config({
        Bookkeeper: { accountClasses: ['Taxable'] },
        Taxable: { class: 'Account', balance: 1000, rate: 0.05, priority: 0 },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account } });
    bookkeeper.runYear(2026);
    assert.equal(bookkeeper.accounts[0].balance, 1050);
    assert.equal(bookkeeper.balanceChange('Taxable', 2026), 50);
});

test('runYear pays down a mortgage and reconciles', () => {
    const config = new Config({
        Bookkeeper: { accountClasses: ['Mortgage'] },
        Mortgage: { balance: 200000, rate: 0.06, monthlyPayment: 1200, priority: 0 },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Mortgage } });
    bookkeeper.runYear(2026);
    const mortgage = bookkeeper.accounts[0];
    const change = mortgage.balance - 200000;
    assert.ok(change < 0);
    assert.equal(bookkeeper.balanceChange('Mortgage', 2026), change);
});

test('constructor builds accounts from accountClasses, resolving each one\'s class', () => {
    const config = new Config({
        Bookkeeper: { accountClasses: ['Taxable', 'Mortgage'] },
        Taxable: { class: 'Account', balance: 1000, rate: 0.05, priority: 0 },
        Mortgage: { balance: 200000, rate: 0.06, monthlyPayment: 1200, priority: 1 },
    });

    const bookkeeper = new Bookkeeper({ config, classes: { Account, Mortgage } });

    assert.equal(bookkeeper.accounts.length, 2);
    assert.ok(bookkeeper.accounts[0] instanceof Account);
    assert.equal(bookkeeper.accounts[0].name, 'Taxable');
    assert.ok(bookkeeper.accounts[1] instanceof Mortgage);
    assert.equal(bookkeeper.accounts[1].name, 'Mortgage');
});

test('report dumps each account name and balance as a table', () => {
    const config = new Config({
        Bookkeeper: { accountClasses: ['Taxable', 'Mortgage'] },
        Taxable: { class: 'Account', balance: 1000, rate: 0, priority: 0 },
        Mortgage: { balance: 200000, rate: 0.06, monthlyPayment: 1200, priority: 1 },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account, Mortgage } });

    const rv = bookkeeper.report();

    const lines = rv.split('\n');
    assert.equal(lines.length, 4);
    assert.match(lines[0], /^Account\s+Balance$/);
    assert.match(lines[1], /^Taxable\s+1000$/);
    assert.match(lines[2], /^Mortgage\s+200000$/);
    assert.match(lines[3], /^Total\s+201000$/);
});

test('runYear throws when the journal does not match an account change', () => {
    const config = new Config({
        Bookkeeper: { accountClasses: ['Taxable'] },
        Taxable: { class: 'Account', balance: 1000, rate: 0.05, priority: 0 },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { Account } });
    bookkeeper.post(new JournalEntry({
        year: 2026,
        category: 'error',
        postings: [
            new Posting({ account: 'Taxable', amount: 10 }),
            new Posting({ account: 'UnrealizedGrowth', amount: -10 }),
        ],
    }));
    assert.throws(() => bookkeeper.runYear(2026), /name=Taxable/);
});
