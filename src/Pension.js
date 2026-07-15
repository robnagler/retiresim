import { Account } from './Account.js';

export class Pension extends Account {
    constructor({ name, config }) {
        super({ name, config });
        this.amount = this.cfg.amount;
    }

    earn(year, bookkeeper) {
        bookkeeper.postTaxCalc('OrdinaryIncome', this.amount, year);
        return { amount: this.amount };
    }
}
