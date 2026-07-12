import { Account } from './Account.js';

export class RothIra extends Account {
    earn(year) {
        const amount = this.cfg.withdraw;
        if (!amount) {
            return null;
        }
        this.withdraw(amount);
        return { account: 'RothWithdrawal', amount, source: this.name };
    }
}
