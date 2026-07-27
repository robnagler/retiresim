import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SocialSecurity, claimAgeCandidates } from '../src/SocialSecurity.js';
import { Bookkeeper } from '../src/Bookkeeper.js';
import { Cash } from '../src/Cash.js';
import { TaxCalculator } from '../src/TaxCalculator.js';
import { Config } from '../src/Config.js';

const buildConfig = ({ birthYear, claimAge, fraMonthlyBenefit = 2500 }) => new Config({
    Cash: {
        balance: 0,
        withdrawalOrder: [],
        incomeOrder: [{ name: 'SocialSecurity', balance: 0, rate: 0, birthYear, claimAge, fraMonthlyBenefit }],
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

    assert.equal(ss.monthlyAmount, 4152 * (1 - 0.08 * 5));
});

test('claiming after full retirement age increases the monthly benefit ~8%/year', () => {
    const ss = buildSS({ birthYear: 1959, claimAge: 70, fraMonthlyBenefit: 4152 });

    assert.equal(ss.monthlyAmount, 4152 * (1 + 0.08 * 3));
});

test('claiming exactly at full retirement age applies no adjustment', () => {
    const ss = buildSS({ birthYear: 1959, claimAge: 67, fraMonthlyBenefit: 4152 });

    assert.equal(ss.monthlyAmount, 4152);
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
