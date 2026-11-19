import pkg from "../../package.json" with { type: "json" };

export const APP = Object.freeze({
  name: pkg.name[0].toUpperCase() + pkg.name.slice(1),
  version: pkg.version,
  description: pkg.description,
  license: pkg.license,
});
