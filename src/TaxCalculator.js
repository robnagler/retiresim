import { Account } from './Account.js';
import { JournalEntry } from './JournalEntry.js';
import { Posting } from './Posting.js';

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
        const a = this.balance;
        this.balance = this.calculate(income).total;
        const d = this.balance - a;
        bookkeeper.post(new JournalEntry({
            year,
            category: 'tax',
            source: new Posting({ account: 'TaxAccrued', amount: -d }),
            dest: new Posting({ account: this.name, amount: d }),
        }));
    }

    due() {
        return { account: 'TaxPaid', amount: this.balance };
    }
}
