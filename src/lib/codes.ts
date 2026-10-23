import { randomInt } from "node:crypto";

// No 0/O, 1/I/L to keep codes readable when printed small.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const SPOOL_CODE_LENGTH = 6;

export function generateSpoolCode() {
  let code = "";
  for (let i = 0; i < SPOOL_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function normalizeSpoolCode(input: string) {
  return input.trim().toUpperCase();
}

export const SPOOL_CODE_RE = new RegExp(`^[${ALPHABET}]{${SPOOL_CODE_LENGTH}}$`);
