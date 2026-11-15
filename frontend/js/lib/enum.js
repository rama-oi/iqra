// A two-way lookup: `new Enum({ a: "A" })` makes get("a") === "A" and get("A") === "a".
// Use it for keys that also have a display label (areas, states, ref types...).
//
// Both sides must be unique and no value may also be a key of another pair,
// otherwise get() could not tell which direction you meant. That is checked
// once, in the constructor, so a bad table fails at startup.
export default class Enum {
  #forward = new Map(); // key -> value
  #backward = new Map(); // value -> key

  constructor(pairs) {
    const entries = Array.isArray(pairs) ? pairs : Object.entries(pairs);
    for (const [key, value] of entries) {
      if (this.#forward.has(key) || this.#backward.has(key)) {
        throw new Error(`Enum: "${key}" is already used`);
      }
      if (this.#forward.has(value) || this.#backward.has(value)) {
        throw new Error(`Enum: "${value}" is already used`);
      }
      if (key === value) throw new Error(`Enum: "${key}" maps to itself`);
      this.#forward.set(key, value);
      this.#backward.set(value, key);
    }
  }

  // The other side of `x`, whichever side `x` is on. undefined when unknown.
  get(x) {
    return this.#forward.has(x) ? this.#forward.get(x) : this.#backward.get(x);
  }

  // has() accepts either side; use hasKey() to validate input that must be a key.
  has(x) {
    return this.#forward.has(x) || this.#backward.has(x);
  }
  hasKey(key) {
    return this.#forward.has(key);
  }
  hasValue(value) {
    return this.#backward.has(value);
  }

  keys() {
    return [...this.#forward.keys()];
  }
  values() {
    return [...this.#forward.values()];
  }
  entries() {
    return [...this.#forward.entries()];
  }
  [Symbol.iterator]() {
    return this.#forward.entries();
  }
}
