# SQLite

`init_database` starts one bounded worker during application setup. The worker opens `app.sqlite3` in the app data directory, performs schema migration once, and owns the connection until synchronous application Exit drains admitted jobs and joins the thread. Async commands enqueue work and await oneshot replies; a full 64-request queue returns a `database busy` error instead of growing without limit. SQLite lock waits have a two-second timeout.

Migration version 1 accepts an empty database or the exact legacy notes schema and known index definitions. Unknown tables, columns, defaults, constraints, triggers, indexes, and future versions are refused. Migration statements and `user_version` updates share one transaction, so errors roll back both schema and data changes. Back up real application data before upgrading generated projects; these tests use temporary databases only.

`listNotes({ limit, cursor })` returns `{ items, nextCursor }`. Pages default to 50 summaries and allow at most 200; summaries include id, title, createdAt and updatedAt, never the note body. Pass `nextCursor` back for the next page. Ordering and the matching index use `(updated_at DESC, id DESC)`; cursor queries use a tuple range, avoiding offset pagination. Concurrent updates can move records between pages, so consumers should restart pagination when their data changes.

`getNote(id)` fetches a selected note including its body. `createNote`, `updateNote`, and `deleteNote` preserve the CRUD operations; IDs are canonical positive decimal strings over IPC and strict i64 values inside SQL. Invalid, negative, zero, padded, and overflowing IDs fail before SQL execution.

TanStack Query hooks include `useNotes(input)`, `useNote(id)`, `useDatabaseHealth`, and the three mutation hooks. Page keys include the input cursor, while mutations invalidate the common page prefix and update or remove detail cache entries.

Tests cover legacy migration, unknown-schema refusal, rollback, decimal ID precision, equal-timestamp pagination, bounded queues with a paused worker, error recovery, explicit shutdown and disk persistence across worker restarts. No production database or signed native application is exercised by these tests.
