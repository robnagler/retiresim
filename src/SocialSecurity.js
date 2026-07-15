import { Account } from './Account.js';

export class SocialSecurity extends Account {
    constructor({ name, config }) {
        super({ name, config });
        this.amount = this.cfg.amount;
    }

    // Reports the raw benefit, not OrdinaryIncome -- how much of it is
    // taxable depends on total provisional income for the year, which
    // only TaxCalculator can compute (see TaxCalculator.taxableSocialSecurity()).
    earn(year, bookkeeper) {
        bookkeeper.postTaxCalc('SocialSecurityBenefit', this.amount, year);
        return { amount: this.amount };
    }
}
