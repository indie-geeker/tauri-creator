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
recipes/               # Recipe ladder from minimal through full
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
- `starter`: Recommended production foundation for a new solo Tauri product. Features: `specta-bindings`, `preferences`, `logging`, `diagnostics`.
- `full`: Reference and strict verification app containing the complete stable production feature set. Features: `specta-bindings`, `preferences`, `logging`, `diagnostics`, `app-lifecycle`, `command-palette`, `native-menu`, `ui-tailwind`, `ui-shadcn`, `app-state`, `i18n`, `quick-pane`, `ui-preferences`, `ui-layout`, `sqlite`, `project-governance`, `updater`, `dx-tools`.
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

Use one command for normal project creation:

```bash
npm run create
```

The wizard asks for a project name and target, then offers three templates:

- Starter is the recommended production foundation for a new product.
- Minimal is the smallest runnable Tauri React app.
- Full is the complete reference and regression template.

After choosing a template, you can add optional capabilities such as SQLite,
Updater, or Quick pane. The menu hides infrastructure details, resolves their
dependencies automatically, and shows the complete result before creating any
files. Advanced author, license, window, and layout settings are available only
when you choose to customize them.

The `full` recipe remains a reference and regression target, not the normal
project starting point.

### Automation

Explicit flags remain available for scripts and CI; they are not commands you
need to memorize for normal use:

```bash
node scripts/create-app.js --name demo-tool --target /tmp/demo-tool --recipe starter
node scripts/create-app.js --name demo-tool --target /tmp/demo-tool --recipe full --sidebar left
```

Automation can also request an exact feature set:

```bash
node scripts/create-app.js --name demo-tool --target /tmp/demo-tool --features logging,diagnostics
```

Generate a pnpm-based app explicitly:

```bash
node scripts/create-app.js --name demo-tool --target /tmp/demo-tool --recipe starter --package-manager pnpm
```

Add product features before customizing the files they own:

```bash
npm run apply-feature -- --target /tmp/demo-tool --feature updater
```

Preview removals before applying them:

```bash
npm run remove-feature -- --target /tmp/demo-tool --feature updater --dry-run
npm run remove-feature -- --target /tmp/demo-tool --feature updater
```

Do not hand-delete cross-cutting feature files; use the feature scripts so state,
dependencies, registrations, and `PROJECT_MAP.md` remain synchronized.

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
flows, all npm recipe outputs, pnpm starter output, and strict full output.
