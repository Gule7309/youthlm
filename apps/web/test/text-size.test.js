import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.js';

const {
  TEXT_SIZE_STORAGE_KEY,
  isTextSize,
  readTextSizePreference,
  writeTextSizePreference,
} = await loadTs('../src/app/text-size.ts');

test('text size preference defaults safely and persists all supported sizes', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(readTextSizePreference(storage), 'small');
  for (const value of ['small', 'medium', 'large', 'extra-large']) {
    assert.equal(isTextSize(value), true);
    writeTextSizePreference(storage, value);
    assert.equal(values.get(TEXT_SIZE_STORAGE_KEY), value);
    assert.equal(readTextSizePreference(storage), value);
  }

  values.set(TEXT_SIZE_STORAGE_KEY, 'giant');
  assert.equal(readTextSizePreference(storage), 'small');
  assert.equal(readTextSizePreference({ getItem: () => { throw new Error('blocked'); } }), 'small');
});
