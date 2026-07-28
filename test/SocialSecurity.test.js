import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SocialSecurity, claimAgeCandidates } from '../src/SocialSecurity.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Cash } from '../src/Cash.js';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { Config } from '../src/Config.js';

const buildConfig = ({ birthYear, claimAge, fraMonthlyBenefit = 2500, cola = 0 }) => new Config({
    // colaRate isn't configured separately -- it's derived from
    // inflationRate (see Economy.js), so this is how these tests control it.
    Economy: { inflationRate: cola, interestRate: 0, sp500Rate: 0 },
    Cash: {
        balance: 0,
        withdrawalOrder: [],
        incomeOrder: [{ name: 'SocialSecurity', balance: 0, birthYear, claimAge, fraMonthlyBenefit }],
        spendingOrder: [{
            name: 'Tax',
            class: 'TaxCalculator',
            balance: 0,
            federalBrackets: [{ rate: 0.10, upTo: null }],
            ltcgBrackets: [{ rate: 0.15, upTo: null }],
            stateRate: 0.044,
            standardDeduction: 0,
            initialMagi: 0,
            ssProvisionalIncomeThresholds: { low: 32000, high: 44000 },
        }],
    },
});

// Bookkeeper.build() populates config's per-name lookup via config.set()
// before constructing each account -- direct unit tests of SocialSecurity
// (below, for the claim-age formula) need to do the same themselves since
// they bypass Bookkeeper.
const buildSS = (params) => {
    const config = buildConfig(params);
    config.set('SocialSecurity', config.get('Cash').incomeOrder[0]);
    return new SocialSecurity({ name: 'SocialSecurity', config });
};

test('earn posts the full benefit to SocialSecurityBenefit, not OrdinaryIncome, but the full amount still lands in Cash', () => {
    const bookkeeper = new Bookkeeper({ config: buildConfig({ birthYear: 1959, claimAge: 67 }), classes: { SocialSecurity, TaxCalculator, Cash } });

    bookkeeper.runYear(2026);

    assert.equal(bookkeeper.balanceChange('OrdinaryIncome', 2026), 0);
    assert.equal(bookkeeper.balanceChange('SocialSecurityBenefit', 2026), 30000);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 30000);
});

test('earn returns null and posts nothing before startYear (birthYear+claimAge)', () => {
    const bookkeeper = new Bookkeeper({ config: buildConfig({ birthYear: 1963, claimAge: 67 }), classes: { SocialSecurity, TaxCalculator, Cash } });

    bookkeeper.runYear(2026);

    assert.equal(bookkeeper.balanceChange('SocialSecurityBenefit', 2026), 0);
    assert.equal(bookkeeper.balanceChange('Cash', 2026), 0);
});

test('earn posts the benefit starting the exact startYear', () => {
    const bookkeeper = new Bookkeeper({ config: buildConfig({ birthYear: 1963, claimAge: 67 }), classes: { SocialSecurity, TaxCalculator, Cash } });

    bookkeeper.runYear(2030);

    assert.equal(bookkeeper.balanceChange('SocialSecurityBenefit', 2030), 30000);
    assert.equal(bookkeeper.balanceChange('Cash', 2030), 30000);
});

test('claiming before full retirement age reduces the monthly benefit ~8%/year', () => {
    const ss = buildSS({ birthYear: 1959, claimAge: 62, fraMonthlyBenefit: 4152 });

    // monthlyAmount isn't computed until the claim year (see earn()) --
    // pia is still the raw fraMonthlyBenefit input right after construction.
    assert.equal(ss.computeMonthlyAmount(ss.pia), 4152 * (1 - 0.08 * 5));
});

test('claiming after full retirement age increases the monthly benefit ~8%/year', () => {
    const ss = buildSS({ birthYear: 1959, claimAge: 70, fraMonthlyBenefit: 4152 });

    assert.equal(ss.computeMonthlyAmount(ss.pia), 4152 * (1 + 0.08 * 3));
});

