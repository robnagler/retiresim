import { Base } from './Base.js';
import { JournalEntry } from './JournalEntry.js';
import { Posting } from './Posting.js';

export class Account extends Base {
    constructor({ name, rate, priority = 0, config }) {
        super();
        this.name = name;
        const c = config.get(this.constructor.name);
        this.balance = c.balance;
        this.rate = rate;
        this.priority = priority;
        this.config = c;
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
            postings: [
                new Posting({ account: this.name, amount: g }),
                new Posting({ account: 'UnrealizedGrowth', amount: -g }),
            ],
        }));
    }
}
