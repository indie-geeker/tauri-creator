# Security Policy

## Reporting

Open a private security advisory for vulnerabilities in {{APP_TITLE}} when the
repository host supports it. If advisories are unavailable, contact the project
maintainer directly before publishing details.

## Update Signing

Tauri updater artifacts must be signed in CI with `TAURI_SIGNING_PRIVATE_KEY`.
The public key in `src-tauri/tauri.conf.json` must match that private key.

Never commit:

- Tauri private signing keys
- GitHub Actions secret values
- Generated `.sig` files outside release artifacts
- Local `.env` files
