// TAURI_CREATOR:APP_IMPORTS
import { useEffect, useState } from 'react'
import '../App.css'
import { start } from './bootstrap'
import { AppContent } from '../AppContent'

function App() {
  const [message, setMessage] = useState('Ready')

  useEffect(() => {
    let disposed = false
    let stop: (() => void) | undefined
    void start()
      .then(dispose => {
        if (disposed) dispose()
        else stop = dispose
      })
      .catch(console.error)
    return () => {
      disposed = true
      stop?.()
    }
  }, [])

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
