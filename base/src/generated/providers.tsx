import type { PropsWithChildren } from 'react'
// TAURI_CREATOR:FRONTEND_IMPORTS
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <>
      {/* TAURI_CREATOR:APP_PROVIDERS_START */}
      {children}
      {/* TAURI_CREATOR:APP_PROVIDERS_END */}
    </>
  )
}
