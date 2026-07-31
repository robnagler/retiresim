import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NonSpousalInheritedIra } from '../../src/biz/NonSpousalInheritedIra.js';
import { Bookkeeper } from '../../src/biz/Bookkeeper.js';
import { Cash } from '../../src/biz/Cash.js';
import { TaxCalculator } from '../../src/biz/TaxCalculator.js';
import { testConfig, taxSpender } from '../support/testConfig.js';

test('inherited in 2020 or later, earn distributes the balance straight-line over the years remaining until the 10-year deadline, taxable like a TraditionalIra', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'NonSpousalInheritedIra', balance: 25000, inheritedYear: 2021 }],
        spendingOrder: [taxSpender()],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { NonSpousalInheritedIra, TaxCalculator, Cash } });

    // deadline = 2031, 2026 has 6 years remaining (2026..2031 inclusive)
    bookkeeper.runYear(2026);

    const a = bookkeeper.accounts[0];
    assert.equal(a.balance, 25000 - 25000 / 6);
    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 25000 / 6);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 25000 / 6);
});

test('inherited before 2020 (pre-SECURE-Act stretch), earn uses the beneficiary\'s own life expectancy, reduced by one each year since the first distribution year', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'NonSpousalInheritedIra', balance: 100000, inheritedYear: 2009, birthYear: 1970 }],
        spendingOrder: [taxSpender()],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { NonSpousalInheritedIra, TaxCalculator, Cash } });

    // first distribution year 2010, age 40 -> factor 45.7, reduced by 16 years (2026-2010) -> 29.7
    bookkeeper.runYear(2026);

    const factor = 45.7 - 16;
    const a = bookkeeper.accounts[0];
    assert.equal(a.balance, 100000 - 100000 / factor);
    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 100000 / factor);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 100000 / factor);
});

test('the year a pre-2020 IRA was inherited, before its first distribution year, earn returns no distribution', () => {
    const config = testConfig({
        sp500Rate: 0.05,
        withdrawalOrder: [{ name: 'NonSpousalInheritedIra', balance: 100000, inheritedYear: 2009, birthYear: 1970 }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { NonSpousalInheritedIra, Cash } });

    bookkeeper.runYear(2009);

    const a = bookkeeper.accounts[0];
    assert.equal(a.balance, 100000 * 1.05);
    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2009), 0);
});

// The straight-line schedule empties the account exactly on the deadline,
// so every year after it is a year with nothing left to distribute. Simply
// throwing past the deadline made an emptied account fail in the year after
// it did everything right, which any horizon reaching eleven years past an
// inheritance hits -- and the failure named the balance as the problem
// while reporting that balance as zero.
test('earn is done, not in error, in the years after the deadline once the balance has reached zero', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'NonSpousalInheritedIra', balance: 25000, inheritedYear: 2021 }],
        spendingOrder: [taxSpender()],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { NonSpousalInheritedIra, TaxCalculator, Cash } });
    // deadline = 2031; run every year through it, emptying the account.
    for (let year = 2026; year <= 2031; year++) {
        bookkeeper.runYear(year);
    }
    assert.equal(bookkeeper.accounts[0].balance, 0);

    bookkeeper.runYear(2032);

    assert.equal(bookkeeper.accounts[0].balance, 0);
});

// Emptied is judged to the half cent the ledger already reconciles to, not
// to exactly zero -- a residue that small is rounding, not money somebody
// failed to distribute, and a negative one is not undistributed money at
// all.
test('a balance left within the reconciliation tolerance past the deadline counts as emptied, in either direction', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'NonSpousalInheritedIra', balance: 25000, inheritedYear: 2021 }],
        spendingOrder: [taxSpender()],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { NonSpousalInheritedIra, TaxCalculator, Cash } });
    const account = bookkeeper.accounts[0];
    for (let year = 2026; year <= 2031; year++) {
        bookkeeper.runYear(year);
    }

    account.balance = 0.004;
    assert.doesNotThrow(() => account.earn(2032, bookkeeper));
    account.balance = -0.004;
    assert.doesNotThrow(() => account.earn(2032, bookkeeper));
    account.balance = 0.02;
    assert.throws(() => account.earn(2032, bookkeeper), /not fully distributed/);
});

// Money still sitting there past the deadline is a different matter: the
// law required it out, so this is a real modeling error rather than a
// finished account.
test('earn throws past the deadline when a balance is somehow left', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'NonSpousalInheritedIra', balance: 25000, inheritedYear: 2020 }],
        spendingOrder: [taxSpender()],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { NonSpousalInheritedIra, TaxCalculator, Cash } });

    assert.throws(() => bookkeeper.runYear(2031), /not fully distributed by deadline=2030/);
});

test('earn throws when the year is before the account was inherited', () => {
    const config = testConfig({
        withdrawalOrder: [{ name: 'NonSpousalInheritedIra', balance: 100000, inheritedYear: 2009, birthYear: 1970 }],
    });
    const bookkeeper = new Bookkeeper({ config, classes: { NonSpousalInheritedIra, Cash } });

    assert.throws(() => bookkeeper.runYear(2008), /year=2008 before inheritedYear=2009/);
});
