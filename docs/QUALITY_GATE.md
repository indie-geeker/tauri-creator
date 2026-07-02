# Quality Gate

`tauri-creator` is ready for project use only when these pass:

- `npm run check:fast`
- `npm run check:generated:npm`
- `npm run check:generated:pnpm`
- `npm run check:generated:strict`
- `npm audit --omit=dev`

Generated production apps must also pass their own:

- `<package-manager> run check:all`
- `<package-manager> run build`

Release bundle readiness requires:

- `npm run check:release`
- `TAURI_SIGNING_PRIVATE_KEY` configured when updater is enabled

Manual release checks:

- Replace placeholder updater endpoint and public key.
- Configure signing and notarization before distributing binaries.
- Replace generated license guidance with the real license.
- Confirm global shortcut defaults do not conflict with the target OS workflow.
