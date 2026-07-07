import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Config } from '../src/Config.js';

test('get returns the data stored under a name', () => {
    const c = new Config({ TraditionalIra: { withdraw: 300 } });
    assert.deepEqual(c.get('TraditionalIra'), { withdraw: 300 });
});

test('get returns undefined when nothing is stored under a name', () => {
    const c = new Config({ TraditionalIra: { withdraw: 300 } });
    assert.equal(c.get('Other'), undefined);
});
