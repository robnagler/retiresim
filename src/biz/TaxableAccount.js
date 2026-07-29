import { Account } from './Account.js';

export class TaxableAccount extends Account {
    constructor({ name, config }) {
        super({ name, config });
        this.basis = this.cfg.basis;
        // Only checked here, at construction, where basis > balance is
        // almost certainly a cfg typo, not a real state -- a newly
        // configured account isn't supposed to start out already
        // underwater. NOT checked after deposit()/withdraw() (or grow(),
        // which never checked it): market growth can be negative (see
        // HistoricalReturns.js), which legitimately drops balance below
        // basis (an unrealized loss) without touching basis at all, same
        // as a real brokerage statement would show.
        this._checkBasis();
    }

    deposit(amount) {
        super.deposit(amount);
        this.basis += amount;
        return this.balance;
    }

    // basisUsed/gain both come out negative when the account is
    // underwater (basis > balance going in) -- a withdrawal from a
    // position at a loss realizes a capital loss, not a gain, and the
    // math falls out of the same proportional formula either way.
    withdraw(amount, bookkeeper, year) {
        const basisUsed = amount * (this.basis / this.balance);
        super.withdraw(amount);
        this.basis -= basisUsed;
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
