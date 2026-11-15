// True when every space-separated term of `query` appears (case-insensitive)
// somewhere in the given fields. Fields can be strings, numbers or arrays of them.
export function matches(query, ...fields) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = fields.flat().filter((v) => v != null).join("\n").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
