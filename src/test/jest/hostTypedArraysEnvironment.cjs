/**
 * Jest's node environment with the host's typed array constructors.
 *
 * Native addons (onnxruntime-node) build their output tensors from the
 * host's Float32Array, while code under test sees the sandbox's own copy, so
 * `instanceof Float32Array` checks fail across the two. Sharing the host's
 * constructors makes both sides agree. Opt in per file with
 * `@jest-environment ./src/test/jest/hostTypedArraysEnvironment.cjs`.
 */
const NodeEnvironment = require("jest-environment-node").TestEnvironment;

const SHARED = [
  "ArrayBuffer",
  "SharedArrayBuffer",
  "DataView",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
];

class HostTypedArraysEnvironment extends NodeEnvironment {
  /**
   * @param {ConstructorParameters<typeof NodeEnvironment>[0]} config
   * @param {ConstructorParameters<typeof NodeEnvironment>[1]} context
   */
  constructor(config, context) {
    super(config, context);
    /** @type {Record<string, unknown>} */
    const host = globalThis;
    /** @type {Record<string, unknown>} */
    const sandbox = this.global;
    for (const name of SHARED) {
      if (typeof host[name] === "function") sandbox[name] = host[name];
    }
  }
}

module.exports = HostTypedArraysEnvironment;
