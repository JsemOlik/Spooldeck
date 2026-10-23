import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    // SHA-256 hex of the cookie token; the raw token is never stored.
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const brands = sqliteTable("brands", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  website: text("website"),
  createdAt: createdAt(),
});

export const vendors = sqliteTable("vendors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  url: text("url"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const materials = sqliteTable("materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  density: real("density").notNull().default(1.24),
  nozzleMin: integer("nozzle_min"),
  nozzleMax: integer("nozzle_max"),
  bedMin: integer("bed_min"),
  bedMax: integer("bed_max"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const filaments = sqliteTable(
  "filaments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    brandId: integer("brand_id").references(() => brands.id, { onDelete: "set null" }),
    materialId: integer("material_id").references(() => materials.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    colorName: text("color_name"),
    colorHex: text("color_hex"),
    diameter: real("diameter").notNull().default(1.75),
    nominalWeight: integer("nominal_weight").notNull().default(1000),
    spoolWeight: integer("spool_weight"),
    nozzleMin: integer("nozzle_min"),
    nozzleMax: integer("nozzle_max"),
    bedMin: integer("bed_min"),
    bedMax: integer("bed_max"),
    dryingTemp: integer("drying_temp"),
    dryingHours: real("drying_hours"),
    maxSpeed: integer("max_speed"),
    fan: text("fan"),
    productUrl: text("product_url"),
    imageUrl: text("image_url"),
    prusamentGoodsId: integer("prusament_goods_id"),
    rating: integer("rating"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("filaments_goods_idx").on(t.prusamentGoodsId)],
);

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const SPOOL_STATUSES = ["sealed", "opened", "empty", "archived"] as const;
export type SpoolStatus = (typeof SPOOL_STATUSES)[number];

export const spools = sqliteTable(
  "spools",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    filamentId: integer("filament_id")
      .notNull()
      .references(() => filaments.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    prusamentSpoolId: text("prusament_spool_id"),
    initialWeight: integer("initial_weight").notNull(),
    spoolWeight: integer("spool_weight"),
    price: real("price"),
    currency: text("currency"),
    vendorId: integer("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    purchaseDate: text("purchase_date"),
    purchaseUrl: text("purchase_url"),
    manufactureDate: text("manufacture_date"),
    lengthM: real("length_m"),
    diameterAvg: real("diameter_avg"),
    diameterSd: real("diameter_sd"),
    ovality: real("ovality"),
    prusamentRaw: text("prusament_raw"),
    location: text("location"),
    status: text("status", { enum: SPOOL_STATUSES }).notNull().default("sealed"),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("spools_code_idx").on(t.code),
    uniqueIndex("spools_prusament_idx").on(t.prusamentSpoolId),
    index("spools_filament_idx").on(t.filamentId),
  ],
);

export const USAGE_KINDS = ["print", "adjustment", "weigh_in"] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

export const usageLogs = sqliteTable(
  "usage_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    spoolId: integer("spool_id")
      .notNull()
      .references(() => spools.id, { onDelete: "cascade" }),
    // Grams removed from the spool. Negative values add weight back (corrections).
    grams: real("grams").notNull(),
    kind: text("kind", { enum: USAGE_KINDS }).notNull().default("print"),
    printName: text("print_name"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("usage_spool_idx").on(t.spoolId), index("usage_created_idx").on(t.createdAt)],
);

export const filamentNotes = sqliteTable(
  "filament_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    filamentId: integer("filament_id")
      .notNull()
      .references(() => filaments.id, { onDelete: "cascade" }),
    spoolId: integer("spool_id").references(() => spools.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("notes_filament_idx").on(t.filamentId)],
);

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const labelTemplates = sqliteTable("label_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  widthMm: real("width_mm").notNull(),
  heightMm: real("height_mm").notNull(),
  layout: text("layout", { mode: "json" }).notNull(),
  sheet: text("sheet", { mode: "json" }),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type User = typeof users.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Material = typeof materials.$inferSelect;
export type Filament = typeof filaments.$inferSelect;
export type Spool = typeof spools.$inferSelect;
export type UsageLog = typeof usageLogs.$inferSelect;
export type FilamentNote = typeof filamentNotes.$inferSelect;
export type LabelTemplate = typeof labelTemplates.$inferSelect;
