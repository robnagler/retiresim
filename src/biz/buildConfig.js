// Two related responsibilities, kept in one file since they share the
// same hardcoded real-world constants:
//
// - applyDefaults(configData): a preprocessing pass any raw cfg data goes
//   through (config/cfg.json, main.js's DEFAULT_CONFIG_DATA, or the UI's
//   buildConfigData() output below) before Config/Bookkeeper ever see it.
//   Fills in fields that are facts, not per-user assumptions, the same
//   precedent already established for Medicare.js's IRMAA_BRACKETS and
//   HistoricalReturns.js's return/inflation tables -- real published
//   constants belong in code, not typed into every config file by hand.
//   Only fills a field when it's genuinely absent, so an explicit
//   config/cfg.json override still wins.
// - buildConfigData(input): maps the simplified Facts/Predictions form
//   (CLAUDE.md's ## UI section) into a full Simulator/Cash/Economy cfg
//   object, the same shape config/cfg.json uses, then runs it through
//   applyDefaults() for the fields the form doesn't expose at all. Pure
//   function -- no DOM access, no parsing of raw form-input strings
//   (that's src/ui/app.js's job) -- so it's directly unit-testable under
//   node --test like every other module in this project.

// 2025 single-filer federal ordinary-income brackets -- same figures
// already verified in config/cfg.json/main.js's DEFAULT_CONFIG_DATA.
const FEDERAL_BRACKETS = [
    { rate: 0.10, upTo: 11925 },
    { rate: 0.12, upTo: 48475 },
    { rate: 0.22, upTo: 103350 },
    { rate: 0.24, upTo: 197300 },
    { rate: 0.32, upTo: 250525 },
    { rate: 0.35, upTo: 626350 },
    { rate: 0.37, upTo: null },
];

// 2025 single-filer long-term capital gains brackets -- same figures
// already verified in config/cfg.json/main.js's DEFAULT_CONFIG_DATA.
const LTCG_BRACKETS = [
    { rate: 0.00, upTo: 49000 },
    { rate: 0.15, upTo: 545000 },
    { rate: 0.20, upTo: null },
];

// Real 2025 single-filer standard deduction. config/cfg.json/main.js's
// DEFAULT_CONFIG_DATA previously carried a known-stale $29,200 MFJ-shaped
// placeholder (see CLAUDE.md) -- this default uses the correct figure
// instead of propagating that staleness.
const STANDARD_DEDUCTION = 15750;

// Social Security taxability thresholds -- never inflation-indexed in
// real law since enacted in the 1980s/90s, so these stay fixed (see
// CLAUDE.md's TaxCalculator.js note).
const SS_PROVISIONAL_INCOME_THRESHOLDS = { low: 32000, high: 44000 };

// Colorado excludes Social Security benefits from state tax for 65+ and
// has no preferential LTCG rate -- same flat rate already used in
// config/cfg.json.
const COLORADO_STATE_RATE = 0.044;

// Medicare Part B and Part D are treated as fixed, not user-chosen,
// premiums -- CLAUDE.md's UI spec itself only exposes a "Medicare Part G"
// field ("default to same value as PartB"), no Part B field at all. Real
// values the user already confirmed and entered into config/cfg.json.
const MEDICARE_PART_B_MONTHLY = 203;
const MEDICARE_PART_D_MONTHLY = 83;

// Injects a Tax/TaxCalculator entry into spendingOrder when the caller's
// config data doesn't already have one -- Bookkeeper.js requires exactly
// one (this.taxCalculator = this.accounts.find(a => a instanceof
// TaxCalculator)), and the entry itself is pure boilerplate ({name: 'Tax',
// class: 'TaxCalculator', balance: 0}) identical across every config, so
// there's no reason to make every config/cfg.json/DEFAULT_CONFIG_DATA
// spell it out by hand. Then fills in that entry's bracket/threshold
// fields when absent -- these are facts, not per-user config. Also
// derives initialMagi from the Salary entry's annual amount
// (monthlyAmount * 12) when absent -- a per-user value, not a published
// constant, but still a sensible default rather than an arbitrary
// placeholder number. Operates on a clone; never mutates the caller's
// object.
export function applyDefaults(configData) {
    const data = structuredClone(configData);
    let tax = data.Cash.spendingOrder.find((e) => e.class === 'TaxCalculator');
    if (!tax) {
        tax = { name: 'Tax', class: 'TaxCalculator', balance: 0 };
        data.Cash.spendingOrder.push(tax);
    }
    tax.federalBrackets ??= FEDERAL_BRACKETS;
    tax.ltcgBrackets ??= LTCG_BRACKETS;
    tax.standardDeduction ??= STANDARD_DEDUCTION;
    tax.ssProvisionalIncomeThresholds ??= SS_PROVISIONAL_INCOME_THRESHOLDS;
    tax.stateRate ??= COLORADO_STATE_RATE;
    const salary = (data.Cash.incomeOrder ?? []).find((e) => e.name === 'Salary');
    tax.initialMagi ??= salary ? salary.monthlyAmount * 12 : 0;
    return data;
}

