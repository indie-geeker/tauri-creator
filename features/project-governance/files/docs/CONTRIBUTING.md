# Contributing to {{APP_TITLE}}

## Development

```bash
npm install
npm run check:all
npm run tauri:dev
```

## Pull Requests

- Keep generated Tauri, Rust, and frontend checks passing.
- Add tests for new commands, persistence behavior, or release logic.
- Do not commit signing keys, updater private keys, or local build artifacts.

## Releases

Release builds are created from `v*` tags by `.github/workflows/release.yml`.
Configure `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
before publishing signed updater artifacts.
