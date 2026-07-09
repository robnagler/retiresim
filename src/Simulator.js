import { Base } from './Base.js';

export class Simulator extends Base {
    constructor({ bookkeeper, config }) {
        super({ config });
        this.bookkeeper = bookkeeper;
    }

    run() {
        for (let y = this.cfg.startYear; y <= this.cfg.endYear; y++) {
            this.bookkeeper.runYear(y);
        }
    }
}
