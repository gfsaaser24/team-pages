CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`key` text NOT NULL,
	`upload_id` text NOT NULL,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `uploads_page` ON `uploads` (`page_id`);