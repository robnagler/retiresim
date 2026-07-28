import { Account } from './Account.js';

export class TaxCalculator extends Account {
    constructor({ name, config }) {
        super({ name, config });
        // Seeds the very first simulated year, before any year's MAGI has
        // been computed in-model -- mirrors how `balance` seeds the first
        // year's already-accrued tax liability.
        this.magi = this.cfg.initialMagi;
        // Per-instance copies, grown every year in prepareNextYear() --
        // real IRS brackets/standard deduction are inflation-indexed
        // annually (same mechanism IRMAA has used since 2020, see
        // README.md's Reference data), so a fixed-forever value would have
        // the same "gets easier to cross over decades" issue IRMAA had.
        // ssProvisionalIncomeThresholds is deliberately NOT grown here --
        // those have never been inflation-adjusted in real law since
        // enacted in the 1980s/90s, so leaving them flat is accurate, not
        // a simplification to fix.
        this.federalBrackets = this.cfg.federalBrackets.map((b) => ({ ...b }));
        this.ltcgBrackets = this.cfg.ltcgBrackets.map((b) => ({ ...b }));
        this.standardDeduction = this.cfg.standardDeduction;
    }

    federal(income) {
        return this._bracketTax(this.federalBrackets, 0, income);
    }

    state(income) {
        return income * this.cfg.stateRate;
    }

    // Gains stack on top of ordinary income: the floor is ordinaryIncome, so
    // gains are taxed at the rate for the bracket(s) they fall into above it,
    // not from zero.
    ltcg(ordinaryIncome, gains) {
        return this._bracketTax(this.ltcgBrackets, ordinaryIncome, ordinaryIncome + gains);
    }

    // Grows only the upTo boundaries -- the tax rate at each tier doesn't
    // change, just which income lands in which tier. Mirrors
    // Medicare.js's irmaaBrackets growth exactly. rate here is a growth
    // factor (1 + inflationRate), not the raw rate -- see prepareNextYear().
    _growBrackets(brackets, rate) {
        return brackets.map((b) => (b.upTo === null ? b : { ...b, upTo: b.upTo * rate }));
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

    // Sign convention: income is positive, deductions are negative --
    // mortgageInterest is <= 0 here (postAmount() posts it negative).
    // standardDeduction is a plain positive magnitude (never posted
    // through the ledger), so it's negated for comparison. Only itemize
    // if it beats the standard deduction (more negative = bigger benefit)
    // -- matches how a real return chooses between the two. Colorado has
    // no preferential capital-gains rate, so gains join ordinary income in
    // the flat state base; federal keeps them separate via ltcg()'s
    // stacking. Colorado excludes Social Security benefits from state tax
    // entirely (current CO law for taxpayers 65+, the common case here)
    // -- so taxable SS only widens the federal base, never the state one.
    // Both bases are net of the deduction, floored at 0, since CO starts
    // from federal taxable income.
    calculate({ ordinaryIncome, gains = 0, mortgageInterest = 0, ssBenefit = 0 }) {
        const taxableSS = this.taxableSocialSecurity(ordinaryIncome, ssBenefit);
        const deduction = Math.min(mortgageInterest, -this.standardDeduction);
        const taxableFederalOrdinary = Math.max(0, ordinaryIncome + taxableSS + deduction);
        const taxableStateOrdinary = Math.max(0, ordinaryIncome + deduction);
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

    // Called directly as bookkeeper.taxCalculator.postAmount(...): records
    // amount under cat so prepareNextYear() picks it up later via
    // balanceChange(). Only these categories are recognized today --
    // anything else is a caller bug, not a silent no-effect case
    // (RothIra/HsaAccount simply never call postAmount() at all). Callers
    // always pass a positive magnitude (e.g. Mortgage passes the interest
    // it paid); postAmount() encodes the sign -- income categories post
    // positive, MortgageInterestDeduction posts negative -- so the ledger
    // is self-describing and calculate() can just add everything up.
    postAmount(cat, amount, year, bookkeeper) {
        if (cat !== 'OrdinaryIncome' && cat !== 'LtcgIncome' && cat !== 'MortgageInterestDeduction' && cat !== 'SocialSecurityBenefit') {
            throw new Error(`cat=${cat} not recognized ${this}`);
        }
        const signed = cat === 'MortgageInterestDeduction' ? -amount : amount;
        bookkeeper.simplePost(year, 'taxCalc', 'TaxCalcInput', cat, signed);
    }

    runYear({ year, bookkeeper }) {
        this.owed = -this.balance;
        const a = this.balance;
        this.balance = 0;
        bookkeeper.simplePost(year, 'taxPaid', 'TaxAccrued', this.name, this.balance - a);
    }

    // IRMAA is really based on MAGI from two years prior; this project
    // approximates it with a one-year lag, the same simplification already
    // used for the tax-payment lag (balance/owed below) -- by the time
    // Medicare (not yet built) reads this.magi for its IRMAA calculation, a
    // later year is already running, so it's always reading last year's
    // value, same as `owed` reads last year's tax liability.
    prepareNextYear({ year, bookkeeper }) {
        // rate is a growth factor (1 + inflationRate), applied directly
        // wherever something compounds, instead of writing "1 + rate" at
        // every use.
        const rate = 1 + bookkeeper.economy.inflationRate;
        this.federalBrackets = this._growBrackets(this.federalBrackets, rate);
        this.ltcgBrackets = this._growBrackets(this.ltcgBrackets, rate);
        this.standardDeduction *= rate;
        const ordinaryIncome = bookkeeper.balanceChange('OrdinaryIncome', year);
        const gains = bookkeeper.balanceChange('LtcgIncome', year);
        const mortgageInterest = bookkeeper.balanceChange('MortgageInterestDeduction', year);
        const ssBenefit = bookkeeper.balanceChange('SocialSecurityBenefit', year);
        const a = this.balance;
        const calc = this.calculate({ ordinaryIncome, gains, mortgageInterest, ssBenefit });
        this.balance = -calc.total;
        bookkeeper.simplePost(year, 'taxAccrued', 'TaxAccrued', this.name, this.balance - a);
        this.magi = calc.magi;
    }

    due() {
        return { account: 'TaxPaid', amount: this.owed };
    }
}
