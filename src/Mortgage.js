import { Account } from './Account.js';
import { JournalEntry } from './JournalEntry.js';
import { Posting } from './Posting.js';

const MONTHS_PER_YEAR = 12;

export class Mortgage extends Account {
    constructor({ name, rate, monthlyPayment, priority, config }) {
        super({ name, rate, priority, config });
        this.monthlyPayment = monthlyPayment;
        const r = rate / MONTHS_PER_YEAR;
        this.growthFactor = (1 + r) ** MONTHS_PER_YEAR;
        this.yearlyPayment = this.monthlyPayment * ((this.growthFactor - 1) / r);
    }

    makePayment() {
        const computePrincipal = () => {
            const b = this.balance * this.growthFactor - this.yearlyPayment;
            const rv = this.balance - b;
            if (rv >= 0) {
                return rv;
            }
            throw new Error(`rv=${rv} endingBalance=${b} ${this}`);
        };
        const rv = { principal: computePrincipal() };
        rv.interest = this.monthlyPayment * MONTHS_PER_YEAR - rv.principal;
        this.withdraw(rv.principal);
        this.interest = rv.interest;
        return rv;
    }

    due() {
        return { account: 'MortgageInterest', amount: this.interest };
    }

    runYear({ year, bookkeeper }) {
        const { principal } = this.makePayment();
        bookkeeper.post(new JournalEntry({
            year,
            category: 'mortgagePrincipal',
            postings: [
                new Posting({ account: this.name, amount: -principal }),
                new Posting({ account: 'MortgagePrincipalPaid', amount: principal }),
            ],
        }));
    }
}
