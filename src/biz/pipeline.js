import { Config } from './Config.js';
import { Bookkeeper } from './Bookkeeper.js';

// The one place a plan becomes a running simulation. Every caller that
// wants to simulate something -- the optimizer scoring a candidate, the
// robustness validator running a trial, the CLI printing a year-by-year
// report, the browser drawing a chart -- needs the same three lines, and
// each used to write them out again. What differs between them is only
// what they do with the result.
//
// classes travels with the data because Bookkeeper resolves each entry's
// class name through it, and the CLI and the browser pass different
// registries. That is the only real difference between the two.
//
// Clones configData rather than trusting the caller not to reuse it: the
// optimizer builds one of these per candidate from a shared base config,
// and Bookkeeper writes each entry back through config.set() as it builds.
export function buildPipeline(configData, classes) {
    const config = new Config(structuredClone(configData));
    return { config, bookkeeper: new Bookkeeper({ config, classes }) };
}

// One candidate applied to a plan, as new data -- the substitution the
// optimizer's search does, kept separate from building the pipeline so
// that everything else can build one without inventing a variable and a
// candidate it does not have.
export function candidateConfigData(configData, variable, candidate) {
    const rv = structuredClone(configData);
    variable.apply(rv, candidate);
    return rv;
}
