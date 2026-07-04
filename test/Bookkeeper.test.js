import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Account } from '../src/Account.js';
import { Mortgage } from '../src/Mortgage.js';
import { JournalEntry } from '../src/JournalEntry.js';
import { Posting } from '../src/Posting.js';

test('runYear grows an account and reconciles', () => {
    const account = new Account({ name: 'Taxable', balance: 1000, rate: 0.05, priority: 0 });
    const bookkeeper = new Bookkeeper({ accounts: [account] });
    bookkeeper.runYear(2026);
    assert.equal(account.balance, 1050);
    assert.equal(bookkeeper.balanceChange('Taxable', 2026), 50);
});

test('runYear pays down a mortgage and reconciles', () => {
    const mortgage = new Mortgage({ name: 'Mortgage', balance: 200000, rate: 0.06, monthlyPayment: 1200, priority: 0 });
    const bookkeeper = new Bookkeeper({ accounts: [mortgage] });
    bookkeeper.runYear(2026);
    const change = mortgage.balance - 200000;
    assert.ok(change < 0);
    assert.equal(bookkeeper.balanceChange('Mortgage', 2026), change);
});

test('runYear throws when the journal does not match an account change', () => {
    const account = new Account({ name: 'Taxable', balance: 1000, rate: 0.05, priority: 0 });
    const bookkeeper = new Bookkeeper({ accounts: [account] });
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
