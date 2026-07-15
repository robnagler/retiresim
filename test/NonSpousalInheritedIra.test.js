import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NonSpousalInheritedIra } from '../src/NonSpousalInheritedIra.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Cash } from '../src/Cash.js';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { Config } from '../src/Config.js';

const taxSpender = () => ({
    name: 'Tax',
    class: 'TaxCalculator',
    balance: 0,
    federalBrackets: [{ rate: 0.10, upTo: null }],
    ltcgBrackets: [{ rate: 0.15, upTo: null }],
    stateRate: 0.044,
    standardDeduction: 0,
    initialMagi: 0,
});

test('inherited in 2020 or later, earn distributes the balance straight-line over the years remaining until the 10-year deadline, taxable like a TraditionalIra', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'NonSpousalInheritedIra', balance: 25000, rate: 0, inheritedYear: 2021 }],
            spendingOrder: [taxSpender()],
        },
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
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'NonSpousalInheritedIra', balance: 100000, rate: 0, inheritedYear: 2009, birthYear: 1970 }],
            spendingOrder: [taxSpender()],
        },
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
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'NonSpousalInheritedIra', balance: 100000, rate: 0.05, inheritedYear: 2009, birthYear: 1970 }],
            spendingOrder: [],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { NonSpousalInheritedIra, Cash } });

    bookkeeper.runYear(2009);

    const a = bookkeeper.accounts[0];
    assert.equal(a.balance, 100000 * 1.05);
    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2009), 0);
});

test('earn throws when the year is before the account was inherited', () => {
    const config = new Config({
        Cash: {
            balance: 0,
            withdrawalOrder: [{ name: 'NonSpousalInheritedIra', balance: 100000, rate: 0, inheritedYear: 2009, birthYear: 1970 }],
            spendingOrder: [],
        },
    });
    const bookkeeper = new Bookkeeper({ config, classes: { NonSpousalInheritedIra, Cash } });

    assert.throws(() => bookkeeper.runYear(2008), /year=2008 before inheritedYear=2009/);
});
