ALTER TABLE `user` ADD `isPatron` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `patronSince` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `founderRank` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `patronMotto` text;--> statement-breakpoint
ALTER TABLE `user` ADD `patronSlug` text;--> statement-breakpoint
ALTER TABLE `user` ADD `patronGildedNickname` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `patronCardBack` text;--> statement-breakpoint
ALTER TABLE `user` ADD `patronTableTheme` text;--> statement-breakpoint
ALTER TABLE `user` ADD `patronVanityRoomCode` text;--> statement-breakpoint
ALTER TABLE `user` ADD `patronShimmerBanner` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `patronVictoryFlourish` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `user_patronSlug_unique` ON `user` (`patronSlug`);