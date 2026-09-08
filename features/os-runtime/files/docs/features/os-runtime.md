# OS runtime

This internal feature owns the JavaScript OS plugin dependency and the single Rust plugin registration. `i18n` grants locale access; `custom-titlebar` reads the synchronous platform value through `src/lib/os-runtime.ts`.

Keep this feature while either dependent remains installed. Browser previews do not detect a native OS; the titlebar uses the Linux toolbar fallback, or an explicit development `forcePlatform` prop.
