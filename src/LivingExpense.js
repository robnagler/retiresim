import { Account } from './Account.js';

export class LivingExpense extends Account {
    due() {
        return { account: this.name, amount: this.balance };
    }
}
