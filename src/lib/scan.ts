import { SPOOL_CODE_RE, normalizeSpoolCode } from "./codes";
import { parsePrusamentUrl, type PrusamentRef } from "./prusament";

export type ScanTarget =
  | { kind: "prusament"; ref: PrusamentRef }
  | { kind: "code"; code: string }
  | { kind: "printer"; id: number }
  | { kind: "unknown"; text: string };

/**
 * Classifies scanned/pasted text: a Prusament URL, a Spooldeck spool label URL (…/s/CODE), a
 * printer label URL (…/p/ID) or a bare spool code.
 */
export function classifyScan(text: string): ScanTarget {
  const trimmed = text.trim();
  const prusa = parsePrusamentUrl(trimmed);
  if (prusa) return { kind: "prusament", ref: prusa };

  try {
    const url = new URL(trimmed);
    const m = /\/s\/([A-Za-z0-9]+)\/?$/.exec(url.pathname);
    if (m && SPOOL_CODE_RE.test(normalizeSpoolCode(m[1]))) return { kind: "code", code: normalizeSpoolCode(m[1]) };
    const p = /\/p\/([1-9][0-9]{0,8})\/?$/.exec(url.pathname);
    if (p) return { kind: "printer", id: Number(p[1]) };
  } catch {
    // not a URL
  }

  const bare = normalizeSpoolCode(trimmed.replace(/^#/, ""));
  if (SPOOL_CODE_RE.test(bare)) return { kind: "code", code: bare };
  return { kind: "unknown", text: trimmed };
}
