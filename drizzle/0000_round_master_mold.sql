CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`block_id` text,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`resolved_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_page` ON `comments` (`page_id`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `files_page` ON `files` (`page_id`);--> statement-breakpoint
CREATE TABLE `grants` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`subject` text NOT NULL,
	`level` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grants_page_subject` ON `grants` (`page_id`,`subject`);--> statement-breakpoint
CREATE TABLE `page_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`icon` text,
	`blocks` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `versions_page` ON `page_versions` (`page_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`owner_id` text NOT NULL,
	`kind` text DEFAULT 'page' NOT NULL,
	`database_id` text,
	`title` text DEFAULT '' NOT NULL,
	`icon` text,
	`blocks` text DEFAULT '[]' NOT NULL,
	`body_text` text DEFAULT '' NOT NULL,
	`props` text DEFAULT '{}' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE INDEX `pages_parent` ON `pages` (`parent_id`);--> statement-breakpoint
CREATE INDEX `pages_database` ON `pages` (`database_id`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`database_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `properties_database` ON `properties` (`database_id`);--> statement-breakpoint
CREATE TABLE `publications` (
	`page_id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`expires_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publications_slug_unique` ON `publications` (`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `views` (
	`id` text PRIMARY KEY NOT NULL,
	`database_id` text NOT NULL,
	`name` text NOT NULL,
	`layout` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `views_database` ON `views` (`database_id`);