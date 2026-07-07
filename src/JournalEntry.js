import { Base } from './Base.js';

export class JournalEntry extends Base {
    constructor({ year, category, postings }) {
        super();
        this.year = year;
        this.category = category;
        this.postings = postings;
        if (postings.length !== 2) {
            throw new Error(`not two postings=${postings}`);
        }
        const t = postings.reduce((s, p) => s + p.amount, 0);
        if (Math.abs(t) > 0.005) {
            throw new Error(`non-zero sum=${t} postings=${postings}`);
        }
    }
}
