export class Base {
    constructor({ name, config } = {}) {
        this.name = name ?? this.constructor.name;
        if (config) {
            this.cfg = config.get(this.name);
        }
    }

    toString() {
        const f = Object.entries(this)
            .filter(([k]) => k !== 'name' && k !== 'cfg')
            .map(([k, v]) => `${k}=${v}`)
            .join(' ');
        return `class=${this.constructor.name} name=${this.name} ${f}`;
    }
}
