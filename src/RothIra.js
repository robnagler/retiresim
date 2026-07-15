import { Account } from './Account.js';

export class RothIra extends Account {
    // No tax consequence -- earn() draws down the balance but never
    // reports to bookkeeper.postTaxCalc(), so TaxCalculator never sees it.
    earn(year) {
        const amount = this.cfg.withdraw;
        if (!amount) {
            return null;
        }
        this.withdraw(amount);
        return { amount, source: this.name };
    }
}
