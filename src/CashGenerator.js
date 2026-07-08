import { Base } from './Base.js';

export class CashGenerator extends Base {
    constructor({ config, accounts }) {
        super();
        this.cfg = config.get(this.constructor.name);
        this.accounts = accounts;
    }

    raise(amount) {
        const rv = [];
        let r = amount;
        for (const n of this.cfg.withdrawalOrder) {
            if (r <= 0) {
                break;
            }
            const a = this.accounts.find((account) => account.name === n);
            const w = Math.min(r, a.balance);
            if (w <= 0) {
                continue;
            }
            a.withdraw(w);
            rv.push({ account: n, amount: w });
            r -= w;
        }
        if (r > 0.005) {
            throw new Error(`insufficient funds shortfall=${r} amount=${amount} accounts=${this.accounts}`);
        }
        return rv;
    }
}
