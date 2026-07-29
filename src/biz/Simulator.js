import { Base } from './Base.js';

export class Simulator extends Base {
    constructor({ bookkeeper, config }) {
        super({ config });
        this.bookkeeper = bookkeeper;
    }

    // onYear is a genuinely optional reporting hook -- the simulation runs
    // fine without it (e.g. tests that only care about final balances).
    run(onYear) {
        for (let y = this.cfg.startYear; y <= this.cfg.endYear; y++) {
            this.bookkeeper.runYear(y);
            onYear?.(y);
        }
    }
}
