import { Account } from './Account.js';
import { JournalEntry } from './JournalEntry.js';
import { Posting } from './Posting.js';

export class TraditionalIra extends Account {
    constructor({ name, balance, rate, priority, config }) {
        super({ name, balance, rate, priority });
        this.config = config;
    }

    withdraw(amount) {
        const balance = super.withdraw(amount);
        return { balance, income: amount };
    }

    runYear({ year, bookkeeper }) {
        super.runYear({ year, bookkeeper });
        const amount = this.config.withdrawal(this.name, year);
        this.withdraw(amount);
        bookkeeper.post(new JournalEntry({
            year,
            category: 'traditionalIraWithdrawal',
            postings: [
                new Posting({ account: this.name, amount: -amount }),
                new Posting({ account: 'OrdinaryIncome', amount }),
            ],
        }));
    }
}
