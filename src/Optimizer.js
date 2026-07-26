import { Base } from './Base.js';

// Deliberately knows nothing about Config/Bookkeeper/Simulator/netWorth --
// a tiny brute-force search over caller-supplied candidates and a
// caller-supplied scoring function, so it stays reusable for every future
// decision variable (and later, combinations of variables) without
// changes. The caller owns turning a candidate into a score (e.g. cloning
// a config, running a Simulator, reading bookkeeper.netWorth()).
export class Optimizer extends Base {
    // candidates: any non-empty array. evaluate(candidate) -> number,
    // higher is better.
    run(candidates, evaluate) {
        const all = candidates.map((candidate) => ({ candidate, score: evaluate(candidate) }));
        const best = all.reduce((a, b) => (b.score > a.score ? b : a));
        return { best: best.candidate, score: best.score, all };
    }
}
