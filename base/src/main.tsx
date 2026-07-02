import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// TAURI_CREATOR:FRONTEND_IMPORTS

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {/* TAURI_CREATOR:APP_PROVIDERS_START */}
    <App />
    {/* TAURI_CREATOR:APP_PROVIDERS_END */}
  </StrictMode>
)
