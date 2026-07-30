import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIELD_HELP } from '../../src/ui/help.js';

// Every user-facing field has a <label for="...">, and only those fields
// do -- the hidden file input behind the Import button has none -- so the
// labels are the definitive list of what needs explaining.
const labeledIds = [...readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
    .matchAll(/<label for="([^"]+)"/g)].map((m) => m[1]);

test('index.html has labeled fields to check against -- guards the regex above from silently matching nothing', () => {
    // Only the form's own fields are counted. Per-account fields are built
    // into the dialog by app.js from accountTypes.js, so they never appear
    // in this file and are covered by accountTypes.test.js instead.
    assert.ok(labeledIds.length >= 5, `labeledIds.length=${labeledIds.length}`);
});

test('every labeled form field has help text, so adding a field without explaining it fails here', () => {
    assert.deepEqual(labeledIds.filter((id) => FIELD_HELP[id] === undefined), []);
});

test('every help entry names a field that exists, so a renamed or deleted field does not leave orphan text behind', () => {
    assert.deepEqual(Object.keys(FIELD_HELP).filter((id) => !labeledIds.includes(id)), []);
});

test('help text is plain prose -- app.js sets it via textContent and title, neither of which renders markup', () => {
    assert.deepEqual(Object.entries(FIELD_HELP).filter(([, text]) => /[<>]/.test(text)), []);
});
