export class Base {
    toString() {
        const f = Object.entries(this).map(([k, v]) => `${k}=${v}`).join(' ');
        return `class=${this.constructor.name} ${f}`;
    }
}
