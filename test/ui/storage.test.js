import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, loadInput, saveInput } from '../../src/ui/storage.js';

// Stands in for window.localStorage, which node --test has no version of --
// same "fake collaborator, not the real dependency" pattern as
// test/support/FakeBookkeeper.js and chart.test.js's fake Chart.
class FakeStorage {
    constructor(initial = {}) {
        this.items = { ...initial };
    }

    getItem(key) {
        return key in this.items ? this.items[key] : null;
    }

    setItem(key, value) {
        this.items[key] = value;
    }
}

class FullStorage extends FakeStorage {
    setItem() {
        throw new Error('QuotaExceededError');
    }
}

test('saveInput then loadInput round-trips the form input', () => {
    const storage = new FakeStorage();
    const input = { birthYear: 1960, taxableBalance: 250000, inflation: 0.025 };

    assert.equal(saveInput(storage, input), true);

    assert.deepEqual(loadInput(storage), input);
});

test('saveInput writes JSON under one known key, so Export/Import and autosave stay the same shape', () => {
    const storage = new FakeStorage();

    saveInput(storage, { birthYear: 1960 });

    assert.equal(storage.items[STORAGE_KEY], '{"birthYear":1960}');
});

test('loadInput returns null when nothing has been saved yet', () => {
    assert.equal(loadInput(new FakeStorage()), null);
});

test('loadInput returns null rather than throwing on a corrupt value, so a bad entry cannot break page load', () => {
    assert.equal(loadInput(new FakeStorage({ [STORAGE_KEY]: 'not json{' })), null);
});

test('saveInput reports failure instead of throwing when storage refuses the write -- autosave is a convenience, not a reason to break typing', () => {
    assert.equal(saveInput(new FullStorage(), { birthYear: 1960 }), false);
});
