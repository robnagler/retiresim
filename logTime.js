import { readFileSync } from 'node:fs';

const PROMPT_SECONDS = 30;
const FALLBACK_SECONDS = 20;
const GAP_LIMIT_MS = 10 * 60 * 1000;
const PRE_LOGGING_HOUR_SECONDS = 3600;

const path = process.argv[2] ?? 'log.md';
const dateRe = /^##\s+(\d{4}-\d{2}-\d{2})/;
const entryRe = /^\*\s+(\d{2}:\d{2}:\d{2})\s+\*\*(\w+)\*\*:/;

const entries = [];
let skipped = 0;
let date = null;
for (const line of readFileSync(path, 'utf8').split('\n')) {
    const d = line.match(dateRe);
    if (d) {
        date = d[1];
        continue;
    }
    const e = line.match(entryRe);
    if (e && date) {
        entries.push({ date, time: e[1], type: e[2], when: new Date(`${date}T${e[1]}`) });
    } else if (line.match(/^\*\s+/)) {
        skipped += 1;
    }
}
entries.reverse();

let userSeconds = 0;
let agentSeconds = 0;
let promptCount = 0;

for (let i = 0; i < entries.length; i += 1) {
    const p = entries[i];
    if (p.type !== 'Prompt') {
        continue;
    }
    promptCount += 1;
    userSeconds += PROMPT_SECONDS;
    let cost = FALLBACK_SECONDS;
    let last = p.when;
    for (let j = i + 1; j < entries.length; j += 1) {
        const n = entries[j];
        if (n.type === 'Prompt') {
            break;
        }
        if (n.date !== p.date || n.when - last > GAP_LIMIT_MS) {
            break;
        }
        last = n.when;
        cost = (n.when - p.when) / 1000;
    }
    agentSeconds += cost;
}

const daysWithPrompts = new Set(entries.filter((e) => e.type === 'Prompt').map((e) => e.date));
const allDays = new Set(entries.map((e) => e.date));
const preLoggingDays = [...allDays].filter((d) => !daysWithPrompts.has(d));
userSeconds += preLoggingDays.length * PRE_LOGGING_HOUR_SECONDS;
agentSeconds += preLoggingDays.length * PRE_LOGGING_HOUR_SECONDS;

const fmt = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.round(s % 60);
    return `${h}h ${m}m ${sec}s`;
};

console.log(`prompts analyzed: ${promptCount} (skipped ${skipped} untimestamped entries)`);
if (preLoggingDays.length > 0) {
    console.log(`pre-logging days (flat 1h/1h each): ${preLoggingDays.join(', ')}`);
}
console.log(`your time (${PROMPT_SECONDS}s/prompt):  ${fmt(userSeconds)}`);
console.log(`my time (prompt-to-update, ${FALLBACK_SECONDS}s fallback): ${fmt(agentSeconds)}`);
