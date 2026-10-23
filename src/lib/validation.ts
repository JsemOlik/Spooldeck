import { z } from "zod";
import { SPOOL_STATUSES } from "@/db/schema";

const str = (max = 200) => z.string().max(max, `At most ${max} characters`);
const optStr = (max = 200) => str(max).optional();
const num = () => z.coerce.number({ error: "Must be a number" });
const optInt = (min: number, max: number) =>
  num().int("Must be a whole number").min(min, `Min ${min}`).max(max, `Max ${max}`).optional();
const optNum = (min: number, max: number) => num().min(min, `Min ${min}`).max(max, `Max ${max}`).optional();
const optUrl = z.url({ protocol: /^https?$/, error: "Must be an http(s) URL" }).max(2000).optional();
const optDate = z.iso.date({ error: "Use YYYY-MM-DD" }).optional();
const optHex = z
  .string()
  .regex(/^#?[0-9a-fA-F]{6}$/, "Use a hex color like #ff8800")
  .transform((v) => `#${v.replace("#", "").toLowerCase()}`)
  .optional();

export const filamentSchema = z
  .object({
    brand: optStr(100),
    material: optStr(50),
    name: str(200).min(1, "Name is required"),
    colorName: optStr(100),
    colorHex: optHex,
    diameter: optNum(1, 3),
    nominalWeight: optInt(1, 100_000),
    spoolWeight: optInt(0, 10_000),
    nozzleMin: optInt(100, 500),
    nozzleMax: optInt(100, 500),
    bedMin: optInt(0, 200),
    bedMax: optInt(0, 200),
    dryingTemp: optInt(20, 150),
    dryingHours: optNum(0, 96),
    maxSpeed: optInt(1, 2000),
    fan: optStr(100),
    productUrl: optUrl,
    imageUrl: optUrl,
    rating: optInt(1, 5),
  })
  .refine((v) => v.nozzleMin == null || v.nozzleMax == null || v.nozzleMin <= v.nozzleMax, {
    path: ["nozzleMax"],
    message: "Max must be ≥ min",
  })
  .refine((v) => v.bedMin == null || v.bedMax == null || v.bedMin <= v.bedMax, {
    path: ["bedMax"],
    message: "Max must be ≥ min",
  });

export type FilamentInput = z.infer<typeof filamentSchema>;

export const spoolSchema = z.object({
  filamentId: num().int().positive("Pick a filament"),
  initialWeight: num().int("Whole grams").min(1, "Must be above 0").max(100_000),
  spoolWeight: optInt(0, 10_000),
  price: optNum(0, 1_000_000),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/, "3-letter code like EUR")
    .transform((v) => v.toUpperCase())
    .optional(),
  vendor: optStr(100),
  purchaseDate: optDate,
  purchaseUrl: optUrl,
  location: optStr(100),
  status: z.enum(SPOOL_STATUSES).optional(),
  notes: optStr(5000),
});

export const newSpoolSchema = spoolSchema.extend({
  quantity: optInt(1, 50),
  remaining: optNum(0, 100_000),
});

export const usageSchema = z.object({
  grams: num().min(0.1, "Enter the grams used").max(100_000),
  printName: optStr(200),
  note: optStr(2000),
});

export const weighInSchema = z.object({
  scaleGrams: num().min(0, "Must be ≥ 0").max(100_000),
  includesSpool: z.enum(["on", "off"]).optional(),
  note: optStr(2000),
});

export const noteSchema = z.object({
  body: str(5000).min(1, "Write something first"),
  spoolId: optInt(1, Number.MAX_SAFE_INTEGER),
});

/** Turns undefined into null so updates clear emptied fields. */
export function nullify<T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T]-?: undefined extends T[K] ? Exclude<T[K], undefined> | null : T[K] } {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === undefined ? null : v])) as never;
}

export const brandSchema = z.object({ name: str(100).min(1, "Name is required"), website: optUrl });

export const vendorSchema = z.object({
  name: str(100).min(1, "Name is required"),
  url: optUrl,
  notes: optStr(1000),
});

export const materialSchema = z
  .object({
    name: str(50).min(1, "Name is required"),
    density: num().min(0.5, "Min 0.5").max(3, "Max 3"),
    nozzleMin: optInt(100, 500),
    nozzleMax: optInt(100, 500),
    bedMin: optInt(0, 200),
    bedMax: optInt(0, 200),
    notes: optStr(1000),
  })
  .refine((v) => v.nozzleMin == null || v.nozzleMax == null || v.nozzleMin <= v.nozzleMax, {
    path: ["nozzleMax"],
    message: "Must be ≥ min",
  })
  .refine((v) => v.bedMin == null || v.bedMax == null || v.bedMin <= v.bedMax, {
    path: ["bedMax"],
    message: "Must be ≥ min",
  });

export const appSettingsSchema = z.object({
  currency: z
    .string({ error: "Currency is required" })
    .transform((v) => v.toUpperCase())
    .refine((v) => {
      if (!/^[A-Z]{3}$/.test(v)) return false;
      try {
        new Intl.NumberFormat("en", { style: "currency", currency: v });
        return true;
      } catch {
        return false;
      }
    }, "Use a 3-letter currency code like EUR or USD"),
  lowStockGrams: num().int("Must be a whole number").min(0, "Min 0").max(10_000, "Max 10000"),
  publicUrl: z
    .url({ protocol: /^https?$/, error: "Must be an http(s) URL like https://spools.example.com" })
    .max(500)
    .transform((v) => v.replace(/\/+$/, ""))
    .optional(),
});
