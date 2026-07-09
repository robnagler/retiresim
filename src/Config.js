import { Base } from './Base.js';

export class Config extends Base {
    constructor(data) {
        super();
        this.data = data;
    }

    get(name) {
        return this.data[name];
    }

    set(name, value) {
        this.data[name] = value;
    }
}
