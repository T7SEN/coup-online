CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedBy` text,
	FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `match_active` (
	`matchId` text PRIMARY KEY NOT NULL,
	`startedAt` integer NOT NULL,
	`seatCount` integer NOT NULL,
	`hostUserId` text NOT NULL,
	FOREIGN KEY (`hostUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `match_active_started_at_idx` ON `match_active` (`startedAt`);--> statement-breakpoint
ALTER TABLE `user` ADD `bannedAt` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `banReason` text;