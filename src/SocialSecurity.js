import { Account } from './Account.js';

const MONTHS_PER_YEAR = 12;
export const FULL_RETIREMENT_AGE = 67;
export const MIN_CLAIM_AGE = 62;
export const MAX_CLAIM_AGE = 70;
const ADJUSTMENT_PER_YEAR = 0.08;

export class SocialSecurity extends Account {
    constructor({ name, config }) {
        super({ name, config });
        this.checkClaimAge();
        this.startYear = this.cfg.birthYear + this.cfg.claimAge;
        // The nationwide COLA raises everyone's PIA every year, whether or
        // not they've claimed yet -- pia tracks that growth from the very
        // first simulated year (see runYear()). monthlyAmount stays null
        // until the actual claim year, when the claim-age adjustment is
        // applied to whatever pia has grown to by then (see earn()).
        this.pia = this.cfg.fraMonthlyBenefit;
        this.monthlyAmount = null;
    }

    checkClaimAge() {
        const { claimAge } = this.cfg;
        if (!(claimAge >= MIN_CLAIM_AGE && claimAge <= MAX_CLAIM_AGE)) {
            throw new Error(`claimAge=${claimAge} not between ${MIN_CLAIM_AGE} and ${MAX_CLAIM_AGE} ${this}`);
        }
    }

    // Real SS reduces benefits ~6.67%/year for the first three years before
    // FRA and ~5%/year beyond that, and increases them 8%/year after FRA up
    // to age 70 -- this project uses a single ~8%/year rate in both
    // directions, per CLAUDE.md's Optimize Variables (a deliberate
    // simplification, same spirit as the flat IRMAA lag and single filing
    // status elsewhere in this project).
    computeMonthlyAmount(pia) {
        return pia * (1 + ADJUSTMENT_PER_YEAR * (this.cfg.claimAge - FULL_RETIREMENT_AGE));
    }

    // Reports the raw benefit, not OrdinaryIncome -- how much of it is
    // taxable depends on total provisional income for the year, which
    // only TaxCalculator can compute (see TaxCalculator.taxableSocialSecurity()).
    // No benefit before startYear -- same null-before-eligible pattern as
    // TraditionalIra.earn()'s age < startAge check. The claim-age
    // adjustment is applied exactly once, the first year benefits are
    // paid, to whatever pia has grown to by then -- not to the original
    // cfg.fraMonthlyBenefit input.
    earn(year, bookkeeper) {
        if (year < this.startYear) {
            return null;
        }
        if (this.monthlyAmount === null) {
            this.monthlyAmount = this.computeMonthlyAmount(this.pia);
        }
        const amount = this.monthlyAmount * MONTHS_PER_YEAR;
        bookkeeper.taxCalculator?.postAmount('SocialSecurityBenefit', amount, year, bookkeeper);
        return { amount };
    }

    // Runs after earn() each year (Bookkeeper.runYear() calls cash.earn()
    // before the accounts loop), so a given year's payment always uses
    // the prior year's amount and next year's is the one that's grown --
    // overrides Account.runYear() entirely since balance/rate are inert
    // boilerplate for SocialSecurity (see claimAgeCandidates() usage
    // elsewhere), not something worth a no-op growth posting. Before
    // claiming, pia itself is what grows by COLA every year (see
    // constructor); once claimed, monthlyAmount (already claim-age
    // adjusted) takes over, same shape as LivingExpense's rate-based
    // growth, just targeting monthlyAmount instead of balance.
    runYear({ year, bookkeeper }) {
        if (this.monthlyAmount === null) {
            this.pia *= 1 + bookkeeper.economy.colaRate;
        } else if (year >= this.startYear) {
            this.monthlyAmount *= 1 + bookkeeper.economy.colaRate;
        }
    }
}

// Claim ages already passed as of asOfYear aren't real, actionable
// choices -- you can't retroactively claim at an age you've already lived
// through without having claimed. Clamps the low end up to the person's
// current age (birthYear==asOfYear-currentAge) so the optimizer never
// offers a moot candidate; clamps the high end at MAX_CLAIM_AGE so
// someone already past 70 still gets one candidate (claim now).
export function claimAgeCandidates({ birthYear, asOfYear }) {
    const min = Math.min(Math.max(MIN_CLAIM_AGE, asOfYear - birthYear), MAX_CLAIM_AGE);
    return Array.from({ length: MAX_CLAIM_AGE - min + 1 }, (_, i) => min + i);
}
