import { Account } from './Account.js';

// IRS Uniform Lifetime Table (Table III), in effect for distribution
// calendar years 2022-2026 (26 CFR 1.401(a)(9)-9(c)).
const LIFE_EXPECTANCY_FACTOR = {
    72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0,
    79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0,
    86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8,
    93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8,
    100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3,
    107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1,
    114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3,
};
const MAX_AGE_FACTOR = 2.0; // age 120 and older
const MAX_REASONABLE_AGE = 120;

export class TraditionalIra extends Account {
    constructor({ name, config }) {
        super({ name, config });
        this.startAge = this.computeStartAge();
    }

    // Loop invariant: birthYear never changes across years, so the RMD
    // start age only needs computing once. Overridden by InheritedIra,
    // which doesn't use birthYear-based RMDs at all.
    computeStartAge() {
        const birthYear = this.cfg.birthYear;
        if (birthYear == null) {
            throw new Error(`birthYear must not be null ${this}`);
        }
        if (birthYear <= 1950) {
            return 72;
        }
        if (birthYear <= 1959) {
            return 73;
        }
        return 75;
    }

    // Required Minimum Distribution, called by Cash.earn() before any
    // account's growth runs this year, so this.balance is still the
    // prior year-end balance the IRS formula requires. null before the
    // RMD start age.
    earn(year, bookkeeper) {
        const age = year - this.cfg.birthYear;
        this.checkAge(age);
        if (age < this.startAge) {
            return null;
        }
        return this.distribute(this.balance / (LIFE_EXPECTANCY_FACTOR[age] ?? MAX_AGE_FACTOR), bookkeeper, year);
    }

    checkAge(age) {
        if (!(age >= 0 && age <= MAX_REASONABLE_AGE)) {
            throw new Error(`age=${age} not reasonable ${this}`);
        }
    }

    distribute(amount, bookkeeper, year) {
        if (amount <= 0) {
            return null;
        }
        this.withdraw(amount, bookkeeper, year);
        return { amount, source: this.name };
    }

    // Every IRA withdrawal is ordinary income, whether it's an RMD (via
    // distribute()) or an ad-hoc draw Cash.produce() takes to cover a
    // shortfall -- both funnel through here.
    withdraw(amount, bookkeeper, year) {
        super.withdraw(amount);
        bookkeeper.postTaxCalc('OrdinaryIncome', amount, year);
        return this.balance;
    }
}
