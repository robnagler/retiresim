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

    // Colorado has no preferential capital-gains rate, so gains join
    // ordinary income in the flat state base; federal keeps them separate
    // via ltcg()'s stacking.
    calculate({ ordinaryIncome, gains = 0 }) {
        const rv = {
            federal: this.federal(ordinaryIncome) + this.ltcg(ordinaryIncome, gains),
            state: this.state(ordinaryIncome + gains),
        };
        rv.total = rv.federal + rv.state;
        return rv;
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
        const a = this.balance;
        this.balance = -this.calculate({ ordinaryIncome, gains }).total;
        bookkeeper.simplePost(year, 'taxAccrued', 'TaxAccrued', this.name, this.balance - a);
    }

    due() {
        return { account: 'TaxPaid', amount: this.owed };
    }
}
