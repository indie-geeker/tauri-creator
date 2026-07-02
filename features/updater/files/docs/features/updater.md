# Updater

Adds Tauri updater wiring plus release-readiness checks.

## Frontend

- `getUpdaterStatus()` invokes the Tauri `get_updater_status` command.
- `normalizeUpdaterStatus(value)` maps backend results into `disabled`, `ready`, or `error` states.
- The generated status includes endpoint presence, public-key presence, missing fields, and an actionable reason.

## Rust

- `src-tauri/src/features/updater.rs` owns the status command.
- The command reads the generated `src-tauri/tauri.conf.json` at compile time and reports whether updater configuration is release-ready.
- The Tauri updater plugin is registered in `src-tauri/src/lib.rs`.

## Release Configuration

The feature generates a compile-safe default:

- `plugins.updater.endpoints` points at a GitHub Releases `latest.json` URL using the generated app name.
- `plugins.updater.pubkey` is set to `REPLACE_WITH_UPDATER_PUBLIC_KEY`.
- `bundle.createUpdaterArtifacts` is enabled so release builds can emit updater metadata and signatures.

Before release:

1. Generate a signing key with the Tauri signer.
2. Replace `REPLACE_WITH_UPDATER_PUBLIC_KEY` in `src-tauri/tauri.conf.json`.
3. Set `TAURI_SIGNING_PRIVATE_KEY` and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in GitHub Actions secrets.
4. Update the endpoint if your repository path is not `{{APP_NAME}}/{{APP_NAME}}`.

## Generated Files

- `.github/workflows/release.yml`
- `docs/CONTRIBUTING.md`
- `docs/SECURITY.md`
- `LICENSE.md`
