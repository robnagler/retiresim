import { Account } from './Account.js';

// A one-time spending event in specific years -- e.g. {"2030": 100000} --
// rather than every year like LivingExpense. cfg.amounts is a year ->
// dollar-amount map; JSON object keys are always strings, but plain
// numeric lookup (cfg.amounts[year]) works either way since JS coerces
// the key. No tax treatment is reported -- a lump sum is a cash outflow
// only, same as LivingExpense.
export class LumpSum extends Account {
    // due() (called by Cash.runYear() with no arguments) can't take year
    // itself, so runYear() -- called earlier in the same annual cycle --
    // stashes this year's amount for due() to read. Overrides Account's
    // default growth entirely -- balance/growthRate are inert boilerplate
    // here, same as SocialSecurity/Medicare.
    runYear({ year }) {
        this.amount = this.cfg.amounts[year] ?? 0;
    }

    due() {
        return { account: 'LumpSumPaid', amount: this.amount };
    }
}
