import { Base } from './Base.js';

export class Posting extends Base {
    constructor({ account, amount }) {
        super();
        this.account = account;
        this.amount = amount;
    }
}
