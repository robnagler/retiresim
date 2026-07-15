import { Account } from './Account.js';

const MONTHS_PER_YEAR = 12;

export class Salary extends Account {
    constructor({ name, config }) {
        super({ name, config });
        this.monthlyAmount = this.cfg.monthlyAmount;
        this.yearlyAmount = this.monthlyAmount * MONTHS_PER_YEAR;
    }

    earn(year, bookkeeper) {
        bookkeeper.taxCalculator?.postAmount('OrdinaryIncome', this.yearlyAmount, year, bookkeeper);
        return { amount: this.yearlyAmount };
    }
}
