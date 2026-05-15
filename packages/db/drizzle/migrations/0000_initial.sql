CREATE TABLE `account` (
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`providerAccountId` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `providerAccountId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`userId`);--> statement-breakpoint
CREATE TABLE `friend_request` (
	`fromUserId` text NOT NULL,
	`toUserId` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`fromUserId`, `toUserId`),
	FOREIGN KEY (`fromUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`toUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `friend_request_to_idx` ON `friend_request` (`toUserId`);--> statement-breakpoint
CREATE TABLE `friend` (
	`userId` text NOT NULL,
	`friendUserId` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`userId`, `friendUserId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`friendUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `match_player` (
	`matchId` text NOT NULL,
	`userId` text NOT NULL,
	`seat` integer NOT NULL,
	`finishingPosition` integer NOT NULL,
	`muBefore` real NOT NULL,
	`sigmaBefore` real NOT NULL,
	`muAfter` real NOT NULL,
	`sigmaAfter` real NOT NULL,
	PRIMARY KEY(`matchId`, `userId`),
	FOREIGN KEY (`matchId`) REFERENCES `match`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `match_player_userId_idx` ON `match_player` (`userId`);--> statement-breakpoint
CREATE TABLE `match` (
	`id` text PRIMARY KEY NOT NULL,
	`startedAt` integer NOT NULL,
	`endedAt` integer NOT NULL,
	`winnerUserId` text NOT NULL,
	`seatCount` integer NOT NULL,
	FOREIGN KEY (`winnerUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `match_winner_idx` ON `match` (`winnerUserId`);--> statement-breakpoint
CREATE TABLE `mmr_history` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`matchId` text,
	`muBefore` real NOT NULL,
	`sigmaBefore` real NOT NULL,
	`muAfter` real NOT NULL,
	`sigmaAfter` real NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`matchId`) REFERENCES `match`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `mmr_history_user_time_idx` ON `mmr_history` (`userId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text NOT NULL,
	`emailVerified` integer,
	`image` text,
	`displayName` text,
	`mu` real DEFAULT 25 NOT NULL,
	`sigma` real DEFAULT 8.333333333333334 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verificationToken` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
