import { Base } from './Base.js';
import { JournalEntry } from './JournalEntry.js';
import { Posting } from './Posting.js';

export class Account extends Base {
    constructor({ name, config }) {
        super({ name, config });
        this.balance = this.cfg.balance;
        this.rate = this.cfg.rate;
    }

    grow(rate) {
        this.balance += this.balance * rate;
        return this.balance;
    }

    deposit(amount) {
        this.balance += amount;
        return this.balance;
    }

    withdraw(amount) {
        const checkSufficient = () => {
            if (amount <= this.balance) {
                return;
            }
            throw new Error(`amount=${amount} ${this}`);
        };
        checkSufficient();
        this.balance -= amount;
        return this.balance;
    }

    runYear({ year, bookkeeper }) {
        const a = this.balance;
        this.grow(this.rate);
        const g = this.balance - a;
        bookkeeper.post(new JournalEntry({
            year,
            category: 'growth',
            source: new Posting({ account: 'UnrealizedGrowth', amount: -g }),
            dest: new Posting({ account: this.name, amount: g }),
        }));
    }
}
