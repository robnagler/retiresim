import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConfigData, applyDefaults } from '../../src/biz/buildConfig.js';

test('applyDefaults fills in the Tax entry\'s bracket/threshold fields when absent', () => {
    const data = applyDefaults({
        Simulator: { startYear: 2026, endYear: 2030 },
        Economy: { inflationRate: 0.025, interestRate: 0.03, sp500Rate: 0.06 },
        Cash: { balance: 0, withdrawalOrder: [], spendingOrder: [{ name: 'Tax', class: 'TaxCalculator', balance: 0, initialMagi: 0 }] },
    });

    const tax = data.Cash.spendingOrder.find((e) => e.name === 'Tax');
    assert.equal(tax.federalBrackets.length, 7);
    assert.equal(tax.ltcgBrackets.length, 3);
    assert.equal(tax.standardDeduction, 15750);
    assert.deepEqual(tax.ssProvisionalIncomeThresholds, { low: 32000, high: 44000 });
    assert.equal(tax.stateRate, 0.044);
});

test('applyDefaults does not override a field the caller already set explicitly', () => {
    const customBrackets = [{ rate: 0.5, upTo: null }];
    const data = applyDefaults({
        Simulator: { startYear: 2026, endYear: 2030 },
        Economy: { inflationRate: 0.025, interestRate: 0.03, sp500Rate: 0.06 },
        Cash: {
            balance: 0,
            withdrawalOrder: [],
            spendingOrder: [{ name: 'Tax', class: 'TaxCalculator', balance: 0, initialMagi: 0, federalBrackets: customBrackets, standardDeduction: 1 }],
        },
    });

    const tax = data.Cash.spendingOrder.find((e) => e.name === 'Tax');
    assert.deepEqual(tax.federalBrackets, customBrackets);
    assert.equal(tax.standardDeduction, 1);
    // Fields not explicitly overridden still get defaulted.
    assert.equal(tax.ltcgBrackets.length, 3);
});

test('applyDefaults derives initialMagi from the Salary entry\'s annual amount (monthlyAmount * 12) when absent', () => {
    const data = applyDefaults({
        Simulator: { startYear: 2026, endYear: 2030 },
        Economy: { inflationRate: 0.025, interestRate: 0.03, sp500Rate: 0.06 },
        Cash: {
            balance: 0,
            withdrawalOrder: [],
            incomeOrder: [{ name: 'Salary', balance: 0, monthlyAmount: 10000, endYear: 2030 }],
            spendingOrder: [{ name: 'Tax', class: 'TaxCalculator', balance: 0 }],
        },
    });

    assert.equal(data.Cash.spendingOrder.find((e) => e.name === 'Tax').initialMagi, 120000);
});

test('applyDefaults derives initialMagi as 0 when there is no Salary entry (or no incomeOrder at all)', () => {
    const noIncomeOrder = applyDefaults({
        Simulator: { startYear: 2026, endYear: 2030 },
        Economy: { inflationRate: 0.025, interestRate: 0.03, sp500Rate: 0.06 },
        Cash: { balance: 0, withdrawalOrder: [], spendingOrder: [{ name: 'Tax', class: 'TaxCalculator', balance: 0 }] },
    });
    const emptyIncomeOrder = applyDefaults({
        Simulator: { startYear: 2026, endYear: 2030 },
        Economy: { inflationRate: 0.025, interestRate: 0.03, sp500Rate: 0.06 },
        Cash: { balance: 0, withdrawalOrder: [], incomeOrder: [], spendingOrder: [{ name: 'Tax', class: 'TaxCalculator', balance: 0 }] },
    });

    assert.equal(noIncomeOrder.Cash.spendingOrder.find((e) => e.name === 'Tax').initialMagi, 0);
    assert.equal(emptyIncomeOrder.Cash.spendingOrder.find((e) => e.name === 'Tax').initialMagi, 0);
});

test('applyDefaults does not override initialMagi when the caller already set it explicitly', () => {
    const data = applyDefaults({
        Simulator: { startYear: 2026, endYear: 2030 },
        Economy: { inflationRate: 0.025, interestRate: 0.03, sp500Rate: 0.06 },
        Cash: {
            balance: 0,
            withdrawalOrder: [],
            incomeOrder: [{ name: 'Salary', balance: 0, monthlyAmount: 10000, endYear: 2030 }],
            spendingOrder: [{ name: 'Tax', class: 'TaxCalculator', balance: 0, initialMagi: 5000 }],
        },
    });

    assert.equal(data.Cash.spendingOrder.find((e) => e.name === 'Tax').initialMagi, 5000);
});

