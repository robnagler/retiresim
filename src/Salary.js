import { Account } from './Account.js';

const MONTHS_PER_YEAR = 12;

export class Salary extends Account {
    // No income posted after the working years end -- same
    // null-before/at-eligibility shape as SocialSecurity.earn()'s
    // startYear gate, just bounding the other direction.
    earn(year, bookkeeper) {
        if (year > this.cfg.endYear) {
            return null;
        }
        const amount = this.cfg.monthlyAmount * MONTHS_PER_YEAR;
        bookkeeper.taxCalculator?.postAmount('OrdinaryIncome', amount, year, bookkeeper);
        return { amount };
    }
}
