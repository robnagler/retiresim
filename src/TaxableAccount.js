import { Account } from './Account.js';

export class TaxableAccount extends Account {
    constructor({ name, balance, rate, priority, basis }) {
        super({ name, balance, rate, priority });
        this.basis = basis;
        this._checkBasis();
    }

    deposit(amount) {
        super.deposit(amount);
        this.basis += amount;
        this._checkBasis();
        return this.balance;
    }

    withdraw(amount) {
        const basisUsed = amount * (this.basis / this.balance);
        super.withdraw(amount);
        this.basis -= basisUsed;
        this._checkBasis();
        return { balance: this.balance, basisUsed, gain: amount - basisUsed };
    }

    _checkBasis() {
        if (this.basis <= this.balance + 0.005) {
            return;
        }
        throw new Error(`basis=${this.basis} exceeds balance ${this}`);
    }
}
