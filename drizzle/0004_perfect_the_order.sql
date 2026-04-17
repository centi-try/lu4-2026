CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`userId` int NOT NULL,
	`profitPerCycle` decimal(10,2) NOT NULL DEFAULT '0',
	`totalProfit` decimal(10,2) NOT NULL DEFAULT '0',
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
	`category` varchar(100) NOT NULL,
	`status` enum('PENDING','CONFIRMED','SOLD') NOT NULL DEFAULT 'PENDING',
	`price` decimal(10,2) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`quantitySoldInCycle` int NOT NULL DEFAULT 0,
	`imageUrl` text,
	`mapperId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `salesCycles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp,
	`status` enum('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
	`totalRevenue` decimal(10,2) NOT NULL DEFAULT '0',
	`totalProfit` decimal(10,2) NOT NULL DEFAULT '0',
	`profitByCharacter` json,
	`itemsSold` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `salesCycles_id` PRIMARY KEY(`id`)
);
