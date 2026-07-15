import { Account } from './Account.js';

export class TaxCalculator extends Account {
    constructor({ name, config }) {
        super({ name, config });
        // Seeds the very first simulated year, before any year's MAGI has
        // been computed in-model -- mirrors how `balance` seeds the first
        // year's already-accrued tax liability.
        this.priorYearMagi = this.cfg.priorYearMagi ?? 0;
    }

    federal(income) {
        return this._bracketTax(this.cfg.federalBrackets, 0, income);
    }

    state(income) {
        return income * this.cfg.stateRate;
    }

    // Gains stack on top of ordinary income: the floor is ordinaryIncome, so
    // gains are taxed at the rate for the bracket(s) they fall into above it,
    // not from zero.
    ltcg(ordinaryIncome, gains) {
        return this._bracketTax(this.cfg.ltcgBrackets, ordinaryIncome, ordinaryIncome + gains);
    }

    _bracketTax(brackets, floor, ceiling) {
        let rv = 0;
        let p = floor;
        for (const c of brackets) {
            const u = c.upTo === null ? ceiling : Math.min(ceiling, c.upTo);
            if (u <= p) {
                if (u >= ceiling) {
                    break;
                }
                continue;
            }
            rv += (u - p) * c.rate;
            p = u;
        }
        return rv;
    }

    // IRS provisional-income worksheet (simplified: ignores tax-exempt
    // interest, which this project doesn't model). otherOrdinaryIncome
    // excludes the SS benefit itself -- it's added back at 50% to form
    // provisional income. Up to 50% of benefits are taxable between the
    // two thresholds, up to 85% above the upper one.
    taxableSocialSecurity(otherOrdinaryIncome, ssBenefit) {
        if (ssBenefit <= 0) {
            return 0;
        }
        const { low, high } = this.cfg.ssProvisionalIncomeThresholds;
        const provisional = otherOrdinaryIncome + 0.5 * ssBenefit;
        if (provisional <= low) {
            return 0;
        }
        const tier1 = Math.min(0.5 * ssBenefit, 0.5 * (provisional - low));
        if (provisional <= high) {
            return tier1;
        }
        const tier1AtHigh = Math.min(0.5 * ssBenefit, 0.5 * (high - low));
        return Math.min(0.85 * ssBenefit, 0.85 * (provisional - high) + tier1AtHigh);
    }

    // Only itemize (deduct mortgage interest) if it beats the standard
    // deduction -- matches how a real return chooses between the two.
    // Colorado has no preferential capital-gains rate, so gains join
    // ordinary income in the flat state base; federal keeps them separate
    // via ltcg()'s stacking. Colorado excludes Social Security benefits
    // from state tax entirely (current CO law for taxpayers 65+, the
    // common case here) -- so taxable SS only widens the federal base,
    // never the state one. Both bases are net of the deduction, floored
    // at 0, since CO starts from federal taxable income.
    calculate({ ordinaryIncome, gains = 0, mortgageInterest = 0, ssBenefit = 0 }) {
        const taxableSS = this.taxableSocialSecurity(ordinaryIncome, ssBenefit);
        const deduction = Math.max(mortgageInterest, this.cfg.standardDeduction ?? 0);
        const taxableFederalOrdinary = Math.max(0, ordinaryIncome + taxableSS - deduction);
        const taxableStateOrdinary = Math.max(0, ordinaryIncome - deduction);
        const rv = {
            federal: this.federal(taxableFederalOrdinary) + this.ltcg(taxableFederalOrdinary, gains),
            state: this.state(taxableStateOrdinary + gains),
            // MAGI approximation for IRMAA: total income before the
            // standard/itemized deduction (which applies after AGI), no
            // above-the-line adjustments modeled.
            magi: ordinaryIncome + gains + taxableSS,
        };
        rv.total = rv.federal + rv.state;
        return rv;
    }

    // Called via Bookkeeper.postTaxCalc(): records amount under cat so
    // prepareNextYear() picks it up later via balanceChange(). Only these
    // categories are recognized today -- anything else is a caller bug,
    // not a silent no-effect case (RothIra/HsaAccount simply never call
    // postTaxCalc() at all).
    postTaxCalc(cat, amount, year, bookkeeper) {
        if (cat !== 'OrdinaryIncome' && cat !== 'LtcgIncome' && cat !== 'MortgageInterestDeduction' && cat !== 'SocialSecurityBenefit') {
            throw new Error(`cat=${cat} not recognized ${this}`);
        }
        bookkeeper.simplePost(year, 'taxCalc', 'TaxCalcInput', cat, amount);
    }

    runYear({ year, bookkeeper }) {
        this.owed = -this.balance;
        const a = this.balance;
        this.balance = 0;
        bookkeeper.simplePost(year, 'taxPaid', 'TaxAccrued', this.name, this.balance - a);
    }

    // IRMAA is really based on MAGI from two years prior; this project
    // approximates it with a one-year lag, the same simplification already
    // used for the tax-payment lag (balance/owed below) -- Medicare (not
    // yet built) will read priorYearMagi for its IRMAA calculation.
    prepareNextYear({ year, bookkeeper }) {
        const ordinaryIncome = bookkeeper.balanceChange('OrdinaryIncome', year);
        const gains = bookkeeper.balanceChange('LtcgIncome', year);
        const mortgageInterest = bookkeeper.balanceChange('MortgageInterestDeduction', year);
        const ssBenefit = bookkeeper.balanceChange('SocialSecurityBenefit', year);
        const a = this.balance;
        const calc = this.calculate({ ordinaryIncome, gains, mortgageInterest, ssBenefit });
        this.balance = -calc.total;
        bookkeeper.simplePost(year, 'taxAccrued', 'TaxAccrued', this.name, this.balance - a);
        this.priorYearMagi = calc.magi;
    }

    due() {
        return { account: 'TaxPaid', amount: this.owed };
    }
}
