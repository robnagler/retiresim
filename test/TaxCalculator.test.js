import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { Config } from '../src/Config.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Cash } from '../src/Cash.js';
import { JournalEntry } from '../src/JournalEntry.js';
import { Posting } from '../src/Posting.js';

const config = new Config({
    Economy: { inflationRate: 0, interestRate: 0, sp500Rate: 0 },
    Cash: { balance: 0, withdrawalOrder: [], spendingOrder: [] },
    Tax: {
        balance: -5000,
        federalBrackets: [
            { rate: 0.10, upTo: 10000 },
            { rate: 0.12, upTo: 40000 },
            { rate: 0.22, upTo: null },
        ],
        ltcgBrackets: [
            { rate: 0.00, upTo: 40000 },
            { rate: 0.15, upTo: 100000 },
            { rate: 0.20, upTo: null },
        ],
        stateRate: 0.044,
        standardDeduction: 0,
        initialMagi: 0,
    },
});

const configWithSS = () => new Config({
    Economy: { inflationRate: 0, interestRate: 0, sp500Rate: 0 },
    Cash: { balance: 0, withdrawalOrder: [], spendingOrder: [] },
    Tax: {
        balance: -5000,
        federalBrackets: [{ rate: 0.10, upTo: null }],
        ltcgBrackets: [{ rate: 0.15, upTo: null }],
        stateRate: 0.044,
        standardDeduction: 0,
        initialMagi: 0,
        ssProvisionalIncomeThresholds: { low: 32000, high: 44000 },
    },
});

test('federal applies progressive brackets', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.federal(50000), 10000 * 0.10 + 30000 * 0.12 + 10000 * 0.22);
});

test('federal stays within the first bracket for low income', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.federal(5000), 5000 * 0.10);
});

test('state applies a flat rate', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.state(50000), 50000 * 0.044);
});

test('ltcg is untaxed when ordinary income plus gains stay within the 0% bracket', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.ltcg(20000, 10000), 0);
});

test('ltcg stacks on top of ordinary income, splitting across brackets it straddles', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    // floor=35000, top=45000: 5000 in the 0% bracket (35000-40000), 5000 in the 15% bracket (40000-45000)
    assert.equal(c.ltcg(35000, 10000), 5000 * 0.15);
});

test('ltcg is taxed entirely at the top bracket rate when ordinary income already exceeds it', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.ltcg(150000, 50000), 50000 * 0.20);
});

test('ltcg is zero when there are no gains', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.ltcg(50000, 0), 0);
});

test('taxableSocialSecurity is zero below the low provisional-income threshold', () => {
    const c = new TaxCalculator({ name: 'Tax', config: configWithSS() });
    // provisional = 10000 + 0.5*30000 = 25000, below the 32000 low threshold
    assert.equal(c.taxableSocialSecurity(10000, 30000), 0);
});

test('taxableSocialSecurity is zero when there is no benefit', () => {
    const c = new TaxCalculator({ name: 'Tax', config: configWithSS() });
    assert.equal(c.taxableSocialSecurity(100000, 0), 0);
});

test('taxableSocialSecurity taxes up to 50% of benefits between the two thresholds', () => {
    const c = new TaxCalculator({ name: 'Tax', config: configWithSS() });
    // provisional = 20000 + 0.5*30000 = 35000, between 32000 and 44000
    assert.equal(c.taxableSocialSecurity(20000, 30000), Math.min(0.5 * 30000, 0.5 * (35000 - 32000)));
});

test('taxableSocialSecurity caps at 85% of benefits far above the high threshold', () => {
    const c = new TaxCalculator({ name: 'Tax', config: configWithSS() });
    // provisional = 60000 + 0.5*30000 = 75000, well above 44000
    assert.equal(c.taxableSocialSecurity(60000, 30000), 0.85 * 30000);
});

test('calculate returns federal, state, total, and magi for ordinary income alone', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const rv = c.calculate({ ordinaryIncome: 50000 });
    assert.equal(rv.federal, 6800);
    assert.equal(rv.state, 2200);
    assert.equal(rv.total, 9000);
    assert.equal(rv.magi, 50000);
});

test('calculate\'s magi includes gains and taxable Social Security, but not the mortgage/standard deduction', () => {
    const c = new TaxCalculator({ name: 'Tax', config: configWithSS() });
    const rv = c.calculate({ ordinaryIncome: 60000, gains: 5000, mortgageInterest: -8000, ssBenefit: 30000 });
    const taxableSS = c.taxableSocialSecurity(60000, 30000);
    assert.equal(rv.magi, 60000 + 5000 + taxableSS);
});

test('calculate adds ltcg into federal and folds gains into the state\'s flat-rate base', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const rv = c.calculate({ ordinaryIncome: 35000, gains: 10000 });
    assert.equal(rv.federal, c.federal(35000) + c.ltcg(35000, 10000));
    assert.equal(rv.state, 45000 * 0.044);
    assert.equal(rv.total, rv.federal + rv.state);
});

