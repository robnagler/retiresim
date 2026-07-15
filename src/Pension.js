import { Account } from './Account.js';

export class Pension extends Account {
    earn(year, bookkeeper) {
        bookkeeper.taxCalculator?.postAmount('OrdinaryIncome', this.cfg.amount, year, bookkeeper);
        return { amount: this.cfg.amount };
    }
}
