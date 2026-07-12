import { Base } from './Base.js';

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
        bookkeeper.simplePost(year, 'growth', 'UnrealizedGrowth', this.name, this.balance - a);
    }
}
