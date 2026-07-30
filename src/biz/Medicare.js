import { Account } from './Account.js';

const MONTHS_PER_YEAR = 12;
// Medicare's normal eligibility age -- a fact of law, not a per-user
// assumption, so it's a constant here rather than a cfg input (same spirit
// as IRMAA_BRACKETS below). Real Medicare is also reachable before 65 via
// disability/ALS/ESRD, which this project doesn't model.
const ELIGIBILITY_AGE = 65;

// Illustrative single-filer IRMAA tiers (rounded), as of 2026 -- the base
// every Medicare instance grows its own upTo thresholds from every year
// (see runYear()). Surcharge dollar amounts stay fixed as configured; real
// thresholds/surcharges are published annually by CMS and differ by filing
// status (single/MFJ/MFS each have their own table), which this project
// doesn't model, the same simplification already used for tax brackets/
// ssProvisionalIncomeThresholds.
const IRMAA_BRACKETS = [
    { upTo: 106000, partB: 0, partD: 0 },
    { upTo: 133000, partB: 900, partD: 170 },
    { upTo: 167000, partB: 2250, partD: 430 },
    { upTo: 200000, partB: 3600, partD: 690 },
    { upTo: 500000, partB: 4950, partD: 950 },
    { upTo: null, partB: 5400, partD: 1050 },
];

export class Medicare extends Account {
    constructor({ name, config }) {
        super({ name, config });
        // Part B/D/Medigap Plan G premiums are never needed individually --
        // they inflate at the same rate and only ever get summed into one
        // owed amount -- so they're tracked as a single combined yearly
        // premium, not three parallel variables. The raw cfg.partBMonthly
        // etc values (billed monthly: Part B to CMS, Part D/Medigap Plan G
        // to private insurers) are only ever needed once, right here, to
        // seed this.
        this.yearly = (this.cfg.partBMonthly + this.cfg.partDMonthly + this.cfg.partGMonthly) * MONTHS_PER_YEAR;
        // Derived from birthYear, same shape as SocialSecurity's startYear
        // (birthYear + claimAge) -- nothing owed before it, see runYear().
        // Checked rather than assumed: a missing birthYear would make
        // startYear NaN, and every `year < NaN` comparison is false, so the
        // gate would silently vanish and premiums would be charged from the
        // simulation's first year -- exactly the bug this replaced.
        if (!(this.cfg.birthYear > 0)) {
            throw new Error(`birthYear=${this.cfg.birthYear} not a year ${this}`);
        }
        this.startYear = this.cfg.birthYear + ELIGIBILITY_AGE;
        // A per-instance copy of the thresholds, grown every year in
        // runYear() -- IRMAA_BRACKETS itself stays the fixed 2026 base.
        // Only the upTo boundaries move; the surcharge dollar amounts
        // (partB/partD) stay as configured.
        this.irmaaBrackets = IRMAA_BRACKETS.map((b) => ({ ...b }));
    }

    // IRMAA is a cliff, not a marginal bracket like federal/state/ltcg --
    // crossing a threshold jumps the ENTIRE premium to the next tier's
    // surcharge, it doesn't stack incrementally. irmaaBrackets always ends
    // with upTo:null, so this always matches.
    irmaaSurcharge(magi) {
        return this.irmaaBrackets.find((b) => b.upTo === null || magi <= b.upTo);
    }

    // The combined premium inflates every year like LivingExpense's
    // balance, at the same shared Economy.inflationRate (not an
    // independently-configured rate). The IRMAA thresholds themselves also
    // grow at inflationRate -- real CMS thresholds were frozen 2009-2019
    // but have been indexed to inflation since 2020 (see README.md's
    // Reference data), so a fixed-forever threshold increasingly overstates
    // how often real IRMAA cliffs would be crossed decades into the
    // simulation. The surcharge dollar amounts themselves don't grow --
    // only which tier a given magi lands in. bookkeeper.taxCalculator.magi
    // is already last year's value by the time this runs
    // (TaxCalculator.prepareNextYear updates it later in the same annual
    // cycle, via Cash.runYear), so this naturally gets the same 1-year lag
    // as the tax-payment lag. The IRMAA surcharge is only ever Part B/D --
    // Medigap Plan G isn't income-adjusted -- but since the three premiums
    // are combined, that distinction only matters for the surcharge table
    // itself (irmaaBrackets), not for what's growing here.
    runYear({ year, bookkeeper }) {
        // rate is a growth factor (1 + inflationRate), not the raw rate --
        // applied directly wherever something compounds, instead of
        // writing "1 + rate" at every use.
        const rate = 1 + bookkeeper.economy.inflationRate;
        this.yearly *= rate;
        this.irmaaBrackets = this.irmaaBrackets.map((b) => (b.upTo === null ? b : { ...b, upTo: b.upTo * rate }));
        // Nothing owed before 65 -- same nothing-before-eligible shape as
        // SocialSecurity.earn()'s year < startYear gate, and like
        // Mortgage.runYear() past endYear this reports a zero amount rather
        // than no amount (Cash.runYear() already skips a zero due()).
        // Deliberately gated *after* the growth above, not before it: the
        // premium and thresholds a 60-year-old will face at 65 are the
        // inflated ones, so they have to keep compounding through the
        // ineligible years even though nothing is paid in them. Pre-65
        // health insurance isn't modeled separately -- it's assumed to be
        // part of LivingExpense's yearly spending.
        if (year < this.startYear) {
            this.owed = 0;
            return;
        }
        const surcharge = this.irmaaSurcharge(bookkeeper.taxCalculator.magi);
        this.owed = this.yearly + surcharge.partB + surcharge.partD;
    }

    due() {
        return { account: 'MedicarePremium', amount: this.owed };
    }
}
