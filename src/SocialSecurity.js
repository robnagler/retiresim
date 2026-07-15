import { Account } from './Account.js';

const MONTHS_PER_YEAR = 12;

export class SocialSecurity extends Account {
    constructor({ name, config }) {
        super({ name, config });
        this.monthlyAmount = this.cfg.monthlyAmount;
        this.yearlyAmount = this.monthlyAmount * MONTHS_PER_YEAR;
    }

    // Reports the raw benefit, not OrdinaryIncome -- how much of it is
    // taxable depends on total provisional income for the year, which
    // only TaxCalculator can compute (see TaxCalculator.taxableSocialSecurity()).
    earn(year, bookkeeper) {
        bookkeeper.taxCalculator?.postAmount('SocialSecurityBenefit', this.yearlyAmount, year, bookkeeper);
        return { amount: this.yearlyAmount };
    }
}
