export default class Enum {
  #forward = new Map();
  #backward = new Map();

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

  get(x) {
    return this.#forward.has(x) ? this.#forward.get(x) : this.#backward.get(x);
  }

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
