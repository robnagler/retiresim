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

// 2025 single-filer long-term capital gains brackets. These were rounded
// to 49,000/545,000 while the ordinary brackets above were exact, which
// mattered more than a 1% error normally would: the optimizer's ceiling
// candidates ARE these boundaries, so a boundary that is too high means a
// strategy chosen to stay inside the 0% band overshoots it by exactly the
// rounding.
//
// These are thresholds on total taxable income, not on gains alone -- see
// Cash.categoryRoom(), which has to stack gains on ordinary income to work
// out how much of a band is really left.
const LTCG_BRACKETS = [
    { rate: 0.00, upTo: 48350 },
    { rate: 0.15, upTo: 533400 },
    { rate: 0.20, upTo: null },
];

// Real 2025 single-filer standard deduction. config/cfg.json/main.js's
// DEFAULT_CONFIG_DATA previously carried a known-stale $29,200 MFJ-shaped
// placeholder (see CLAUDE.md) -- this default uses the correct figure
// instead of propagating that staleness.
const STANDARD_DEDUCTION = 15750;

const MONTHS_PER_YEAR = 12;

// Bumped whenever the input shape below changes incompatibly, and written
// into every exported file. Lives here rather than in the browser because
// the CLI reads the same files: one program, one format, one version.
// Import refuses a file it does not recognise rather than filling in from
// fields that may no longer mean what they did -- the failure the rename
// to monthly amounts escaped only because the old keys happened not to
// match the new ones.
export const INPUT_VERSION = 1;

// Social Security taxability thresholds -- never inflation-indexed in
// real law since enacted in the 1980s/90s, so these stay fixed (see
// CLAUDE.md's TaxCalculator.js note).
const SS_PROVISIONAL_INCOME_THRESHOLDS = { low: 32000, high: 44000 };

// Colorado excludes Social Security benefits from state tax for 65+ and
// has no preferential LTCG rate -- same flat rate already used in
// config/cfg.json.
const COLORADO_STATE_RATE = 0.044;

// Medicare Part B and Part D are treated as fixed, not user-chosen,
// premiums -- CLAUDE.md's UI spec exposes only a Medigap Plan G field
// ("default to same value as Part B"), no Part B field at all. Real values
// the user already confirmed and entered into config/cfg.json. The
// medicarePartG/partGMonthly key names predate noticing that "Medicare
// Part G" is not a real thing (Plan G is a Medigap supplement); the form
// label says Medigap now, while the keys wait for the export-format
// versioning work before being renamed.
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
    tax.initialMagi ??= salary ? salary.monthlyAmount * MONTHS_PER_YEAR : 0;
    return data;
}

function currentYear() {
    return new Date().getFullYear();
}

// The per-type fields each account needs beyond name and balance. Mortgage
// is absent because it is a spender, handled separately below.
const ACCOUNT_FIELDS = {
    // Basis left blank means "I paid the whole balance", so nothing is
    // taxed until the account grows past the entered figure. That is the
    // simple answer rather than the accurate one -- a real account almost
    // always holds gain already, and pretending otherwise under-taxes
    // whatever is spent early, when the whole of that gain is invisible to
    // the model. The field exists so someone who knows their basis can say
    // so; the default is what the form assumed before it existed.
    TaxableAccount: (account) => ({ basis: account.basis ?? account.balance }),
    TraditionalIra: (account, { birthYear }) => ({ birthYear }),
    RothIra: () => ({ withdraw: 0 }),
    NonSpousalInheritedIra: (account, { birthYear }) => ({ birthYear, inheritedYear: account.inheritedYear }),
    // Spend the HSA down over life by default, matching CLAUDE.md's
    // "medical expenses over life" framing -- the same horizon as the
    // simulation itself. An earlier year is a real plan choice rather than
    // a detail: it draws the money out faster, which suits someone
    // expecting the medical costs sooner than the end of the horizon.
    HsaAccount: (account, { endYear }) => ({ zeroBalanceYear: account.zeroBalanceYear ?? endYear }),
};

function accountName(account) {
    return account.name ?? account.type;
}

// Bookkeeper keys its accounts by name, so two accounts sharing one would
// have the second silently shadow the first -- a wrong simulation rather
// than an error. The form numbers duplicates as it creates them; this is
// the check that a hand-edited import cannot get past.
function checkAccountNames(accounts) {
    const seen = new Set();
    for (const account of accounts) {
        const name = accountName(account);
        if (seen.has(name)) {
            throw new Error(`name=${name} used by more than one account`);
        }
        seen.add(name);
    }
}

