CREATE TABLE `admin_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`adminUserId` text NOT NULL,
	`action` text NOT NULL,
	`targetUserId` text,
	`payload` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`adminUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`targetUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `admin_audit_created_at_idx` ON `admin_audit` (`createdAt`);--> statement-breakpoint
CREATE INDEX `admin_audit_target_idx` ON `admin_audit` (`targetUserId`);