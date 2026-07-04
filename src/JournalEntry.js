import { Base } from './Base.js';

export class JournalEntry extends Base {
    constructor({ year, category, postings }) {
        super();
        this.year = year;
        this.category = category;
        this.postings = postings;
        const checkCount = () => {
            if (postings.length === 2) {
                return;
            }
            throw new Error(`count=${postings.length} expected=2 ${this}`);
        };
        const checkBalance = () => {
            const t = postings.reduce((s, p) => s + p.amount, 0);
            if (Math.abs(t) <= 0.005) {
                return;
            }
            throw new Error(`total=${t} expected=0 ${this}`);
        };
        checkCount();
        checkBalance();
    }
}
