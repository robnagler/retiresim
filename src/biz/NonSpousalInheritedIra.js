import { TraditionalIra } from './TraditionalIra.js';

const SECURE_ACT_DISTRIBUTION_PERIOD = 10;
const SECURE_ACT_YEAR = 2020; // 10-year rule applies to inheritances in this year or later

// IRS Single Life Expectancy Table (Table I), in effect for distribution
// calendar years 2022-2026 (26 CFR 1.401(a)(9)-9(b)). Also applies, per
// the transition ("reset") rule, to pre-2022 stretch beneficiaries: look
// up this table using the beneficiary's age in their original first
// distribution year, then reduce by one for each year since.
const SINGLE_LIFE_EXPECTANCY_FACTOR = {
    0: 84.6, 1: 83.7, 2: 82.8, 3: 81.8, 4: 80.8, 5: 79.8, 6: 78.8, 7: 77.9,
    8: 76.9, 9: 75.9, 10: 74.9, 11: 73.9, 12: 72.9, 13: 71.9, 14: 70.9,
    15: 69.9, 16: 69.0, 17: 68.0, 18: 67.0, 19: 66.0, 20: 65.0, 21: 64.1,
    22: 63.1, 23: 62.1, 24: 61.1, 25: 60.2, 26: 59.2, 27: 58.2, 28: 57.3,
    29: 56.3, 30: 55.3, 31: 54.4, 32: 53.4, 33: 52.5, 34: 51.5, 35: 50.5,
    36: 49.6, 37: 48.6, 38: 47.7, 39: 46.7, 40: 45.7, 41: 44.8, 42: 43.8,
    43: 42.9, 44: 41.9, 45: 41.0, 46: 40.0, 47: 39.0, 48: 38.1, 49: 37.1,
    50: 36.2, 51: 35.3, 52: 34.3, 53: 33.4, 54: 32.5, 55: 31.6, 56: 30.6,
    57: 29.8, 58: 28.9, 59: 28.0, 60: 27.1, 61: 26.2, 62: 25.4, 63: 24.5,
    64: 23.7, 65: 22.9, 66: 22.0, 67: 21.2, 68: 20.4, 69: 19.6, 70: 18.8,
    71: 18.0, 72: 17.2, 73: 16.4, 74: 15.6, 75: 14.8, 76: 14.1, 77: 13.3,
    78: 12.6, 79: 11.9, 80: 11.2, 81: 10.5, 82: 9.9, 83: 9.3, 84: 8.7,
    85: 8.1, 86: 7.6, 87: 7.1, 88: 6.6, 89: 6.1, 90: 5.7, 91: 5.3, 92: 4.9,
    93: 4.6, 94: 4.3, 95: 4.0, 96: 3.7, 97: 3.4, 98: 3.2, 99: 3.0, 100: 2.8,
    101: 2.6, 102: 2.5, 103: 2.3, 104: 2.2, 105: 2.1, 106: 2.1, 107: 2.1,
    108: 2.0, 109: 2.0, 110: 2.0, 111: 2.0, 112: 2.0, 113: 1.9, 114: 1.9,
    115: 1.8, 116: 1.8, 117: 1.6, 118: 1.4, 119: 1.1,
};
const MIN_FACTOR = 1.0; // age 120 and older, and the reduce-by-one floor

// Non-spouse inherited IRA. Two distinct regimes depending on when it
// was inherited:
//
// - 2020 or later (SECURE Act's 10-year rule): the entire balance must
//   be distributed by the 10th year after inheritance. Modeled as a
//   level, straight-line withdrawal each remaining year. Simplification:
//   ignores the "at least as fast" rule requiring annual RMDs during the
//   10 years when the original owner had already started their own
//   RMDs -- not modeled here.
//
// - Before 2020 (pre-SECURE-Act "stretch" IRA): annual RMDs over the
//   beneficiary's own life expectancy, using their age in the first
//   distribution year (the year after inheriting) to look up an initial
//   factor from Table I, then reducing that factor by one each
//   subsequent year (the non-recalculation "reduce-by-one" method used
//   by non-spouse beneficiaries).
export class NonSpousalInheritedIra extends TraditionalIra {
    constructor({ name, config }) {
        super({ name, config });
        this.preSecureAct = this.cfg.inheritedYear < SECURE_ACT_YEAR;
        if (this.preSecureAct) {
            this.firstDistributionYear = this.cfg.inheritedYear + 1;
            const age = this.firstDistributionYear - this.cfg.birthYear;
            this.checkAge(age);
            this.initialFactor = SINGLE_LIFE_EXPECTANCY_FACTOR[age] ?? MIN_FACTOR;
        }
    }

    computeStartAge() {
        return null;
    }

    earn(year, bookkeeper) {
        if (year < this.cfg.inheritedYear) {
            throw new Error(`year=${year} before inheritedYear=${this.cfg.inheritedYear} ${this}`);
        }
        if (this.preSecureAct) {
            if (year < this.firstDistributionYear) {
                return null;
            }
            const factor = Math.max(MIN_FACTOR, this.initialFactor - (year - this.firstDistributionYear));
            return this.distribute(this.balance / factor, bookkeeper, year);
        }
        const deadline = this.cfg.inheritedYear + SECURE_ACT_DISTRIBUTION_PERIOD;
        const yearsRemaining = deadline - year + 1;
        if (yearsRemaining <= 0) {
            throw new Error(`balance=${this.balance} not fully distributed by deadline=${deadline} ${this}`);
        }
        return this.distribute(this.balance / yearsRemaining, bookkeeper, year);
    }
}
