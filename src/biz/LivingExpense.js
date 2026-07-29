import { Account } from './Account.js';

export class LivingExpense extends Account {
    // Inflation-adjusted, not market-growth -- overrides Account's default
    // sp500Rate.
    growthRate(bookkeeper) {
        return bookkeeper.economy.inflationRate;
    }

    due() {
        return { account: 'LivingExpensePaid', amount: this.balance };
    }
}
