export function matches(query, ...fields) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = fields
    .flat()
    .filter((v) => v != null)
    .join("\n")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
