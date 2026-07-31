import { TaxableAccount } from './TaxableAccount.js';
import { TraditionalIra } from './TraditionalIra.js';
import { NonSpousalInheritedIra } from './NonSpousalInheritedIra.js';
import { RothIra } from './RothIra.js';
import { HsaAccount } from './HsaAccount.js';
import { Mortgage } from './Mortgage.js';
import { LivingExpense } from './LivingExpense.js';
import { LumpSum } from './LumpSum.js';
import { TaxCalculator } from './TaxCalculator.js';
import { Medicare } from './Medicare.js';
import { Salary } from './Salary.js';
import { SocialSecurity } from './SocialSecurity.js';
import { Pension } from './Pension.js';
import { Cash } from './Cash.js';

// Every class a config entry can name, which Bookkeeper resolves each
// entry's `class` through. One registry rather than one per front end: the
// CLI and the browser had their own, and they had already drifted -- the
// browser's was missing Pension, so a config naming one would have run
// under the CLI and thrown in the browser, for no reason anybody could
// have found from the config itself.
export const CLASSES = {
    TaxableAccount,
    TraditionalIra,
    NonSpousalInheritedIra,
    RothIra,
    HsaAccount,
    Mortgage,
    LivingExpense,
    LumpSum,
    TaxCalculator,
    Medicare,
    Salary,
    SocialSecurity,
    Pension,
    Cash,
};
