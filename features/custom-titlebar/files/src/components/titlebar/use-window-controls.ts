import { useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

export interface WindowControlsProps {
  onWindowError?: (error: unknown) => void
}

export function useWindowControls({ onWindowError }: WindowControlsProps) {
  const [isMaximized, setIsMaximized] = useState(false)
  const mounted = useRef(false)
  const revision = useRef(0)
  const reporter = useRef(onWindowError)
  useEffect(() => {
    reporter.current = onWindowError
  }, [onWindowError])
  const report = (error: unknown) => {
    if (!mounted.current) return
    if (reporter.current) reporter.current(error)
    else console.error('Window operation failed:', error)
  }

  useEffect(() => {
    mounted.current = true
    let disposed = false
    let unlisten: (() => void) | undefined
    const refresh = async () => {
      const currentRevision = ++revision.current
      try {
        const maximized = await getCurrentWindow().isMaximized()
        if (!disposed && currentRevision === revision.current)
          setIsMaximized(maximized)
      } catch (error) {
        if (!disposed) report(error)
      }
    }
    void refresh()
    Promise.resolve()
      .then(() =>
        getCurrentWindow().onResized(() => {
          void refresh()
        })
      )
      .then(stop => {
        if (disposed) stop()
        else unlisten = stop
      })
      .catch(error => {
        if (!disposed) report(error)
      })
    return () => {
      disposed = true
      mounted.current = false
      unlisten?.()
    }
  }, [])

  const run = async (operation: 'close' | 'minimize' | 'toggleMaximize') => {
    const operationRevision = ++revision.current
    try {
      const appWindow = getCurrentWindow()
      if (operation === 'toggleMaximize') {
        const maximized = await appWindow.isMaximized()
        if (maximized) await appWindow.unmaximize()
        else await appWindow.maximize()
        if (mounted.current && operationRevision === revision.current)
          setIsMaximized(!maximized)
      } else await appWindow[operation]()
    } catch (error) {
      report(error)
    }
  }
  return { isMaximized, run }
}
