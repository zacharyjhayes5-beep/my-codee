import "fake-indexeddb/auto";

/**
 * Tests run in Node, which has neither IndexedDB nor localStorage. The import
 * above installs a real IndexedDB implementation — the repository's own
 * database code runs unmodified, so the migration tests exercise the same
 * path the browser does rather than a stand-in.
 *
 * localStorage only needs to behave like a string map, so a shim is enough.
 */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length() {
    return this.map.size;
  }

  clear() {
    this.map.clear();
  }

  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.map.delete(key);
  }

  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
});
