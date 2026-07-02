import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
// TAURI_CREATOR:SIDEBAR_LEFT_START import
import { LeftSideBar } from './LeftSideBar'
// TAURI_CREATOR:SIDEBAR_LEFT_END import
// TAURI_CREATOR:SIDEBAR_RIGHT_START import
import { RightSideBar } from './RightSideBar'
// TAURI_CREATOR:SIDEBAR_RIGHT_END import
import { MainWindowContent } from './MainWindowContent'
import { LayoutTitleBar } from './LayoutTitleBar'
import { Toaster } from 'sonner'
import { useTheme } from '@/hooks/use-theme'
import { useUIStore } from '@/store/ui-store'
import { cn } from '@/lib/utils'

/**
 * Layout sizing configuration for resizable panels.
 * All values are percentages of total width.
 * Sidebar defaults + main default must equal 100.
 */
const LAYOUT = {
  // TAURI_CREATOR:SIDEBAR_LEFT_START layout
  leftSidebar: { default: 20, min: 15, max: 40 },
  // TAURI_CREATOR:SIDEBAR_LEFT_END layout
  // TAURI_CREATOR:SIDEBAR_RIGHT_START layout
  rightSidebar: { default: 20, min: 15, max: 40 },
  // TAURI_CREATOR:SIDEBAR_RIGHT_END layout
  main: { min: 30 },
} as const

// Main content default is calculated to ensure totals sum to 100%
const MAIN_CONTENT_DEFAULT =
  100 - LAYOUT.leftSidebar.default - LAYOUT.rightSidebar.default

type MainWindowProps = {
  status?: string
}

export function MainWindow({ status = 'Ready' }: MainWindowProps) {
  const { theme } = useTheme()
  // TAURI_CREATOR:SIDEBAR_LEFT_START state
  const leftSidebarVisible = useUIStore(state => state.leftSidebarVisible)
  // TAURI_CREATOR:SIDEBAR_LEFT_END state
  // TAURI_CREATOR:SIDEBAR_RIGHT_START state
  const rightSidebarVisible = useUIStore(state => state.rightSidebarVisible)
  // TAURI_CREATOR:SIDEBAR_RIGHT_END state

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[var(--app-corner-radius)] bg-background">
      <LayoutTitleBar />

      <div className="flex flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* TAURI_CREATOR:SIDEBAR_LEFT_START panel */}
          <ResizablePanel
            defaultSize={LAYOUT.leftSidebar.default}
            minSize={LAYOUT.leftSidebar.min}
            maxSize={LAYOUT.leftSidebar.max}
            className={cn(!leftSidebarVisible && 'hidden')}
          >
            <LeftSideBar />
          </ResizablePanel>

          <ResizableHandle className={cn(!leftSidebarVisible && 'hidden')} />
          {/* TAURI_CREATOR:SIDEBAR_LEFT_END panel */}

          <ResizablePanel
            defaultSize={MAIN_CONTENT_DEFAULT}
            minSize={LAYOUT.main.min}
          >
            <MainWindowContent status={status} />
          </ResizablePanel>

          {/* TAURI_CREATOR:SIDEBAR_RIGHT_START panel */}
          <ResizableHandle className={cn(!rightSidebarVisible && 'hidden')} />

          <ResizablePanel
            defaultSize={LAYOUT.rightSidebar.default}
            minSize={LAYOUT.rightSidebar.min}
            maxSize={LAYOUT.rightSidebar.max}
            className={cn(!rightSidebarVisible && 'hidden')}
          >
            <RightSideBar />
          </ResizablePanel>
          {/* TAURI_CREATOR:SIDEBAR_RIGHT_END panel */}
        </ResizablePanelGroup>
      </div>

      {/* Global UI Components (hidden until triggered) */}
      {/* TAURI_CREATOR:GLOBAL_COMPONENTS */}
      <Toaster
        position="bottom-right"
        theme={
          theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'system'
        }
        className="toaster group"
        toastOptions={{
          classNames: {
            toast:
              'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
            description: 'group-[.toast]:text-muted-foreground',
            actionButton:
              'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
            cancelButton:
              'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          },
        }}
      />
    </div>
  )
}
