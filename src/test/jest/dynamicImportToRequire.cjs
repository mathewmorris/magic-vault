/**
 * Jest transform for PGlite's CommonJS build. It loads Node built-ins with
 * `import("fs/promises")`, which Jest's CommonJS runtime refuses without
 * --experimental-vm-modules. Swapping each literal dynamic import of a
 * built-in for a resolved require keeps the tests on plain CommonJS.
 *
 * The bundle declares its own `var require` in places, so the module's real
 * require is captured under another name first.
 */
const { builtinModules } = require("node:module");
const { createHash } = require("node:crypto");

const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const DYNAMIC_IMPORT = /\bimport\(\s*(["'])([^"']+)\1\s*\)/g;

module.exports = {
  /** @param {string} source */
  process(source) {
    const replaced = source.replace(DYNAMIC_IMPORT, (/** @type {string} */ match, /** @type {string} */ quote, /** @type {string} */ specifier) =>
      builtins.has(specifier) ? `Promise.resolve(__jestRequire(${quote}${specifier}${quote}))` : match,
    );
    // One line, so stack traces keep their line numbers.
    return { code: `const __jestRequire = require;${replaced}` };
  },
  /**
   * @param {string} source
   * @param {string} filename
   */
  getCacheKey(source, filename) {
    return createHash("sha1").update("dynamicImportToRequire-v2").update(filename).update(source).digest("hex");
  },
};
