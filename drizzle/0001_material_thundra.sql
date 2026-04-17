CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int,
	`itemName` varchar(255),
	`actorName` varchar(255) NOT NULL,
	`actorRole` enum('SUPER_ADMIN','MAPPER','USER') NOT NULL,
	`action` varchar(100) NOT NULL,
	`detail` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`class` varchar(100) NOT NULL DEFAULT 'Warrior',
	`level` int NOT NULL DEFAULT 1,
	`avatarColor` varchar(100) NOT NULL DEFAULT 'from-violet-400 to-purple-600',
	`role` enum('SUPER_ADMIN','MAPPER','USER') NOT NULL DEFAULT 'USER',
	`totalEarnings` decimal(15,2) NOT NULL DEFAULT '0',
	`currentCycleEarnings` decimal(15,2) NOT NULL DEFAULT '0',
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `characters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `itemCharacters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`characterId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `itemCharacters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`normalizedName` varchar(255) NOT NULL,
	`category` enum('ARMADURA','ARMA','KEY','RECIPE','MATERIALES','QUEST','ADENA') NOT NULL,
	`price` decimal(15,2),
	`status` enum('EN_REGISTRO','CONFIRMADO','VENDIDO') NOT NULL DEFAULT 'EN_REGISTRO',
	`imageUrl` text,
	`imageAltText` varchar(255),
	`imageKey` varchar(500),
	`quantity` int NOT NULL DEFAULT 1,
	`quantitySold` int NOT NULL DEFAULT 0,
	`quantitySoldInCycle` int NOT NULL DEFAULT 0,
	`cycleId` int,
	`soldAt` timestamp,
	`soldBy` varchar(255),
	`createdBy` varchar(255) NOT NULL,
	`updatedBy` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `salesCycles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(255) NOT NULL,
	`type` enum('DIARIO','SEMANAL') NOT NULL,
	`isActive` boolean NOT NULL DEFAULT false,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`closedAt` timestamp,
	`closedBy` varchar(255),
	`totalRevenue` decimal(15,2) NOT NULL DEFAULT '0',
	`totalProfit` decimal(15,2) NOT NULL DEFAULT '0',
	`characterEarnings` json,
	`soldItems` json,
	`unsoldItemIds` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `salesCycles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `gameRole` enum('SUPER_ADMIN','MAPPER','USER') DEFAULT 'USER' NOT NULL;