# Preferences

Rust owns persisted preferences. After generating TypeScript bindings, use `loadPreferences()` to load a snapshot and `patchPreferences({ theme: 'dark' })` to change selected fields. `patch_preferences` replaces the former whole-snapshot `save_preferences` command.

Theme values remain `system`, `light`, and `dark`; language values remain `system`, `en`, and `zh-CN`. Existing `quick_pane_shortcut` values and legacy JSON without language remain readable. The generic patch rejects unknown fields, including shortcuts. Shortcut registration uses the dedicated coordinator and shared `preferences_store().set_shortcut(...)` method.

A missing file returns defaults. A malformed file returns an error and cannot be replaced by a patch. All writers serialize the latest read, field merge, and unique temporary-file replacement through one process-wide store. Public commands run blocking storage work on the blocking pool. A successful patch emits `preferences-changed`; notification failure does not turn an already committed save into a failed write.

With app-state installed, loading failures remain Query errors and saving is disabled until a snapshot loads successfully. Mutations send field patches and use the backend response for cache updates. Success or failure produces one toast; failed persistence leaves the displayed theme and language unchanged. Runtime subscribers reload on native changes and release delayed listeners on disposal.

With ui-shadcn and app-state installed, the generated provider controls ThemeProvider from the backend snapshot. Local storage is only an initial display cache. ui-shadcn alone retains its standalone local theme mode.

These guarantees cover normal process execution and reported I/O errors. They do not claim power-loss recovery, cross-process serialization, or native multi-window verification.
