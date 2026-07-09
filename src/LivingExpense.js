import { Account } from './Account.js';

export class LivingExpense extends Account {
    due() {
        return { account: 'LivingExpensePaid', amount: this.balance };
    }
}
