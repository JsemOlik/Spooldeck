import { relations } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// By-default identity, so restoring a backup can insert its own ids.
const id = () => integer("id").primaryKey().generatedByDefaultAsIdentity();

const createdAt = () => ts("created_at").notNull().defaultNow();

const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 hex of the cookie token; the raw token is never stored.
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const brands = pgTable("brands", {
  id: id(),
  name: text("name").notNull().unique(),
  website: text("website"),
  createdAt: createdAt(),
});

export const vendors = pgTable("vendors", {
  id: id(),
  name: text("name").notNull().unique(),
  url: text("url"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const materials = pgTable("materials", {
  id: id(),
  name: text("name").notNull().unique(),
  density: doublePrecision("density").notNull().default(1.24),
  nozzleMin: integer("nozzle_min"),
  nozzleMax: integer("nozzle_max"),
  bedMin: integer("bed_min"),
  bedMax: integer("bed_max"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const filaments = pgTable(
  "filaments",
  {
    id: id(),
    brandId: integer("brand_id").references(() => brands.id, { onDelete: "set null" }),
    materialId: integer("material_id").references(() => materials.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    colorName: text("color_name"),
    colorHex: text("color_hex"),
    diameter: doublePrecision("diameter").notNull().default(1.75),
    nominalWeight: integer("nominal_weight").notNull().default(1000),
    spoolWeight: integer("spool_weight"),
    nozzleMin: integer("nozzle_min"),
    nozzleMax: integer("nozzle_max"),
    bedMin: integer("bed_min"),
    bedMax: integer("bed_max"),
    dryingTemp: integer("drying_temp"),
    dryingHours: doublePrecision("drying_hours"),
    maxSpeed: integer("max_speed"),
    fan: text("fan"),
    productUrl: text("product_url"),
    imageUrl: text("image_url"),
    prusamentGoodsId: integer("prusament_goods_id"),
    rating: integer("rating"),
    archived: boolean("archived").notNull().default(false),
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

export const spools = pgTable(
  "spools",
  {
    id: id(),
    filamentId: integer("filament_id")
      .notNull()
      .references(() => filaments.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    prusamentSpoolId: text("prusament_spool_id"),
    initialWeight: integer("initial_weight").notNull(),
    spoolWeight: integer("spool_weight"),
    price: doublePrecision("price"),
    currency: text("currency"),
    vendorId: integer("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    purchaseDate: text("purchase_date"),
    purchaseUrl: text("purchase_url"),
    manufactureDate: text("manufacture_date"),
    lengthM: doublePrecision("length_m"),
    diameterTolerance: doublePrecision("diameter_tolerance"),
    diameterSd: doublePrecision("diameter_sd"),
    ovality: doublePrecision("ovality"),
    prusamentRaw: text("prusament_raw"),
    location: text("location"),
    status: text("status", { enum: SPOOL_STATUSES }).notNull().default("sealed"),
    openedAt: ts("opened_at"),
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

export const usageLogs = pgTable(
  "usage_logs",
  {
    id: id(),
    spoolId: integer("spool_id")
      .notNull()
      .references(() => spools.id, { onDelete: "cascade" }),
    // Grams removed from the spool. Negative values add weight back (corrections).
    grams: doublePrecision("grams").notNull(),
    kind: text("kind", { enum: USAGE_KINDS }).notNull().default("print"),
    printName: text("print_name"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("usage_spool_idx").on(t.spoolId), index("usage_created_idx").on(t.createdAt)],
);

export const filamentNotes = pgTable(
  "filament_notes",
  {
    id: id(),
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

export const labelTemplates = pgTable("label_templates", {
  id: id(),
  name: text("name").notNull(),
  widthMm: doublePrecision("width_mm").notNull(),
  heightMm: doublePrecision("height_mm").notNull(),
  layout: jsonb("layout").notNull(),
  sheet: jsonb("sheet"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Printers (Klipper via Moonraker, Prusa via PrusaLink)
// ---------------------------------------------------------------------------

export const PRINTER_KINDS = ["moonraker", "prusalink"] as const;
export type PrinterKind = (typeof PRINTER_KINDS)[number];

/**
 * The print a printer is working on, as far as Spooldeck has counted it. `counter` is the
 * printer's own measure (Klipper: mm extruded; PrusaLink: fraction done) and `amounts` splits
 * it per tool. Each tool's open usage entry covers `amounts[tool] - bases[tool]`.
 */
export type PrinterJob = {
  key: string;
  file: string;
  counter: number;
  amounts: number[];
  bases: number[];
  entries: { tool: number; spoolId: number; usageId: number }[];
  /** PrusaLink: filament per tool read from the print file; null when it had no usage stats. */
  filaments?: { index: number; grams: number | null; cm3: number | null; mm: number | null }[] | null;
};

export const printers = pgTable("printers", {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind", { enum: PRINTER_KINDS }).notNull().default("moonraker"),
  // Moonraker's or PrusaLink's base URL, e.g. http://voron.local:7125
  url: text("url").notNull(),
  // PrusaLink sign-in name for Digest auth; the password is in apiKey.
  username: text("username"),
  apiKey: text("api_key"),
  // Toolheads (XL, toolchangers) or MMU slots; each can hold its own spool.
  tools: integer("tools").notNull().default(1),
  job: jsonb("job").$type<PrinterJob>(),
  createdAt: createdAt(),
});

/** Which spool is on which tool. A spool sits on one printer and tool at a time. */
export const printerSpools = pgTable(
  "printer_spools",
  {
    id: id(),
    printerId: integer("printer_id")
      .notNull()
      .references(() => printers.id, { onDelete: "cascade" }),
    tool: integer("tool").notNull().default(0),
    spoolId: integer("spool_id")
      .notNull()
      .references(() => spools.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("printer_spools_tool_idx").on(t.printerId, t.tool), uniqueIndex("printer_spools_spool_idx").on(t.spoolId)],
);

export type User = typeof users.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Material = typeof materials.$inferSelect;
export type Filament = typeof filaments.$inferSelect;
export type Spool = typeof spools.$inferSelect;
export type UsageLog = typeof usageLogs.$inferSelect;
export type FilamentNote = typeof filamentNotes.$inferSelect;
export type LabelTemplate = typeof labelTemplates.$inferSelect;
export type Printer = typeof printers.$inferSelect;
export type PrinterSpool = typeof printerSpools.$inferSelect;

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({ sessions: many(sessions) }));
export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
export const brandsRelations = relations(brands, ({ many }) => ({ filaments: many(filaments) }));
export const materialsRelations = relations(materials, ({ many }) => ({ filaments: many(filaments) }));
export const vendorsRelations = relations(vendors, ({ many }) => ({ spools: many(spools) }));
export const filamentsRelations = relations(filaments, ({ one, many }) => ({
  brand: one(brands, { fields: [filaments.brandId], references: [brands.id] }),
  material: one(materials, { fields: [filaments.materialId], references: [materials.id] }),
  spools: many(spools),
  notes: many(filamentNotes),
}));
export const spoolsRelations = relations(spools, ({ one, many }) => ({
  filament: one(filaments, { fields: [spools.filamentId], references: [filaments.id] }),
  vendor: one(vendors, { fields: [spools.vendorId], references: [vendors.id] }),
  usage: many(usageLogs),
  notes: many(filamentNotes),
}));
export const usageLogsRelations = relations(usageLogs, ({ one }) => ({
  spool: one(spools, { fields: [usageLogs.spoolId], references: [spools.id] }),
}));
export const filamentNotesRelations = relations(filamentNotes, ({ one }) => ({
  filament: one(filaments, { fields: [filamentNotes.filamentId], references: [filaments.id] }),
  spool: one(spools, { fields: [filamentNotes.spoolId], references: [spools.id] }),
}));
export const printersRelations = relations(printers, ({ many }) => ({ spools: many(printerSpools) }));
export const printerSpoolsRelations = relations(printerSpools, ({ one }) => ({
  printer: one(printers, { fields: [printerSpools.printerId], references: [printers.id] }),
  spool: one(spools, { fields: [printerSpools.spoolId], references: [spools.id] }),
}));
