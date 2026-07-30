// Autosaves the form to the browser between visits, so closing the tab
// isn't the same as losing everything typed. Deliberately the raw
// readForm() input shape -- the same thing Export writes to a file -- so
// populateForm() can restore it with no separate migration path.
//
// The storage object is passed in rather than reaching for
// window.localStorage directly, same injection pattern chart.js uses for
// the Chart constructor: node --test has no localStorage, and a fake makes
// the round-trip testable without a browser.
export const STORAGE_KEY = 'retiresim.form';

// Storage writes throw in a few real situations (Safari's private mode,
// a full quota) and there is nothing useful to do about it here: autosave
// is a convenience, and breaking every keystroke because the backup
// failed would be worse than silently not backing up.
export function saveInput(storage, input) {
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(input));
        return true;
    } catch {
        return false;
    }
}

// null means "nothing to restore" -- either nothing saved yet, or a value
// that isn't parseable JSON (hand-edited, or written by an older version).
// A corrupt value starts the user with an empty form rather than a page
// that throws before it finishes loading.
export function loadInput(storage) {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}
