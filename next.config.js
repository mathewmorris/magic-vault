/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
// await import("./src/env");

const path = require("path");

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cards.scryfall.io',
      },
    ],
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // OpenCV.js (card edge detection) has a Node code path that requires
      // fs, path and crypto. It never runs in the browser, so leave those out
      // rather than bundling Next's ~325 kB crypto polyfill with it.
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^(fs|path|crypto)$/,
          contextRegExp: /@techstark[\\/]opencv-js/,
        }),
      );
      // Use the ONNX Runtime build that loads its .wasm and glue script from
      // env.wasm.wasmPaths (jsDelivr, see src/utils/recognition/browser/ort.ts)
      // instead of the default one that makes webpack emit a ~30 MB .wasm.
      config.resolve.alias = {
        ...config.resolve.alias,
        "onnxruntime-web$": path.join(path.dirname(require.resolve("onnxruntime-web")), "ort.min.mjs"),
      };
    }
    return config;
  },
};

module.exports = config;

