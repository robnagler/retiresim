import { Account } from './Account.js';

export class Salary extends Account {
    constructor({ name, config }) {
        super({ name, config });
        this.amount = this.cfg.amount;
    }

    earn(year) {
        return { account: 'OrdinaryIncome', amount: this.amount };
    }
}
