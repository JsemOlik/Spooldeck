ALTER TABLE "printers" DROP CONSTRAINT "printers_spool_id_spools_id_fk";
--> statement-breakpoint
ALTER TABLE "printers" DROP COLUMN "spool_id";--> statement-breakpoint
ALTER TABLE "printers" DROP COLUMN "job_file";--> statement-breakpoint
ALTER TABLE "printers" DROP COLUMN "job_usage_id";--> statement-breakpoint
ALTER TABLE "printers" DROP COLUMN "job_base_mm";--> statement-breakpoint
ALTER TABLE "printers" DROP COLUMN "job_last_mm";