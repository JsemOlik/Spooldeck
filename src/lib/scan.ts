import { SPOOL_CODE_RE, normalizeSpoolCode } from "./codes";
import { parsePrusamentUrl, type PrusamentRef } from "./prusament";

export type ScanTarget =
  | { kind: "prusament"; ref: PrusamentRef }
  | { kind: "code"; code: string }
  | { kind: "unknown"; text: string };

/** Classifies scanned/pasted text: a Prusament URL, a Spooldeck label URL (…/s/CODE) or a bare code. */
export function classifyScan(text: string): ScanTarget {
  const trimmed = text.trim();
  const prusa = parsePrusamentUrl(trimmed);
  if (prusa) return { kind: "prusament", ref: prusa };

  try {
    const url = new URL(trimmed);
    const m = /\/s\/([A-Za-z0-9]+)\/?$/.exec(url.pathname);
    if (m && SPOOL_CODE_RE.test(normalizeSpoolCode(m[1]))) return { kind: "code", code: normalizeSpoolCode(m[1]) };
  } catch {
    // not a URL
  }

  const bare = normalizeSpoolCode(trimmed.replace(/^#/, ""));
  if (SPOOL_CODE_RE.test(bare)) return { kind: "code", code: bare };
  return { kind: "unknown", text: trimmed };
}
