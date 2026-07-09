export class Base {
    constructor({ name, config } = {}) {
        if (name) {
            this.name = name;
        }
        if (config) {
            this.cfg = config.get(this.name ?? this.constructor.name);
        }
    }

    toString() {
        const f = Object.entries(this).map(([k, v]) => `${k}=${v}`).join(' ');
        return `class=${this.constructor.name} ${f}`;
    }
}
