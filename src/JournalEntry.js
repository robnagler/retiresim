import { Base } from './Base.js';

export class JournalEntry extends Base {
    constructor({ year, category, source, dest }) {
        super();
        this.year = year;
        this.category = category;
        this.source = source;
        this.dest = dest;
        const t = source.amount + dest.amount;
        if (Math.abs(t) > 0.005) {
            throw new Error(`non-zero sum=${t} source=${source} dest=${dest}`);
        }
    }
}
