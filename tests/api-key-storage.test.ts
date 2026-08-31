import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeStoredKey, encodeStoredKey, persistStoredKey, readStoredKey } from '../src/lib/api-key-storage.ts';

const createStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};

test('stored key encoding round-trips and rejects malformed data', () => {
  assert.equal(decodeStoredKey(encodeStoredKey('secret-key')), 'secret-key');
  assert.equal(decodeStoredKey('%%%'), '');
});

test('session storage is preferred unless device persistence is requested', () => {
  const session = createStorage();
  const local = createStorage();
  persistStoredKey('session-key', 'session', 'local', false, session, local);
  assert.equal(readStoredKey('session', 'local', session, local), 'session-key');
  assert.equal(local.getItem('local'), null);

  persistStoredKey('local-key', 'session', 'local', true, session, local);
  assert.equal(readStoredKey('session', 'local', session, local), 'local-key');
  assert.equal(session.getItem('session'), null);
});
