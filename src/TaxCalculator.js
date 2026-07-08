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
        const income = bookkeeper.balanceChange('OrdinaryIncome', year);
        this.balance = this.calculate(income).total;
    }

    due() {
        return { account: this.name, amount: this.balance };
    }
}
