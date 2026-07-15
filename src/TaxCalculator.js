import { Account } from './Account.js';

export class TaxCalculator extends Account {
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

    // Only itemize (deduct mortgage interest) if it beats the standard
    // deduction -- matches how a real return chooses between the two.
    // Colorado has no preferential capital-gains rate, so gains join
    // ordinary income in the flat state base; federal keeps them separate
    // via ltcg()'s stacking. Both bases are net of the deduction, since CO
    // starts from federal taxable income.
    calculate({ ordinaryIncome, gains = 0, mortgageInterest = 0 }) {
        const deduction = Math.max(mortgageInterest, this.cfg.standardDeduction ?? 0);
        const taxableOrdinary = Math.max(0, ordinaryIncome - deduction);
        const rv = {
            federal: this.federal(taxableOrdinary) + this.ltcg(taxableOrdinary, gains),
            state: this.state(taxableOrdinary + gains),
        };
        rv.total = rv.federal + rv.state;
        return rv;
    }

    // Called via Bookkeeper.postTaxCalc(): records amount under cat so
    // prepareNextYear() picks it up later via balanceChange(). Only these
    // three categories are recognized today -- anything else is a caller
    // bug, not a silent no-effect case (RothIra/HsaAccount simply never
    // call postTaxCalc() at all).
    postTaxCalc(cat, amount, year, bookkeeper) {
        if (cat !== 'OrdinaryIncome' && cat !== 'LtcgIncome' && cat !== 'MortgageInterestDeduction') {
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

    prepareNextYear({ year, bookkeeper }) {
        const ordinaryIncome = bookkeeper.balanceChange('OrdinaryIncome', year);
        const gains = bookkeeper.balanceChange('LtcgIncome', year);
        const mortgageInterest = bookkeeper.balanceChange('MortgageInterestDeduction', year);
        const a = this.balance;
        this.balance = -this.calculate({ ordinaryIncome, gains, mortgageInterest }).total;
        bookkeeper.simplePost(year, 'taxAccrued', 'TaxAccrued', this.name, this.balance - a);
    }

    due() {
        return { account: 'TaxPaid', amount: this.owed };
    }
}