test('claiming exactly at full retirement age applies no adjustment', () => {
    const ss = buildSS({ birthYear: 1959, claimAge: 67, fraMonthlyBenefit: 4152 });

    assert.equal(ss.computeMonthlyAmount(ss.pia), 4152);
});

test('claimAge outside 62-70 throws', () => {
    assert.throws(() => buildSS({ birthYear: 1959, claimAge: 61 }));
    assert.throws(() => buildSS({ birthYear: 1959, claimAge: 71 }));
});

test('claimAgeCandidates offers the full 62-70 range when still younger than 62', () => {
    assert.deepEqual(claimAgeCandidates({ birthYear: 2000, asOfYear: 2026 }), [62, 63, 64, 65, 66, 67, 68, 69, 70]);
});

test('claimAgeCandidates excludes already-passed ages -- someone already 65 cannot still choose to claim at 62-64', () => {
    assert.deepEqual(claimAgeCandidates({ birthYear: 1961, asOfYear: 2026 }), [65, 66, 67, 68, 69, 70]);
});

test('claimAgeCandidates clamps to a single candidate (claim now) once already past 70', () => {
    assert.deepEqual(claimAgeCandidates({ birthYear: 1950, asOfYear: 2026 }), [70]);
});

test('runYear applies cola to monthlyAmount every year benefits are being paid, compounding forward', () => {
    const bookkeeper = new Bookkeeper({
        config: buildConfig({ birthYear: 1959, claimAge: 67, fraMonthlyBenefit: 4000, cola: 0.02 }),
        classes: { SocialSecurity, TaxCalculator, Cash },
    });

    bookkeeper.runYear(2026);
    assert.equal(bookkeeper.balanceChange('SocialSecurityBenefit', 2026), 4000 * 12);

    bookkeeper.runYear(2027);
    assert.equal(bookkeeper.balanceChange('SocialSecurityBenefit', 2027), 4000 * 1.02 * 12);

    bookkeeper.runYear(2028);
    assert.equal(bookkeeper.balanceChange('SocialSecurityBenefit', 2028), 4000 * 1.02 * 1.02 * 12);
});

test('runYear grows pia by cola every year before claiming -- monthlyAmount stays uncomputed until the claim year', () => {
    const bookkeeper = new Bookkeeper({
        config: buildConfig({ birthYear: 1963, claimAge: 67, fraMonthlyBenefit: 4000, cola: 0.02 }),
        classes: { SocialSecurity, TaxCalculator, Cash },
    });
    const ss = bookkeeper.accounts.find((a) => a.name === 'SocialSecurity');

    bookkeeper.runYear(2026);
    bookkeeper.runYear(2027);

    assert.equal(ss.monthlyAmount, null);
    assert.equal(ss.pia, 4000 * 1.02 * 1.02);
});

// The nationwide COLA raises everyone's PIA every year, whether or not
// they've claimed yet -- so by the claim year, the claim-age adjustment
// applies to a PIA that's already grown from the original
// fraMonthlyBenefit input, not to that raw input itself.
test('the claim-age adjustment applies to the cola-grown pia at the claim year, not the original fraMonthlyBenefit', () => {
    const bookkeeper = new Bookkeeper({
        config: buildConfig({ birthYear: 1959, claimAge: 69, fraMonthlyBenefit: 4000, cola: 0.02 }),
        classes: { SocialSecurity, TaxCalculator, Cash },
    });

    bookkeeper.runYear(2026);
    bookkeeper.runYear(2027);
    bookkeeper.runYear(2028); // startYear = 1959 + 69 = 2028

    const grownPia = 4000 * 1.02 * 1.02;
    const expectedMonthly = grownPia * (1 + 0.08 * 2); // claimAge 69 is 2 years past FRA 67
    assert.ok(Math.abs(bookkeeper.balanceChange('SocialSecurityBenefit', 2028) - expectedMonthly * 12) < 0.01);
});
