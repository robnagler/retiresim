import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportFileName } from '../../src/ui/fileName.js';

// Built from local parts, so these assertions hold in any timezone -- the
// same reason the implementation reads local getters rather than the UTC
// ones. Month is zero-based in the constructor: 6 is July.
test('exportFileName stamps the local date and time into the name', () => {
    assert.equal(exportFileName(new Date(2026, 6, 30, 14, 38, 0)), 'retiresim-20260730T143800.json');
});

test('exportFileName pads every field to two digits, so the names stay the same length and sort correctly', () => {
    assert.equal(exportFileName(new Date(2026, 0, 5, 9, 7, 3)), 'retiresim-20260105T090703.json');
});

test('exportFileName orders the parts largest first, so sorting a directory by name sorts it by age', () => {
    const earlier = exportFileName(new Date(2026, 6, 30, 9, 0, 0));
    const later = exportFileName(new Date(2026, 6, 30, 14, 38, 0));
    const nextYear = exportFileName(new Date(2027, 0, 1, 0, 0, 0));

    assert.deepEqual([later, nextYear, earlier].sort(), [earlier, later, nextYear]);
});

test('exportFileName is a .json file, since that is what Import reads', () => {
    assert.match(exportFileName(new Date(2026, 6, 30, 14, 38, 0)), /\.json$/);
});
