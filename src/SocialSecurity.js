import { Account } from './Account.js';

export class SocialSecurity extends Account {
    constructor({ name, config }) {
        super({ name, config });
        this.amount = this.cfg.amount;
    }

    earn() {
        return { account: 'OrdinaryIncome', amount: this.amount };
    }
}