test('calculate deducts mortgage interest (negative) from ordinary income (standardDeduction=0, so any itemizing wins)', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const rv = c.calculate({ ordinaryIncome: 50000, mortgageInterest: -8000 });
    const taxableOrdinary = 42000;
    assert.equal(rv.federal, c.federal(taxableOrdinary) + c.ltcg(taxableOrdinary, 0));
    assert.equal(rv.state, taxableOrdinary * 0.044);
});

test('calculate uses the standard deduction instead when mortgage interest is smaller', () => {
    const withStandard = new Config({
        Cash: { balance: 0, withdrawalOrder: [], spendingOrder: [] },
        Tax: {
            balance: -5000,
            federalBrackets: [{ rate: 0.10, upTo: null }],
            ltcgBrackets: [{ rate: 0.15, upTo: null }],
            stateRate: 0.044,
            standardDeduction: 29200,
            initialMagi: 0,
        },
    });
    const c = new TaxCalculator({ name: 'Tax', config: withStandard });
    const rv = c.calculate({ ordinaryIncome: 50000, mortgageInterest: -5000 });
    const taxableOrdinary = 50000 - 29200;
    assert.equal(rv.federal, c.federal(taxableOrdinary));
    assert.equal(rv.state, taxableOrdinary * 0.044);
});

test('calculate never lets taxable ordinary income go negative when the deduction exceeds it', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const rv = c.calculate({ ordinaryIncome: 10000, mortgageInterest: -50000 });
    assert.equal(rv.federal, 0);
    assert.equal(rv.state, 0);
});

test('calculate adds taxable Social Security to the federal base only -- Colorado excludes it entirely', () => {
    const c = new TaxCalculator({ name: 'Tax', config: configWithSS() });
    const rv = c.calculate({ ordinaryIncome: 60000, ssBenefit: 30000 });
    const taxableSS = c.taxableSocialSecurity(60000, 30000);
    assert.equal(rv.federal, c.federal(60000 + taxableSS));
    assert.equal(rv.state, c.state(60000));
});

test('balance starts from the configured opening value, like any account', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.balance, -5000);
});

test('magi is seeded from cfg.initialMagi, with no implicit default -- config must always define it', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    assert.equal(c.magi, 0);

    const seeded = new Config({
        Cash: { balance: 0, withdrawalOrder: [], spendingOrder: [] },
        Tax: {
            balance: -5000,
            federalBrackets: [{ rate: 0.10, upTo: null }],
            ltcgBrackets: [],
            stateRate: 0.044,
            standardDeduction: 0,
            initialMagi: 180000,
        },
    });
    assert.equal(new TaxCalculator({ name: 'Tax', config: seeded }).magi, 180000);
});

test('runYear posts last year\'s liability (the current balance) as owed, then clears the balance to zero', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });

    const rv = c.runYear({ year: 2026, bookkeeper });

    assert.equal(rv, undefined);
    assert.equal(c.owed, 5000);
    assert.equal(c.balance, 0);
    assert.equal(bookkeeper.balanceChange('Tax', 2026), 5000);
});

test('prepareNextYear sets balance to a negative liability from this year\'s posted ordinary income and returns nothing', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });
    bookkeeper.post(new JournalEntry({
        year: 2026,
        category: 'income',
        source: new Posting({ account: 'TradIra', amount: -60000 }),
        dest: new Posting({ account: 'OrdinaryIncome', amount: 60000 }),
    }));

    const rv = c.prepareNextYear({ year: 2026, bookkeeper });

    assert.equal(rv, undefined);
    assert.equal(c.balance, -c.calculate({ ordinaryIncome: 60000, gains: 0 }).total);
    assert.equal(bookkeeper.balanceChange('Tax', 2026), c.balance - (-5000));
    assert.equal(c.magi, 60000);
});

test('prepareNextYear also pulls this year\'s posted LtcgIncome into the liability calc', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });
    bookkeeper.post(new JournalEntry({
        year: 2026,
        category: 'income',
        source: new Posting({ account: 'TradIra', amount: -60000 }),
        dest: new Posting({ account: 'OrdinaryIncome', amount: 60000 }),
    }));
    bookkeeper.post(new JournalEntry({
        year: 2026,
        category: 'ltcg',
        source: new Posting({ account: 'IncomeEarned', amount: -15000 }),
        dest: new Posting({ account: 'LtcgIncome', amount: 15000 }),
    }));

    c.prepareNextYear({ year: 2026, bookkeeper });

    assert.equal(c.balance, -c.calculate({ ordinaryIncome: 60000, gains: 15000 }).total);
});

