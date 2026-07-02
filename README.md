# Tauri Creator

A personal, cuttable scaffold system for building Tauri React apps.

This project is not the generated app. It is the template source used to create
new apps from a small base plus optional feature packages.

## Goals

- Keep the base app small and runnable.
- Add capabilities through explicit feature packages.
- Make every feature understandable, testable, and removable.
- Prefer boring scripts over a complex public CLI.
- Preserve Tauri v2 security boundaries with feature-owned capabilities.

## Project Shape

```text
base/                  # Minimal app template
features/              # Optional feature packages
recipes/               # Recipe ladder from minimal through production
scripts/               # Scaffold/apply/remove scripts
docs/plans/            # Local private plans
docs/features/         # Generated feature docs
examples/              # Optional checked-in generated examples, if kept
tmp/                   # Local scratch output, ignored
```

## First Version Scope

The current working version supports:

<!-- TAURI_CREATOR:README_RECIPES_START -->
Generated from the `recipes/*.json` ladder. Do not edit this list by hand.

- `minimal`: Base Tauri React app with no optional feature packages. Features: base only.
- `essential`: Minimal app plus typed production foundations: Specta bindings, preferences, logging, and diagnostics. Features: `specta-bindings`, `preferences`, `logging`, `diagnostics`.
- `desktop`: Essential app plus the stable, non-conflicting desktop production feature set. Features: `specta-bindings`, `preferences`, `logging`, `diagnostics`, `app-lifecycle`, `command-palette`, `native-menu`, `ui-tailwind`, `ui-shadcn`, `app-state`, `i18n`, `quick-pane`, `ui-preferences`, `ui-layout`, `sqlite`, `project-governance`, `updater`.
- `production`: Desktop app plus persistence, updater, release workflow, project governance, and strict quality gates. Features: `specta-bindings`, `preferences`, `logging`, `diagnostics`, `app-lifecycle`, `command-palette`, `native-menu`, `ui-tailwind`, `ui-shadcn`, `app-state`, `i18n`, `quick-pane`, `ui-preferences`, `ui-layout`, `sqlite`, `project-governance`, `updater`, `dx-tools`.
<!-- TAURI_CREATOR:README_RECIPES_END -->

- Feature manifests with dependencies, files, permissions, and checks
- Generator scripts that create apps, apply features, remove features, and update project maps

Generated indexes list the current feature and recipe state:

- `docs/features/index.md`
- `docs/recipes/index.md`

Regenerate them with:

```bash
npm run docs:generate
```

## Create An App

Use the interactive flow when starting a real app:

```bash
npm run create-app
```

It asks for the app name, target path, integration mode, feature or recipe
selection, optional desktop sidebar layout, author, bundle identifier prefix,
main window size, license, and package manager. Choose feature integration to
assemble features manually, or recipe integration to use the `minimal`,
`essential`, `desktop`, or `production` ladder.

Use recipe integration for a preset ladder level:

```bash
npm run create-app -- --name demo-tool --target /tmp/demo-tool --recipe desktop --sidebar left
```

Use feature integration for a manual feature set:

```bash
npm run create-app -- --name demo-tool --target /tmp/demo-tool --features logging,diagnostics
```

Generate a pnpm-based app explicitly:

```bash
npm run create-app -- --name demo-tool --target /tmp/demo-tool --recipe desktop --package-manager pnpm
```

When running scaffold scripts through npm, insert `--` before script options:

```bash
npm run create-app -- --name demo-tool --target /tmp/demo-tool --recipe desktop
```

## Verification

Run the scaffold's fast checks while iterating on generator logic:

```bash
npm run check:fast
```

Run lightweight generated-app verification:

```bash
npm run verify:generated:quick
```

Run full generated-app verification when changing base files, feature wiring, or
recipes. This creates temporary apps, installs dependencies, and runs generated
app checks and builds:

```bash
npm run check:generated
```

Run every local gate before claiming production readiness:

```bash
npm run check:all
```

For the full readiness contract, see `docs/QUALITY_GATE.md`.

## Repository Boundary

The maintained scaffold source is `base/`, `features/`, `recipes/`, `scripts/`,
and generated docs under `docs/`. Generated apps should be created outside the
repo or under ignored scratch paths. Keep checked-in examples under `examples/`
with their build artifacts ignored.

Local scratch directories such as `tmp/` and `tauri-tray/` are not part of the
maintained scaffold source unless they are explicitly moved under `examples/`
and documented as examples.

## Readiness Gates

Before relying on this scaffold for a real app, run:

```bash
npm run check:all
```

The full gate validates scaffold metadata, docs generation, create/apply/remove
flows, all npm recipe outputs, pnpm desktop output, and strict production output.
