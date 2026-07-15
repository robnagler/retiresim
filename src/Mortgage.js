import { Account } from './Account.js';

const MONTHS_PER_YEAR = 12;

export class Mortgage extends Account {
    constructor({ name, config }) {
        super({ name, config });
        this.monthlyPayment = this.cfg.monthlyPayment;
        const r = this.rate / MONTHS_PER_YEAR;
        this.growthFactor = (1 + r) ** MONTHS_PER_YEAR;
        this.yearlyPayment = this.monthlyPayment * ((this.growthFactor - 1) / r);
    }

    makePayment() {
        const computePrincipal = () => {
            const b = this.balance * this.growthFactor + this.yearlyPayment;
            const rv = b - this.balance;
            if (rv >= 0) {
                return rv;
            }
            throw new Error(`rv=${rv} endingBalance=${b} ${this}`);
        };
        const rv = { principal: computePrincipal() };
        rv.interest = this.monthlyPayment * MONTHS_PER_YEAR - rv.principal;
        this.deposit(rv.principal);
        this.principal = rv.principal;
        this.interest = rv.interest;
        return rv;
    }

    // Cash writes one check covering the full payment -- principal and
    // interest aren't separate cash outflows, so due() (which drives
    // Cash's actual withdrawal) reports the total. Mortgage's own balance
    // change is tracked independently via runYear()'s ledger posting;
    // MortgageInterestDeduction is tracked independently via postTaxCalc().
    due() {
        return { account: 'MortgagePayment', amount: this.principal + this.interest };
    }

    runYear({ year, bookkeeper }) {
        const rv = this.makePayment();
        bookkeeper.simplePost(year, 'mortgagePrincipal', 'MortgagePrincipalPaid', this.name, rv.principal);
        // Distinct from the 'MortgageInterest' category due() uses for the
        // actual cash expense -- this one only feeds the tax deduction, so
        // reusing the name would double it in balanceChange('MortgageInterest', ...).
        bookkeeper.postTaxCalc('MortgageInterestDeduction', rv.interest, year);
    }
}