test('prepareNextYear also pulls this year\'s posted MortgageInterestDeduction (negative, matching postAmount()\'s sign) into the liability calc', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });
    bookkeeper.post(new JournalEntry({
        year: 2026,
        category: 'income',
        source: new Posting({ account: 'TradIra', amount: -60000 }),
        dest: new Posting({ account: 'OrdinaryIncome', amount: 60000 }),
    }));
    bookkeeper.post(new JournalEntry({
        year: 2026,
        category: 'taxCalc',
        source: new Posting({ account: 'TaxCalcInput', amount: 8000 }),
        dest: new Posting({ account: 'MortgageInterestDeduction', amount: -8000 }),
    }));

    c.prepareNextYear({ year: 2026, bookkeeper });

    assert.equal(c.balance, -c.calculate({ ordinaryIncome: 60000, gains: 0, mortgageInterest: -8000 }).total);
    // sanity check the deduction actually reduced the liability
    assert.ok(c.balance > -c.calculate({ ordinaryIncome: 60000, gains: 0 }).total);
});

test('prepareNextYear also pulls this year\'s posted SocialSecurityBenefit into the liability calc', () => {
    const c = new TaxCalculator({ name: 'Tax', config: configWithSS() });
    const bookkeeper = new Bookkeeper({ config: configWithSS(), classes: { Cash } });
    bookkeeper.post(new JournalEntry({
        year: 2026,
        category: 'income',
        source: new Posting({ account: 'TradIra', amount: -60000 }),
        dest: new Posting({ account: 'OrdinaryIncome', amount: 60000 }),
    }));
    bookkeeper.post(new JournalEntry({
        year: 2026,
        category: 'taxCalc',
        source: new Posting({ account: 'TaxCalcInput', amount: -30000 }),
        dest: new Posting({ account: 'SocialSecurityBenefit', amount: 30000 }),
    }));

    c.prepareNextYear({ year: 2026, bookkeeper });

    assert.equal(c.balance, -c.calculate({ ordinaryIncome: 60000, gains: 0, ssBenefit: 30000 }).total);
});

test('prepareNextYear grows federalBrackets/ltcgBrackets/standardDeduction by inflationRate, but not ssProvisionalIncomeThresholds', () => {
    const inflated = new Config({
        Economy: { inflationRate: 0.04, interestRate: 0, sp500Rate: 0 },
        Cash: { balance: 0, withdrawalOrder: [], spendingOrder: [] },
        Tax: {
            balance: 0,
            federalBrackets: [{ rate: 0.10, upTo: 10000 }, { rate: 0.22, upTo: null }],
            ltcgBrackets: [{ rate: 0.15, upTo: 40000 }, { rate: 0.20, upTo: null }],
            stateRate: 0.044,
            standardDeduction: 29200,
            ssProvisionalIncomeThresholds: { low: 32000, high: 44000 },
            initialMagi: 0,
        },
    });
    const c = new TaxCalculator({ name: 'Tax', config: inflated });
    const bookkeeper = new Bookkeeper({ config: inflated, classes: { Cash } });

    c.prepareNextYear({ year: 2026, bookkeeper });

    assert.equal(c.federalBrackets[0].upTo, 10000 * 1.04);
    assert.equal(c.ltcgBrackets[0].upTo, 40000 * 1.04);
    assert.equal(c.standardDeduction, 29200 * 1.04);
    // The rate at each tier is untouched -- only which income lands in
    // which tier moves.
    assert.equal(c.federalBrackets[0].rate, 0.10);
    // Deliberately NOT grown -- these have never been inflation-adjusted
    // in real law (see README.md's Reference data).
    assert.deepEqual(inflated.get('Tax').ssProvisionalIncomeThresholds, { low: 32000, high: 44000 });
});

test('postAmount posts amount from TaxCalcInput to the given cat', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });

    const rv = c.postAmount('OrdinaryIncome', 1000, 2026, bookkeeper);

    assert.equal(rv, undefined);
    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 1000);
    assert.equal(bookkeeper.balanceChange('TaxCalcInput', 2026), -1000);
});

test('postAmount accepts LtcgIncome and SocialSecurityBenefit as well as OrdinaryIncome, all posted positive', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });

    c.postAmount('LtcgIncome', 500, 2026, bookkeeper);
    c.postAmount('SocialSecurityBenefit', 30000, 2026, bookkeeper);

    assert.equal(bookkeeper.balanceChange('LtcgIncome', 2026), 500);
    assert.equal(bookkeeper.balanceChange('SocialSecurityBenefit', 2026), 30000);
});

test('postAmount posts MortgageInterestDeduction negative, even though the caller passes a positive magnitude -- income positive, deductions negative', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });

    c.postAmount('MortgageInterestDeduction', 700, 2026, bookkeeper);

    assert.equal(bookkeeper.balanceChange('MortgageInterestDeduction', 2026), -700);
});

test('postAmount throws on a cat it does not recognize', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });

    assert.throws(() => c.postAmount('RothWithdrawal', 300, 2026, bookkeeper), /cat=RothWithdrawal not recognized/);
});

test('due returns a distinct paid-tax account, not the account\'s own name, and the amount runYear stashed as owed', () => {
    const c = new TaxCalculator({ name: 'Tax', config });
    const bookkeeper = new Bookkeeper({ config, classes: { Cash } });
    c.runYear({ year: 2026, bookkeeper });
    assert.deepEqual(c.due(), { account: 'TaxPaid', amount: 5000 });
});
