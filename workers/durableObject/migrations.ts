// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface Migration {
	name: string;
	sql: string;
}

/**
 * Minimal migration runner that replaces workers-qb's DOQB.migrations().apply().
 *
 * Uses the `d1_migrations` tracking table for backward compatibility with
 * existing deployments that were managed by workers-qb. New deployments
 * create the same table so the schema is consistent either way.
 */
export function applyMigrations(
	sql: SqlStorage,
	migrations: Migration[],
	storage?: DurableObjectStorage,
): void {
	sql.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		applied_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`);

	for (const migration of migrations) {
		const applied = [
			...sql.exec(
				`SELECT 1 FROM d1_migrations WHERE name = ?`,
				migration.name,
			),
		];
		if (applied.length > 0) continue;

		// Strip any existing BEGIN/COMMIT wrapper from the migration SQL.
		// Cloudflare's DO runtime forbids SQL-level transactions -- must use
		// the JS storage.transactionSync() API instead.
		let migrationSql = migration.sql.trim();
		migrationSql = migrationSql.replace(/^\s*BEGIN\s+TRANSACTION\s*;?\s*/i, "");
		migrationSql = migrationSql.replace(/\s*COMMIT\s*;?\s*$/i, "");

		const escapedName = migration.name.replace(/'/g, "''");
		const run = () => {
			sql.exec(migrationSql);
			sql.exec(
				`INSERT INTO d1_migrations (name) VALUES ('${escapedName}')`,
			);
		};

		if (storage) {
			// Preferred: atomic transaction via the DO JS API
			storage.transactionSync(run);
		} else {
			// Fallback: run without explicit transaction (each exec is auto-committed)
			run();
		}
	}
}

interface DurableObjectStorage {
	transactionSync: <T>(closure: () => T) => T;
}

/**
 * Wrap SQL in a transaction so multi-statement migrations are atomic.
 *
 * Without this, a migration like `1_initial_setup` (CREATE + INSERT +
 * CREATE + CREATE) could fail mid-way and leave the database in an
 * inconsistent state that the runner considers "applied" but is
 * actually broken.  SQLite transactions guarantee all-or-nothing.
 *
 * Single-statement migrations don't strictly need it but wrapping
 * uniformly costs nothing and avoids accidental omissions.
 */
function txn(sql: string): string {
	const trimmed = sql.trim();
	// Don't double-wrap if someone already added BEGIN/COMMIT
	if (/^\s*BEGIN\b/i.test(trimmed)) return trimmed;
	return `BEGIN TRANSACTION;\n${trimmed}\nCOMMIT;`;
}

export const mailboxMigrations: Migration[] = [
	{
		name: "1_initial_setup",
		sql: txn(`
            CREATE TABLE folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                is_deletable INTEGER NOT NULL DEFAULT 1
            );

            INSERT INTO folders (id, name, is_deletable) VALUES
                ('inbox', 'Inbox', 0),
                ('sent', 'Sent', 0),
                ('trash', 'Trash', 0),
                ('archive', 'Archive', 0),
                ('spam', 'Spam', 0);

            CREATE TABLE emails (
                id TEXT PRIMARY KEY,
                folder_id TEXT NOT NULL,
                subject TEXT,
                sender TEXT,
                recipient TEXT,
                date TEXT,
                read INTEGER DEFAULT 0,
                starred INTEGER DEFAULT 0,
                body TEXT,
                FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
            );

            CREATE TABLE attachments (
                id TEXT PRIMARY KEY,
                email_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                mimetype TEXT NOT NULL,
                size INTEGER NOT NULL,
                content_id TEXT,
                disposition TEXT,
                FOREIGN KEY(email_id) REFERENCES emails(id) ON DELETE CASCADE
            );
        `),
	},
	{
		name: "2_add_email_threading",
		sql: txn(`
            ALTER TABLE emails ADD COLUMN in_reply_to TEXT;
            ALTER TABLE emails ADD COLUMN email_references TEXT;
            ALTER TABLE emails ADD COLUMN thread_id TEXT;

            CREATE INDEX idx_emails_thread_id ON emails(thread_id);
            CREATE INDEX idx_emails_in_reply_to ON emails(in_reply_to);
        `),
	},
	{
		name: "3_add_draft_folder",
		sql: txn(`INSERT INTO folders (id, name, is_deletable) VALUES ('draft', 'Drafts', 0);`),
	},
	{
		name: "4_add_message_id",
		sql: txn(`ALTER TABLE emails ADD COLUMN message_id TEXT;`),
	},
	{
		name: "5_add_raw_headers",
		sql: txn(`ALTER TABLE emails ADD COLUMN raw_headers TEXT;`),
	},
	{
		name: "6_mark_sent_emails_as_read",
		sql: txn(`UPDATE emails SET read = 1 WHERE folder_id = 'sent' AND read = 0;`),
	},
	{
		name: "7_add_cc_bcc",
		sql: txn(`
            ALTER TABLE emails ADD COLUMN cc TEXT;
            ALTER TABLE emails ADD COLUMN bcc TEXT;
        `),
	},
	{
		// No txn() wrapper: Cloudflare's DO runtime requires state.storage.transactionSync()
		// instead of SQL-level BEGIN TRANSACTION. These are idempotent CREATE INDEX IF NOT EXISTS
		// statements so they're safe to run without a transaction.
		name: "8_add_folder_date_indexes",
		sql: `
            CREATE INDEX IF NOT EXISTS idx_emails_folder_id ON emails(folder_id);
            CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date);
            CREATE INDEX IF NOT EXISTS idx_emails_folder_date ON emails(folder_id, date DESC);
        `,
	},
	{
		// Phase 3: Resend outbox, delivery state, webhook dedupe, suppression mirror.
		name: "9_add_outbox",
		sql: txn(`
            ALTER TABLE emails ADD COLUMN delivery_status TEXT;

            CREATE TABLE outbox (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                payload TEXT NOT NULL,
                recipient_count INTEGER NOT NULL,
                send_at INTEGER NOT NULL,
                next_attempt_at INTEGER NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                provider_id TEXT,
                quota_day TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                sent_at INTEGER
            );
            CREATE INDEX idx_outbox_due ON outbox(status, next_attempt_at);
            CREATE INDEX idx_outbox_provider ON outbox(provider_id);
            CREATE INDEX idx_outbox_quota_day ON outbox(quota_day);

            CREATE TABLE outbox_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

            CREATE TABLE webhook_events (
                svix_id TEXT PRIMARY KEY,
                received_at INTEGER NOT NULL
            );

            CREATE TABLE suppressed_recipients (
                email TEXT PRIMARY KEY,
                origin TEXT,
                created_at TEXT
            );
        `),
	},
	{
		// Phase 4: plain-text body for snippets/search, raw .eml location, and a
		// message_id index for reply threading (B14).
		name: "10_inbound_pipeline",
		sql: txn(`
            ALTER TABLE emails ADD COLUMN body_text TEXT;
            ALTER TABLE emails ADD COLUMN raw_key TEXT;
            CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);
        `),
	},
	{
		// Phase 6: full-text search (plan §A6). LIKE '%q%' fails on DO SQLite for
		// patterns over 50 bytes and scans every row. The index is contentless
		// (no second copy of every body) and kept in sync by triggers. Updates
		// that only change flags or folder don't touch it, which saves rows
		// written against the Free daily quota.
		name: "11_fts5_search",
		sql: txn(`
            CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
                subject, sender, recipients, body,
                content='', contentless_delete=1,
                tokenize='unicode61 remove_diacritics 2', prefix='2 3'
            );
            CREATE TRIGGER IF NOT EXISTS emails_fts_ai AFTER INSERT ON emails BEGIN
                INSERT INTO emails_fts(rowid, subject, sender, recipients, body) VALUES (
                    new.rowid, new.subject, new.sender,
                    COALESCE(new.recipient, '') || ' ' || COALESCE(new.cc, '') || ' ' || COALESCE(new.bcc, ''),
                    COALESCE(new.body_text, new.body)
                );
            END;
            CREATE TRIGGER IF NOT EXISTS emails_fts_ad AFTER DELETE ON emails BEGIN
                DELETE FROM emails_fts WHERE rowid = old.rowid;
            END;
            CREATE TRIGGER IF NOT EXISTS emails_fts_au AFTER UPDATE OF subject, sender, recipient, cc, bcc, body, body_text ON emails BEGIN
                DELETE FROM emails_fts WHERE rowid = old.rowid;
                INSERT INTO emails_fts(rowid, subject, sender, recipients, body) VALUES (
                    new.rowid, new.subject, new.sender,
                    COALESCE(new.recipient, '') || ' ' || COALESCE(new.cc, '') || ' ' || COALESCE(new.bcc, ''),
                    COALESCE(new.body_text, new.body)
                );
            END;
            INSERT INTO emails_fts(rowid, subject, sender, recipients, body)
                SELECT rowid, subject, sender,
                    COALESCE(recipient, '') || ' ' || COALESCE(cc, '') || ' ' || COALESCE(bcc, ''),
                    COALESCE(body_text, body)
                FROM emails;
        `),
	},
	{
		// Phase 6: when each sender last got the vacation auto-reply (RFC 3834 rate limit).
		name: "12_auto_reply",
		sql: txn(`
            CREATE TABLE IF NOT EXISTS auto_replied (
                sender TEXT PRIMARY KEY,
                replied_at INTEGER NOT NULL
            );
        `),
	},
];
