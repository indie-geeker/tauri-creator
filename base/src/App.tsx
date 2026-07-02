// TAURI_CREATOR:APP_IMPORTS
import { useState } from 'react'
import './App.css'
import { AppContent } from './AppContent'

function App() {
  const [message, setMessage] = useState('Ready')

  // TAURI_CREATOR:APP_EFFECT

  return (
    <div className="app-wrapper">
      {/* TAURI_CREATOR:APP_PROVIDER_START */}
      {/* TAURI_CREATOR:APP_CONTENT */}
      <AppContent message={message} setMessage={setMessage} />
      {/* TAURI_CREATOR:APP_PROVIDER_END */}
    </div>
  )
}

export default App
