import { Base } from './Base.js';

export class Account extends Base {
    constructor({ balance }) {
        super();
        this.balance = balance;
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
}
