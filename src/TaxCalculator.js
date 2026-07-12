import { Account } from './Account.js';

export class TaxCalculator extends Account {
    federal(income) {
        let rv = 0;
        let p = 0;
        for (const c of this.cfg.federalBrackets) {
            const u = c.upTo === null ? income : Math.min(income, c.upTo);
            if (u <= p) {
                break;
            }
            rv += (u - p) * c.rate;
            p = u;
        }
        return rv;
    }

    state(income) {
        return income * this.cfg.stateRate;
    }

    calculate(income) {
        const rv = { federal: this.federal(income), state: this.state(income) };
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
        const income = bookkeeper.balanceChange('OrdinaryIncome', year);
        const a = this.balance;
        this.balance = -this.calculate(income).total;
        bookkeeper.simplePost(year, 'taxAccrued', 'TaxAccrued', this.name, this.balance - a);
    }

    due() {
        return { account: 'TaxPaid', amount: this.owed };
    }
}
