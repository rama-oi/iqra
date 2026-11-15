import pkg from "../../package.json" with { type: "json" };

// package.json is the only source for these. Import APP rather than package.json
// itself, so the path to it appears in one place.
export const APP = Object.freeze({
  // npm names are lowercase ("iqra"); the display name is the same word capitalized.
  name: pkg.name[0].toUpperCase() + pkg.name.slice(1),
  version: pkg.version,
  description: pkg.description,
  license: pkg.license,
});
