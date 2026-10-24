import { deflateSync } from "node:zlib";

/** Builds a .bgcode file block by block, following libbgcode's binarize.cpp. */
export function bgcode(blocks: { type: number; text?: string; deflate?: boolean; size?: number }[], crc = true) {
  const parts: Uint8Array[] = [];
  const header = new DataView(new ArrayBuffer(10));
  [..."GCDE"].forEach((c, i) => header.setUint8(i, c.charCodeAt(0)));
  header.setUint32(4, 1, true);
  header.setUint16(8, crc ? 1 : 0, true);
  parts.push(new Uint8Array(header.buffer));
  for (const b of blocks) {
    const raw = b.text != null ? new TextEncoder().encode(b.text) : new Uint8Array(b.size ?? 64);
    const data = b.deflate ? new Uint8Array(deflateSync(raw)) : raw;
    const h = new DataView(new ArrayBuffer(b.deflate ? 12 : 8));
    h.setUint16(0, b.type, true);
    h.setUint16(2, b.deflate ? 1 : 0, true);
    h.setUint32(4, raw.length, true);
    if (b.deflate) h.setUint32(8, data.length, true);
    parts.push(new Uint8Array(h.buffer), new Uint8Array(b.type === 5 ? 6 : 2), data);
    if (crc) parts.push(new Uint8Array(4));
  }
  return new Blob(parts as BlobPart[]);
}
