import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const KEY_LENGTH = 64;
const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, keylen, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

function options(N: number, r: number, p: number): ScryptOptions {
  return { N, r, p, maxmem: 128 * N * r * 2 };
}

/** Hash format: scrypt$N$r$p$<salt b64>$<hash b64> */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, options(PARAMS.N, PARAMS.r, PARAMS.p));
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const key = await scrypt(
    password,
    Buffer.from(saltB64, "base64"),
    expected.length,
    options(Number(n), Number(r), Number(p)),
  );
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const PASSWORD_MIN_LENGTH = 10;
