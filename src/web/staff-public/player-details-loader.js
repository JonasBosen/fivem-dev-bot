(function(root) {
  function createPlayerDetailsLoader(fetchDetails, { ttlMs = 15000, now = Date.now } = {}) {
    let cached = null;
    function load() {
      if (cached && (cached.pending || now() < cached.expires)) return cached.promise;
      const entry = { pending: true, expires: 0 };
      cached = entry;
      entry.promise = Promise.resolve().then(fetchDetails).then(rows => {
        entry.pending = false;
        entry.expires = now() + ttlMs;
        return rows || [];
      }).catch(error => {
        if (cached === entry) cached = null;
        throw error;
      });
      return entry.promise;
    }
    load.invalidate = () => { cached = null; };
    return load;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createPlayerDetailsLoader };
  else root.createPlayerDetailsLoader = createPlayerDetailsLoader;
})(typeof window !== 'undefined' ? window : globalThis);
