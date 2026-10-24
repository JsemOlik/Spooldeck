ALTER TABLE "usage_logs" ADD COLUMN "printer_id" integer;--> statement-breakpoint
ALTER TABLE "usage_logs" ADD COLUMN "print_job" text;--> statement-breakpoint
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_printer_id_printers_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_printer_idx" ON "usage_logs" USING btree ("printer_id");--> statement-breakpoint
-- Entries a printer logged before this column existed carry its name in the note.
UPDATE "usage_logs" AS "u"
SET "printer_id" = (
  SELECT min("p"."id") FROM "printers" AS "p"
  WHERE "u"."note" IN ('Printing on ' || "p"."name", 'Printed on ' || "p"."name", 'Cancelled on ' || "p"."name", 'Failed on ' || "p"."name")
)
WHERE "u"."kind" = 'print' AND "u"."note" ~ '^(Printing|Printed|Cancelled|Failed) on ';
