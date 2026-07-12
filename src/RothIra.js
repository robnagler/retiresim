import { Account } from './Account.js';

export class RothIra extends Account {
    runYear({ year, bookkeeper }) {
        super.runYear({ year, bookkeeper });
        const amount = this.cfg.withdraw;
        this.withdraw(amount);
        bookkeeper.simplePost(year, 'rothIraWithdrawal', this.name, 'RothWithdrawal', amount);
    }
}
