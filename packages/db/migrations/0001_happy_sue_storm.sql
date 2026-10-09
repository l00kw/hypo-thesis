CREATE TABLE `credit_decisions` (
	`applicant_key` text NOT NULL,
	`applicant_name` text NOT NULL,
	`created_at` text NOT NULL,
	`decided_by` text NOT NULL,
	`decision` text NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`note` text,
	`proposed_outcome` text NOT NULL
);
