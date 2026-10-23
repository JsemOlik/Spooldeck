// Copies the ZXing WebAssembly reader into public/ so QR decoding never hits a CDN.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const src = join(dirname(require.resolve("zxing-wasm/package.json")), "dist/reader/zxing_reader.wasm");
mkdirSync("public/vendor", { recursive: true });
copyFileSync(src, "public/vendor/zxing_reader.wasm");
