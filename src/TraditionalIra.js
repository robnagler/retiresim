import { Account } from './Account.js';
import { JournalEntry } from './JournalEntry.js';
import { Posting } from './Posting.js';

export class TraditionalIra extends Account {
    withdraw(amount) {
        const balance = super.withdraw(amount);
        return { balance, income: amount };
    }

    runYear({ year, bookkeeper }) {
        super.runYear({ year, bookkeeper });
        const amount = this.cfg.withdraw;
        this.withdraw(amount);
        bookkeeper.post(new JournalEntry({
            year,
            category: 'traditionalIraWithdrawal',
            source: new Posting({ account: this.name, amount: -amount }),
            dest: new Posting({ account: 'OrdinaryIncome', amount }),
        }));
    }
}
