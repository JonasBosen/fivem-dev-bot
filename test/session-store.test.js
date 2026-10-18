const { test } = require('node:test'), assert = require('node:assert/strict');
const { DbSessionStore, keyFor } = require('../src/web/session-store');

// Minimal db-stand-in med de to godkendte SQL-sætninger, som lageret bruger.
function fakeDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return {
        async get(id) { return rows.has(id) ? { data: rows.get(id) } : undefined; },
        async run(id, data) { assert.match(sql, /^INSERT INTO settings/); rows.set(id, data); return { changes: 1 }; },
      };
    },
  };
}
const call = (fn, ...args) => new Promise((resolve, reject) => fn(...args, (error, value) => error ? reject(error) : resolve(value)));

test('sessions gemmes, læses, udløber og kan ødelægges i databasen', async () => {
  let now = 1_000_000;
  const db = fakeDb(), store = new DbSessionStore(db, { now: () => now, ttl: 1000 });
  const sess = { cookie: { expires: new Date(now + 5000).toISOString() }, user: { id: '1' } };

  assert.equal(await call(store.get.bind(store), 'abc'), null);
  await call(store.set.bind(store), 'abc', sess);
  assert.deepEqual(await call(store.get.bind(store), 'abc'), sess);
  assert.ok([...db.rows.keys()].every((key) => key.startsWith('session:') && !key.includes('abc')), 'sessions-ID må ikke stå i klartekst');
  assert.notEqual(keyFor('abc'), keyFor('abd'));

  now += 6000;
  assert.equal(await call(store.get.bind(store), 'abc'), null);

  await call(store.set.bind(store), 'def', { cookie: {}, user: { id: '2' } });
  assert.equal((await call(store.get.bind(store), 'def')).user.id, '2');
  await call(store.destroy.bind(store), 'def');
  assert.equal(await call(store.get.bind(store), 'def'), null);
});

test('databasefejl sendes videre til express-session', async () => {
  const store = new DbSessionStore({ prepare: () => ({ get: async () => { throw new Error('nede'); }, run: async () => { throw new Error('nede'); } }) });
  await assert.rejects(call(store.get.bind(store), 'x'), /nede/);
  await assert.rejects(call(store.set.bind(store), 'x', { cookie: {} }), /nede/);
});
