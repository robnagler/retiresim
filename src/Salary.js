import { Account } from './Account.js';

const MONTHS_PER_YEAR = 12;

export class Salary extends Account {
    earn(year, bookkeeper) {
        const amount = this.cfg.monthlyAmount * MONTHS_PER_YEAR;
        bookkeeper.taxCalculator?.postAmount('OrdinaryIncome', amount, year, bookkeeper);
        return { amount };
    }
}
