CREATE TABLE `brands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brands_name_unique` ON `brands` (`name`);--> statement-breakpoint
CREATE TABLE `filament_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filament_id` integer NOT NULL,
	`spool_id` integer,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`filament_id`) REFERENCES `filaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`spool_id`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notes_filament_idx` ON `filament_notes` (`filament_id`);--> statement-breakpoint
CREATE TABLE `filaments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`brand_id` integer,
	`material_id` integer,
	`name` text NOT NULL,
	`color_name` text,
	`color_hex` text,
	`diameter` real DEFAULT 1.75 NOT NULL,
	`nominal_weight` integer DEFAULT 1000 NOT NULL,
	`spool_weight` integer,
	`nozzle_min` integer,
	`nozzle_max` integer,
	`bed_min` integer,
	`bed_max` integer,
	`drying_temp` integer,
	`drying_hours` real,
	`max_speed` integer,
	`fan` text,
	`product_url` text,
	`image_url` text,
	`prusament_goods_id` integer,
	`rating` integer,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `filaments_goods_idx` ON `filaments` (`prusament_goods_id`);--> statement-breakpoint
CREATE TABLE `label_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`width_mm` real NOT NULL,
	`height_mm` real NOT NULL,
	`layout` text NOT NULL,
	`sheet` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`density` real DEFAULT 1.24 NOT NULL,
	`nozzle_min` integer,
	`nozzle_max` integer,
	`bed_min` integer,
	`bed_max` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `materials_name_unique` ON `materials` (`name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filament_id` integer NOT NULL,
	`code` text NOT NULL,
	`prusament_spool_id` text,
	`initial_weight` integer NOT NULL,
	`spool_weight` integer,
	`price` real,
	`currency` text,
	`vendor_id` integer,
	`purchase_date` text,
	`purchase_url` text,
	`manufacture_date` text,
	`length_m` real,
	`diameter_avg` real,
	`diameter_sd` real,
	`ovality` real,
	`prusament_raw` text,
	`location` text,
	`status` text DEFAULT 'sealed' NOT NULL,
	`opened_at` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`filament_id`) REFERENCES `filaments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spools_code_idx` ON `spools` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `spools_prusament_idx` ON `spools` (`prusament_spool_id`);--> statement-breakpoint
CREATE INDEX `spools_filament_idx` ON `spools` (`filament_id`);--> statement-breakpoint
CREATE TABLE `usage_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`spool_id` integer NOT NULL,
	`grams` real NOT NULL,
	`kind` text DEFAULT 'print' NOT NULL,
	`print_name` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`spool_id`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `usage_spool_idx` ON `usage_logs` (`spool_id`);--> statement-breakpoint
CREATE INDEX `usage_created_idx` ON `usage_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vendors_name_unique` ON `vendors` (`name`);