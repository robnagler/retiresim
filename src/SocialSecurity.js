import { Account } from './Account.js';

const MONTHS_PER_YEAR = 12;

export class SocialSecurity extends Account {
    constructor({ name, config }) {
        super({ name, config });
        this.monthlyAmount = this.cfg.monthlyAmount;
        this.yearlyAmount = this.monthlyAmount * MONTHS_PER_YEAR;
        this.startYear = this.cfg.startYear;
    }

    // Reports the raw benefit, not OrdinaryIncome -- how much of it is
    // taxable depends on total provisional income for the year, which
    // only TaxCalculator can compute (see TaxCalculator.taxableSocialSecurity()).
    // No benefit before the claimed startYear -- same null-before-eligible
    // pattern as TraditionalIra.earn()'s age < startAge check.
    earn(year, bookkeeper) {
        if (year < this.startYear) {
            return null;
        }
        bookkeeper.taxCalculator?.postAmount('SocialSecurityBenefit', this.yearlyAmount, year, bookkeeper);
        return { amount: this.yearlyAmount };
    }
}