// Amounts that are flows rather than balances arrive monthly, which is how
// a salary, a benefit and a premium are all quoted in real life. The keys
// say so (monthlySalary, monthlySpending) rather than leaving it to a form
// label, since the whole failure this prevents is a figure entered under
// the wrong convention: an annual number read as monthly is wrong by
// twelve with nothing to flag it. Renaming rather than reinterpreting also
// means a file exported before this change leaves the field blank on
// import, which is visible, instead of silently meaning twelve times as
// much. socialSecurityAt67 and medicarePartG were already monthly and keep
// their names for now -- see the note on MEDICARE_PART_B_MONTHLY above.
export function buildConfigData(input) {
    const {
        birthYear,
        monthlySalary,
        socialSecurityAt67,
        medicarePartG,
        accounts = [],
        lumpSums = [],
        lifeExpectancy,
        retirementYear,
        monthlySpending,
        inflation,
        interestRate,
        investmentReturn,
    } = input;
    const endYear = birthYear + lifeExpectancy;
    checkAccountNames(accounts);

    // Every entry carries an explicit class rather than relying on
    // Bookkeeper's name-prefix fallback, so a name is free text the user
    // chose ("Vanguard brokerage") rather than something that has to start
    // with a class name and avoid a dash.
    const withdrawalOrder = [];
    const spendingOrder = [];
    for (const account of accounts) {
        if (!account.balance) {
            continue;
        }
        const entry = { class: account.type, name: accountName(account), balance: account.balance };
        if (account.type === 'Mortgage') {
            // A liability, stored negative, and a spender rather than a
            // source to withdraw from -- but still a box in the form, since
            // "a balance you open to edit" is what that means to a user.
            //
            // sellYear is omitted rather than passed as undefined when it
            // is blank: Mortgage.js reads cfg.sellYear, and a key that is
            // present but undefined is the sort of thing a later `in` or
            // Object.keys() check reads as "they chose to sell".
            const mortgage = { ...entry, balance: -account.balance, rate: account.rate, endYear: account.endYear };
            if (account.sellYear) {
                mortgage.sellYear = account.sellYear;
            }
            spendingOrder.push(mortgage);
            continue;
        }
        withdrawalOrder.push({ ...entry, ...ACCOUNT_FIELDS[account.type](account, { birthYear, endYear }) });
    }

    const incomeOrder = [];
    if (monthlySalary) {
        // Passes straight through: Salary.js's cfg has always wanted a
        // monthly amount, and the form is now entered that way too.
        incomeOrder.push({ name: 'Salary', balance: 0, monthlyAmount: monthlySalary, endYear: retirementYear });
    }
    if (socialSecurityAt67) {
        // "Social Security at 67" is explicitly the benefit at full
        // retirement age -- claimAge is fixed at 67 (a UI simplification,
        // not a behavior change: SocialSecurity.js's claim-age adjustment
        // is a no-op at claimAge=67), so fraMonthlyBenefit passes through
        // unchanged as the monthly amount paid starting at 67.
        incomeOrder.push({ name: 'SocialSecurity', balance: 0, birthYear, claimAge: 67, fraMonthlyBenefit: socialSecurityAt67 });
    }

    // One LumpSum entry holds every one-time expense, since its cfg is
    // already a year -> amount map; the form collects them as a list of
    // {year, amount} rows because that is what a repeatable form row is.
    // Two rows on the same year add together rather than one replacing the
    // other, which is what entering two separate expenses in one year
    // means.
    const amounts = {};
    for (const { year, amount } of lumpSums) {
        if (year && amount) {
            amounts[year] = (amounts[year] ?? 0) + amount;
        }
    }
    if (Object.keys(amounts).length) {
        spendingOrder.push({ name: 'LumpSum', balance: 0, amounts });
    }
    // LivingExpense.balance is the year's spending, so the monthly figure
    // is annualized here -- the one place the conversion still happens,
    // rather than in the form the way the annual salary field used to.
    spendingOrder.push({ name: 'LivingExpense', balance: (monthlySpending ?? 0) * MONTHS_PER_YEAR });
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