test('applyDefaults injects a Tax/TaxCalculator entry when spendingOrder has none, and does not mutate the caller\'s object', () => {
    const original = { Simulator: { startYear: 2026, endYear: 2026 }, Economy: {}, Cash: { balance: 0, withdrawalOrder: [], spendingOrder: [{ name: 'LivingExpense', balance: 1000 }] } };
    const frozenCopy = structuredClone(original);

    const data = applyDefaults(original);

    assert.deepEqual(original, frozenCopy);
    const tax = data.Cash.spendingOrder.find((e) => e.class === 'TaxCalculator');
    assert.equal(tax.name, 'Tax');
    assert.equal(tax.balance, 0);
    assert.equal(tax.federalBrackets.length, 7);
    // The injected entry doesn't replace anything already there.
    assert.ok(data.Cash.spendingOrder.find((e) => e.name === 'LivingExpense'));
});

test('applyDefaults does not inject a second Tax entry when one already exists', () => {
    const data = applyDefaults({
        Simulator: { startYear: 2026, endYear: 2026 },
        Economy: {},
        Cash: { balance: 0, withdrawalOrder: [], spendingOrder: [{ name: 'Tax', class: 'TaxCalculator', balance: 0 }] },
    });

    assert.equal(data.Cash.spendingOrder.filter((e) => e.class === 'TaxCalculator').length, 1);
});

const MINIMAL_INPUT = {
    birthYear: 1960,
    lifeExpectancy: 90,
    retirementYear: 2027,
    monthlySpending: 5000,
    inflation: 0.025,
    interestRate: 0.03,
    investmentReturn: 0.06,
};

test('required structure is always present, even with every optional field blank', () => {
    const data = buildConfigData(MINIMAL_INPUT);

    assert.equal(data.Simulator.startYear, new Date().getFullYear());
    assert.equal(data.Simulator.endYear, 1960 + 90);
    assert.deepEqual(data.Economy, { inflationRate: 0.025, interestRate: 0.03, sp500Rate: 0.06 });
    assert.equal(data.Cash.balance, 0);
    assert.deepEqual(data.Cash.withdrawalOrder, []);
    assert.deepEqual(data.Cash.incomeOrder, []);
    // LivingExpense, Tax, and Medicare are always present regardless of
    // input -- Bookkeeper.js requires a TaxCalculator entry in
    // spendingOrder (injected by applyDefaults() when absent, so its
    // position isn't significant), and Medicare/LivingExpense are core
    // to every plan.
    const spenderNames = data.Cash.spendingOrder.map((e) => e.name).sort();
    assert.deepEqual(spenderNames, ['LivingExpense', 'Medicare', 'Tax']);
    assert.equal(data.Cash.spendingOrder.find((e) => e.name === 'LivingExpense').balance, 5000 * 12);
});

test('optional accounts and income sources are included only when a value is supplied', () => {
    const blank = buildConfigData(MINIMAL_INPUT);
    assert.deepEqual(blank.Cash.withdrawalOrder, []);
    assert.deepEqual(blank.Cash.incomeOrder, []);
    assert.equal(blank.Cash.spendingOrder.find((e) => e.name === 'Mortgage'), undefined);

    const filled = buildConfigData({
        ...MINIMAL_INPUT,
        monthlySalary: 10000,
        socialSecurityAt67: 3000,
        mortgageBalance: 300000,
        mortgageRate: 0.05,
        mortgageEndYear: 2045,
        taxableBalance: 500000,
        traditionalIraBalance: 400000,
        rothIraBalance: 100000,
        inheritedIraBalance: 50000,
        inheritedIraYear: 2015,
        hsaBalance: 40000,
    });
    const withdrawalNames = filled.Cash.withdrawalOrder.map((e) => e.name);
    assert.deepEqual(withdrawalNames, ['TaxableAccount', 'TraditionalIra', 'RothIra', 'NonSpousalInheritedIra', 'HsaAccount']);
    const incomeNames = filled.Cash.incomeOrder.map((e) => e.name);
    assert.deepEqual(incomeNames, ['Salary', 'SocialSecurity']);
    assert.ok(filled.Cash.spendingOrder.find((e) => e.name === 'Mortgage'));
});

test('Mortgage balance is stored negative (a liability), and rate/endYear pass through', () => {
    const data = buildConfigData({ ...MINIMAL_INPUT, mortgageBalance: 300000, mortgageRate: 0.05, mortgageEndYear: 2045 });

    const mortgage = data.Cash.spendingOrder.find((e) => e.name === 'Mortgage');
    assert.equal(mortgage.balance, -300000);
    assert.equal(mortgage.rate, 0.05);
    assert.equal(mortgage.endYear, 2045);
});

