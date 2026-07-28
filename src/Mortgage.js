import { Account } from './Account.js';

const MONTHS_PER_YEAR = 12;

export class Mortgage extends Account {
    constructor({ name, config }) {
        super({ name, config });
        // growthFactor is a non-trivial derived value reused every year in
        // makePayment(), so it's worth caching -- cfg.rate itself isn't
        // mutated, so it's read straight from cfg wherever else it's
        // needed instead of being duplicated onto the instance. This is
        // the loan's own fixed rate, not Economy.interestRate -- Account
        // no longer carries a generic `rate` field (see Account.js), so
        // Mortgage reads it directly.
        const r = this.cfg.rate / MONTHS_PER_YEAR;
        this.growthFactor = (1 + r) ** MONTHS_PER_YEAR;
        this._monthlyRate = r;
    }

    // The monthly payment isn't configured -- it's derived from the current
    // balance, rate, and how many months remain until cfg.endYear as of the
    // first year this runs, via the standard fixed-payment amortization
    // formula. That formula guarantees the balance reaches (approximately)
    // zero exactly at endYear. Computed once and held fixed for the life of
    // the loan, like a real mortgage's payment never changes after
    // origination.
    _ensurePayment(year) {
        if (this.monthlyPayment !== undefined) {
            return;
        }
        const months = (this.cfg.endYear - year + 1) * MONTHS_PER_YEAR;
        if (months <= 0) {
            throw new Error(`endYear=${this.cfg.endYear} not after year=${year} ${this}`);
        }
        const p = -this.balance;
        const r = this._monthlyRate;
        this.monthlyPayment = (p * r) / (1 - (1 + r) ** -months);
        this.yearlyPayment = this.monthlyPayment * ((this.growthFactor - 1) / r);
    }

    makePayment(year) {
        this._ensurePayment(year);
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
    // MortgageInterestDeduction is tracked independently via postAmount().
    due() {
        return { account: 'MortgagePayment', amount: this.principal + this.interest };
    }

    runYear({ year, bookkeeper }) {
        // Selling the house: stop paying and remove the remaining balance
        // from the books entirely -- sale proceeds/profit aren't modeled,
        // only the liability going away. Checked before the endYear guard
        // since a sale can happen either before or after the loan's
        // natural payoff year; the balance-!==-0 guard means the
        // forgiveness posting only happens once, the year the sale takes
        // effect (a later endYear payoff would already have zeroed it).
        if (this.cfg.sellYear !== undefined && year >= this.cfg.sellYear) {
            this.principal = 0;
            this.interest = 0;
            if (this.balance !== 0) {
                const change = -this.balance;
                this.deposit(change);
                bookkeeper.simplePost(year, 'mortgageSale', 'MortgageBalanceForgiven', this.name, change);
            }
            return;
        }
        // Past endYear the loan is paid off -- no payment due, balance
        // stays put. Without this, the amortized payment would keep being
        // applied forever and the balance would drift past zero into
        // positive territory.
        if (year > this.cfg.endYear) {
            this.principal = 0;
            this.interest = 0;
            return;
        }
        const rv = this.makePayment(year);
        bookkeeper.simplePost(year, 'mortgagePrincipal', 'MortgagePrincipalPaid', this.name, rv.principal);
        // Distinct from the 'MortgageInterest' category due() uses for the
        // actual cash expense -- this one only feeds the tax deduction, so
        // reusing the name would double it in balanceChange('MortgageInterest', ...).
        bookkeeper.taxCalculator?.postAmount('MortgageInterestDeduction', rv.interest, year, bookkeeper);
    }
}
