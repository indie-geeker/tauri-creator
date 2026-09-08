# Rust and TypeScript bindings

After installing dependencies, run `npm run bindings:generate` (or `pnpm run bindings:generate`) before the first build or type check. `rust:bindings` remains a compatibility alias. Commit the generated `src/lib/tauri-bindings.ts` with the corresponding Rust changes in your generated application.

`bindings:check` exports to a temporary directory, formats with the same fixed settings as generation, and compares bytes without modifying the current binding file. A missing or changed file fails with an actionable message. `check:all` runs this check before TypeScript validation.

The exporter uses `CARGO_MANIFEST_DIR`, so invoking Cargo from a different working directory does not redirect its default output. `TAURI_CREATOR_BINDINGS_OUTPUT` overrides the output for temporary verification.

Feature adapters import the generated `commands` and types. Rust `Result` commands use `unwrapCommandResult`; commands with ordinary return values do not. SQLite IDs are positive decimal strings across IPC, preserving all i64 precision while the database remains INTEGER.
