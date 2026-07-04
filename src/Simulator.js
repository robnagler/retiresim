export class Simulator {
    constructor({ bookkeeper, startYear, endYear }) {
        this.bookkeeper = bookkeeper;
        this.startYear = startYear;
        this.endYear = endYear;
    }

    run() {
        for (let y = this.startYear; y <= this.endYear; y++) {
            this.bookkeeper.runYear(y);
        }
    }
}
