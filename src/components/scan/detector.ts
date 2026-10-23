"use client";

type Detected = { rawValue: string };
export type QrDetector = { detect: (source: ImageBitmapSource) => Promise<Detected[]> };

let detectorPromise: Promise<QrDetector> | null = null;

/** Native BarcodeDetector when it supports QR, otherwise the ZXing WASM ponyfill served from /vendor. */
export function getQrDetector(): Promise<QrDetector> {
  detectorPromise ??= (async () => {
    const Native = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): QrDetector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
    if (Native) {
      try {
        if ((await Native.getSupportedFormats()).includes("qr_code")) return new Native({ formats: ["qr_code"] });
      } catch {
        // fall through to the ponyfill
      }
    }
    const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/vendor/zxing_reader.wasm" : prefix + path),
      },
    });
    return new BarcodeDetector({ formats: ["qr_code"] }) as unknown as QrDetector;
  })();
  return detectorPromise;
}
