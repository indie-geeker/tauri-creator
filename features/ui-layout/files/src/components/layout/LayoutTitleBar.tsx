import { Settings } from 'lucide-react'
// TAURI_CREATOR:SIDEBAR_LEFT_START import
import { PanelLeft, PanelLeftClose } from 'lucide-react'
// TAURI_CREATOR:SIDEBAR_LEFT_END import
// TAURI_CREATOR:SIDEBAR_RIGHT_START import
import { PanelRight, PanelRightClose } from 'lucide-react'
// TAURI_CREATOR:SIDEBAR_RIGHT_END import
import { useUIStore } from '@/store/ui-store'
import { cn } from '@/lib/utils'

function iconButtonClass(isActive: boolean) {
  return cn(
    'inline-flex !h-7 !w-7 items-center justify-center rounded-md !border-0 !bg-transparent !p-0 text-foreground/70',
    'hover:!bg-muted hover:text-foreground',
    isActive && 'text-foreground'
  )
}

export function LayoutTitleBar() {
  // TAURI_CREATOR:SIDEBAR_LEFT_START state
  const leftSidebarVisible = useUIStore(state => state.leftSidebarVisible)
  const toggleLeftSidebar = useUIStore(state => state.toggleLeftSidebar)
  // TAURI_CREATOR:SIDEBAR_LEFT_END state
  // TAURI_CREATOR:SIDEBAR_RIGHT_START state
  const rightSidebarVisible = useUIStore(state => state.rightSidebarVisible)
  const toggleRightSidebar = useUIStore(state => state.toggleRightSidebar)
  // TAURI_CREATOR:SIDEBAR_RIGHT_END state
  const setPreferencesOpen = useUIStore(state => state.setPreferencesOpen)

  return (
    <div
      data-tauri-drag-region
      className="relative flex h-8 shrink-0 items-center justify-between border-b bg-background px-2"
    >
      <div className="flex items-center gap-1 pl-16">
        {/* TAURI_CREATOR:SIDEBAR_LEFT_START button */}
        <button
          aria-label={
            leftSidebarVisible ? 'Hide left sidebar' : 'Show left sidebar'
          }
          className={iconButtonClass(leftSidebarVisible)}
          onClick={toggleLeftSidebar}
          title={leftSidebarVisible ? 'Hide left sidebar' : 'Show left sidebar'}
          type="button"
        >
          {leftSidebarVisible ? (
            <PanelLeftClose className="h-3.5 w-3.5" />
          ) : (
            <PanelLeft className="h-3.5 w-3.5" />
          )}
        </button>
        {/* TAURI_CREATOR:SIDEBAR_LEFT_END button */}
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="text-sm font-medium text-foreground/80">
          Tauri App
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          aria-label="Open settings"
          className={iconButtonClass(false)}
          onClick={() => setPreferencesOpen(true)}
          title="Open settings"
          type="button"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>

        {/* TAURI_CREATOR:SIDEBAR_RIGHT_START button */}
        <button
          aria-label={
            rightSidebarVisible ? 'Hide right sidebar' : 'Show right sidebar'
          }
          className={iconButtonClass(rightSidebarVisible)}
          onClick={toggleRightSidebar}
          title={
            rightSidebarVisible ? 'Hide right sidebar' : 'Show right sidebar'
          }
          type="button"
        >
          {rightSidebarVisible ? (
            <PanelRightClose className="h-3.5 w-3.5" />
          ) : (
            <PanelRight className="h-3.5 w-3.5" />
          )}
        </button>
        {/* TAURI_CREATOR:SIDEBAR_RIGHT_END button */}
      </div>
    </div>
  )
}
