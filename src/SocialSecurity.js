import { Account } from './Account.js';

export class SocialSecurity extends Account {
    constructor({ name, config }) {
        super({ name, config });
        this.amount = this.cfg.amount;
    }

    earn(year, bookkeeper) {
        bookkeeper?.postIncome('OrdinaryIncome', this.amount, year);
        return { amount: this.amount };
    }
}