test('TaxableAccount defaults basis to the full entered balance -- no unrealized gain assumed', () => {
    const data = buildConfigData({ ...MINIMAL_INPUT, taxableBalance: 500000 });

    const taxable = data.Cash.withdrawalOrder.find((e) => e.name === 'TaxableAccount');
    assert.equal(taxable.balance, 500000);
    assert.equal(taxable.basis, 500000);
});

test('Salary passes through as monthlyAmount, entered and stored in the same units', () => {
    const data = buildConfigData({ ...MINIMAL_INPUT, monthlySalary: 10000, retirementYear: 2030 });

    const salaryEntry = data.Cash.incomeOrder.find((e) => e.name === 'Salary');
    assert.equal(salaryEntry.monthlyAmount, 10000);
    assert.equal(salaryEntry.endYear, 2030);
});

test('LivingExpense is the monthly spending annualized, since its balance is a year\'s worth', () => {
    const data = buildConfigData({ ...MINIMAL_INPUT, monthlySpending: 4000 });

    assert.equal(data.Cash.spendingOrder.find((e) => e.name === 'LivingExpense').balance, 48000);
});

test('a blank monthlySpending is zero rather than NaN, the way every other optional amount behaves', () => {
    const { monthlySpending, ...noSpending } = MINIMAL_INPUT;

    assert.equal(buildConfigData(noSpending).Cash.spendingOrder.find((e) => e.name === 'LivingExpense').balance, 0);
});

test('Social Security claimAge is fixed at 67, and fraMonthlyBenefit passes through unchanged', () => {
    const data = buildConfigData({ ...MINIMAL_INPUT, birthYear: 1962, socialSecurityAt67: 3200 });

    const ss = data.Cash.incomeOrder.find((e) => e.name === 'SocialSecurity');
    assert.equal(ss.claimAge, 67);
    assert.equal(ss.fraMonthlyBenefit, 3200);
    assert.equal(ss.birthYear, 1962);
});

test('HsaAccount.zeroBalanceYear defaults to birthYear + lifeExpectancy', () => {
    const data = buildConfigData({ ...MINIMAL_INPUT, birthYear: 1960, lifeExpectancy: 90, hsaBalance: 40000 });

    const hsa = data.Cash.withdrawalOrder.find((e) => e.name === 'HsaAccount');
    assert.equal(hsa.zeroBalanceYear, 1960 + 90);
    assert.equal(hsa.zeroBalanceYear, data.Simulator.endYear);
});

test('initialMagi is estimated from entered Salary annualized, else 0', () => {
    const withSalary = buildConfigData({ ...MINIMAL_INPUT, monthlySalary: 7500 });
    const withoutSalary = buildConfigData(MINIMAL_INPUT);

    assert.equal(withSalary.Cash.spendingOrder.find((e) => e.name === 'Tax').initialMagi, 90000);
    assert.equal(withoutSalary.Cash.spendingOrder.find((e) => e.name === 'Tax').initialMagi, 0);
});

test('the Medicare entry carries birthYear, which Medicare needs to derive its own age-65 start year', () => {
    const data = buildConfigData({ ...MINIMAL_INPUT, birthYear: 1962 });

    assert.equal(data.Cash.spendingOrder.find((e) => e.name === 'Medicare').birthYear, 1962);
});

test('Medicare Part B/D are always the fixed hardcoded values regardless of input -- only Part G is user-editable', () => {
    const noInput = buildConfigData(MINIMAL_INPUT);
    const withPartG = buildConfigData({ ...MINIMAL_INPUT, medicarePartG: 250 });

    const noInputMedicare = noInput.Cash.spendingOrder.find((e) => e.name === 'Medicare');
    assert.equal(noInputMedicare.partBMonthly, 203);
    assert.equal(noInputMedicare.partDMonthly, 83);
    // Part G defaults to the same value as Part B when left blank.
    assert.equal(noInputMedicare.partGMonthly, 203);

    const withPartGMedicare = withPartG.Cash.spendingOrder.find((e) => e.name === 'Medicare');
    assert.equal(withPartGMedicare.partBMonthly, 203);
    assert.equal(withPartGMedicare.partDMonthly, 83);
    assert.equal(withPartGMedicare.partGMonthly, 250);
});

test('Tax entry always carries the hardcoded real bracket/threshold defaults', () => {
    const data = buildConfigData(MINIMAL_INPUT);

    const tax = data.Cash.spendingOrder.find((e) => e.name === 'Tax');
    assert.equal(tax.class, 'TaxCalculator');
    assert.equal(tax.standardDeduction, 15750);
    assert.equal(tax.stateRate, 0.044);
    assert.deepEqual(tax.ssProvisionalIncomeThresholds, { low: 32000, high: 44000 });
    assert.equal(tax.federalBrackets.length, 7);
    assert.equal(tax.ltcgBrackets.length, 3);
});
