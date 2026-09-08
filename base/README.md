# {{APP_TITLE}}

Generated from `tauri-creator`.

## Commands

- `{{PACKAGE_MANAGER}} install`
- If `specta-bindings` is enabled (starter/full and custom-command features), run `{{PACKAGE_MANAGER}} run bindings:generate` before dev/build/check.
- `{{PACKAGE_MANAGER}} run check:all` verifies existing bindings without modifying them.
- `{{PACKAGE_MANAGER}} run dev`
- `{{PACKAGE_MANAGER}} run tauri:dev`
- `{{PACKAGE_MANAGER}} run check:all`

Requires Node ^22.13.0 or >=24 and Rust 1.92.0. npm 11.6.2 and pnpm 11.7.0 are the supported package-manager baselines.

Use `bindings:generate` after changing Rust IPC types, then review and commit the generated TypeScript alongside the Rust change. Quick-pane receipts are retained only for the current process; they do not mean data is durably saved.
