import { describe, expect, test } from "bun:test";
import { generateSpoolCode, normalizeSpoolCode, SPOOL_CODE_RE } from "@/lib/codes";
import { classifyScan } from "@/lib/scan";

describe("classifyScan", () => {
  test("recognises Prusament URLs", () => {
    expect(classifyScan("https://prusament.com/spool/19591/599d7dba02/")).toEqual({
      kind: "prusament",
      ref: { goodsId: 19591, spoolId: "599d7dba02" },
    });
  });

  test("recognises Spooldeck label URLs on any host", () => {
    expect(classifyScan("https://spools.example.com/s/RPRNFV")).toEqual({ kind: "code", code: "RPRNFV" });
    expect(classifyScan("http://192.168.1.5:3000/s/rprnfv/")).toEqual({ kind: "code", code: "RPRNFV" });
  });

  test("recognises bare codes, with or without #", () => {
    expect(classifyScan("rprnfv")).toEqual({ kind: "code", code: "RPRNFV" });
    expect(classifyScan(" #GDHEQV ")).toEqual({ kind: "code", code: "GDHEQV" });
  });

  test("rejects anything else", () => {
    expect(classifyScan("hello world").kind).toBe("unknown");
    expect(classifyScan("https://example.com/s/TOOLONGCODE").kind).toBe("unknown");
    expect(classifyScan("ABC10O").kind).toBe("unknown"); // 0, 1 and O aren't in the alphabet
    expect(classifyScan("").kind).toBe("unknown");
  });
});

describe("spool codes", () => {
  test("generated codes match the code format and avoid ambiguous characters", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateSpoolCode();
      expect(code).toMatch(SPOOL_CODE_RE);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  test("normalizeSpoolCode trims and uppercases", () => {
    expect(normalizeSpoolCode(" abc23x ")).toBe("ABC23X");
  });
});
