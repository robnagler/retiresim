import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { JournalEntry } from '../src/JournalEntry.js';
import { Posting } from '../src/Posting.js';

function _postInterest(bookkeeper) {
    bookkeeper.post(new JournalEntry({
        year: 2026,
        category: 'interest',
        postings: [
            new Posting({ account: 'TaxableBrokerage', amount: 250 }),
            new Posting({ account: 'InterestIncome', amount: -250 }),
        ],
    }));
}

test('balanceChange sums postings for one account in one year', () => {
    const b = new Bookkeeper();
    _postInterest(b);
    assert.equal(b.balanceChange('TaxableBrokerage', 2026), 250);
    assert.equal(b.balanceChange('InterestIncome', 2026), -250);
});

test('reconcile passes when account balance change matches the journal', () => {
    const b = new Bookkeeper();
    _postInterest(b);
    const accounts = {
        TaxableBrokerage: { beginningBalance: 1000, endingBalance: 1250 },
    };
    assert.doesNotThrow(() => b.reconcile(2026, accounts));
});

test('reconcile throws when account balance change does not match the journal', () => {
    const b = new Bookkeeper();
    _postInterest(b);
    const accounts = {
        TaxableBrokerage: { beginningBalance: 1000, endingBalance: 1300 },
    };
    assert.throws(() => b.reconcile(2026, accounts), /account=TaxableBrokerage/);
});