function currentYear() {
    return new Date().getFullYear();
}

export function buildConfigData(input) {
    const {
        birthYear,
        salary,
        socialSecurityAt67,
        medicarePartG,
        mortgageBalance,
        mortgageRate,
        mortgageEndYear,
        taxableBalance,
        traditionalIraBalance,
        rothIraBalance,
        inheritedIraBalance,
        inheritedIraYear,
        hsaBalance,
        lifeExpectancy,
        retirementYear,
        yearlySpending,
        inflation,
        interestRate,
        investmentReturn,
    } = input;
    const endYear = birthYear + lifeExpectancy;

    const withdrawalOrder = [];
    if (taxableBalance) {
        // The form doesn't collect basis separately -- assuming the whole
        // entered balance is basis (no unrealized gain yet) is the
        // conservative, simple default: early withdrawals realize no gain
        // until the account grows past this starting value.
        withdrawalOrder.push({ name: 'TaxableAccount', balance: taxableBalance, basis: taxableBalance });
    }
    if (traditionalIraBalance) {
        withdrawalOrder.push({ name: 'TraditionalIra', balance: traditionalIraBalance, birthYear });
    }
    if (rothIraBalance) {
        withdrawalOrder.push({ name: 'RothIra', balance: rothIraBalance, withdraw: 0 });
    }
    if (inheritedIraBalance) {
        withdrawalOrder.push({ name: 'NonSpousalInheritedIra', balance: inheritedIraBalance, birthYear, inheritedYear: inheritedIraYear });
    }
    if (hsaBalance) {
        // Spend HSA down over life, matching CLAUDE.md's "medical expenses
        // over life" framing -- same horizon as the simulation itself.
        withdrawalOrder.push({ name: 'HsaAccount', balance: hsaBalance, zeroBalanceYear: endYear });
    }

    const incomeOrder = [];
    if (salary) {
        // "Salary" is entered as an annual figure; Salary.js's cfg wants
        // a monthly amount.
        incomeOrder.push({ name: 'Salary', balance: 0, monthlyAmount: salary / 12, endYear: retirementYear });
    }
    if (socialSecurityAt67) {
        // "Social Security at 67" is explicitly the benefit at full
        // retirement age -- claimAge is fixed at 67 (a UI simplification,
        // not a behavior change: SocialSecurity.js's claim-age adjustment
        // is a no-op at claimAge=67), so fraMonthlyBenefit passes through
        // unchanged as the monthly amount paid starting at 67.
        incomeOrder.push({ name: 'SocialSecurity', balance: 0, birthYear, claimAge: 67, fraMonthlyBenefit: socialSecurityAt67 });
    }

    const spendingOrder = [];
    if (mortgageBalance) {
        // Mortgage.balance is a liability, stored negative.
        spendingOrder.push({ name: 'Mortgage', balance: -mortgageBalance, rate: mortgageRate, endYear: mortgageEndYear });
    }
    spendingOrder.push({ name: 'LivingExpense', balance: yearlySpending ?? 0 });
    // The Tax/TaxCalculator entry itself is deliberately absent here --
    // applyDefaults() (below) injects it and fills in its bracket/
    // threshold/initialMagi fields.
    spendingOrder.push({
        name: 'Medicare',
        balance: 0,
        // Medicare derives its own age-65 start year from this, so a
        // simulation beginning before 65 pays nothing until then.
        birthYear,
        partBMonthly: MEDICARE_PART_B_MONTHLY,
        partDMonthly: MEDICARE_PART_D_MONTHLY,
        partGMonthly: medicarePartG ?? MEDICARE_PART_B_MONTHLY,
    });

    return applyDefaults({
        Simulator: { startYear: currentYear(), endYear },
        Economy: { inflationRate: inflation, interestRate, sp500Rate: investmentReturn },
        Cash: { balance: 0, withdrawalOrder, incomeOrder, spendingOrder },
    });
}
