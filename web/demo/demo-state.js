// Shared singleton holder: demo-boot installs the shim store, main.js reads
// it. Module-level indirection (instead of a direct import) because main.js
// evaluates before demo-boot.js runs -- all reads are lazy inside functions,
// so the store is always set before the first call. Falls back to null when
// the boot module is absent (bare-scene development).
let store = null;

export function setDemoStore(s) {
  store = s;
}

export function getDemoStore() {
  return store;
}
