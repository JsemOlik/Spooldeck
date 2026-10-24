import { ASCII_HEAD_BYTES, ASCII_TAIL_BYTES, BGCODE_MAGIC, type SliceInfo, parseSlicedFile } from "./parse";

/**
 * Reads filament usage from a print file as it downloads, without keeping the whole file: a
 * .bgcode is read up to its first G-code block (the metadata comes before it), and of a plain
 * G-code file only the start and the last megabyte are kept, which is where PrusaSlicer writes
 * its stats.
 */

const BLOCK_GCODE = 1;
const BLOCK_THUMBNAIL = 5;
const FILE_HEADER_BYTES = 10;
/** A .bgcode with no G-code block this far in is read no further. */
const BGCODE_LIMIT = 64 * 1024 * 1024;

export async function parseSlicedStream(stream: ReadableStream<Uint8Array>, fileName: string): Promise<SliceInfo> {
  const reader = stream.getReader();
  let head = new Uint8Array(0);
  let buffer = new Uint8Array(0);
  let format: "gcode" | "bgcode" | null = null;
  const tail: Uint8Array[] = [];
  let tailSize = 0;
  // .bgcode: where the next block header starts, and the size of each block's checksum.
  let next = FILE_HEADER_BYTES;
  let checksumSize = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (format === "gcode") {
        tail.push(value);
        tailSize += value.length;
        // Drop whole chunks from the front while the rest still covers the last megabyte.
        while (tail.length > 1 && tailSize - tail[0].length >= ASCII_TAIL_BYTES) tailSize -= tail.shift()!.length;
        continue;
      }

      // Grow by doubling so a long run of thumbnails doesn't copy the buffer once per chunk.
      if (head.length + value.length > buffer.length) {
        const bigger = new Uint8Array(Math.max(2 * buffer.length, head.length + value.length, 256 * 1024));
        bigger.set(head);
        buffer = bigger;
      }
      buffer.set(value, head.length);
      head = buffer.subarray(0, head.length + value.length);
      if (format === null) {
        if (head.length < FILE_HEADER_BYTES) continue;
        format = new TextDecoder().decode(head.subarray(0, 4)) === BGCODE_MAGIC ? "bgcode" : "gcode";
        if (format === "gcode") {
          if (head.length > ASCII_HEAD_BYTES) {
            tail.push(head.subarray(ASCII_HEAD_BYTES));
            tailSize = head.length - ASCII_HEAD_BYTES;
            head = head.subarray(0, ASCII_HEAD_BYTES);
          }
          continue;
        }
        checksumSize = new DataView(head.buffer, head.byteOffset).getUint16(8, true) === 1 ? 4 : 0;
      }

      const walked = walkBlocks(head, next, checksumSize);
      next = walked.next;
      if (walked.atGcode) return await parseSlicedFile(new Blob([head.subarray(0, next) as BlobPart]), fileName);
      if (head.length >= BGCODE_LIMIT) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return parseSlicedFile(new Blob([head, ...tail] as BlobPart[]), fileName);
}

/** Steps over complete block headers from `offset`; `atGcode` once the next block is G-code. */
function walkBlocks(bytes: Uint8Array, offset: number, checksumSize: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let next = offset;
  while (next + 2 <= bytes.length) {
    const type = view.getUint16(next, true);
    if (type === BLOCK_GCODE) return { atGcode: true, next };
    if (next + 12 > bytes.length) break;
    const compression = view.getUint16(next + 2, true);
    const dataSize = compression === 0 ? view.getUint32(next + 4, true) : view.getUint32(next + 8, true);
    const headerSize = compression === 0 ? 8 : 12;
    next += headerSize + (type === BLOCK_THUMBNAIL ? 6 : 2) + dataSize + checksumSize;
  }
  return { atGcode: false, next };
}
