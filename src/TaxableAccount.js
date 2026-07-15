import { Account } from './Account.js';

export class TaxableAccount extends Account {
    constructor({ name, config }) {
        super({ name, config });
        this.basis = this.cfg.basis;
        this._checkBasis();
    }

    deposit(amount) {
        super.deposit(amount);
        this.basis += amount;
        this._checkBasis();
        return this.balance;
    }

    withdraw(amount, bookkeeper, year) {
        const basisUsed = amount * (this.basis / this.balance);
        super.withdraw(amount);
        this.basis -= basisUsed;
        this._checkBasis();
        const gain = amount - basisUsed;
        bookkeeper.taxCalculator?.postAmount('LtcgIncome', gain, year, bookkeeper);
        return { balance: this.balance, basisUsed, gain };
    }

    _checkBasis() {
        if (this.basis <= this.balance + 0.005) {
            return;
        }
        throw new Error(`basis=${this.basis} exceeds balance ${this}`);
    }
}
