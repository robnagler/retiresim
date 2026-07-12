import { Account } from './Account.js';

const rmdStartAge = (birthYear) => {
    if (birthYear <= 1950) {
        return 72;
    }
    if (birthYear <= 1959) {
        return 73;
    }
    return 75;
};

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

export class TraditionalIra extends Account {
    runYear({ year, bookkeeper }) {
        this.priorBalance = this.balance;
        super.runYear({ year, bookkeeper });
    }

    // Required Minimum Distribution: the balance as of the prior year-end
    // (before this year's growth), divided by the IRS life expectancy
    // factor for the age turned this year. 0 before the RMD start age.
    rmd(year) {
        if (this.cfg.birthYear == null) {
            return 0;
        }
        const age = year - this.cfg.birthYear;
        if (age < rmdStartAge(this.cfg.birthYear)) {
            return 0;
        }
        return this.priorBalance / (LIFE_EXPECTANCY_FACTOR[age] ?? MAX_AGE_FACTOR);
    }
}
