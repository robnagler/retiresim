import { Account } from './Account.js';

const MONTHS_PER_YEAR = 12;

export class Mortgage extends Account {
    constructor({ balance, rate, monthlyPayment }) {
        super({ balance });
        this.rate = rate;
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
        return rv;
    }
}
