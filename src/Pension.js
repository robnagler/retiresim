import { Account } from './Account.js';

export class Pension extends Account {
    constructor({ name, config }) {
        super({ name, config });
        this.amount = this.cfg.amount;
    }

    earn(year, bookkeeper) {
        bookkeeper.taxCalculator?.postAmount('OrdinaryIncome', this.amount, year, bookkeeper);
        return { amount: this.amount };
    }
}
