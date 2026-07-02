import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface UIState {
  // TAURI_CREATOR:SIDEBAR_LEFT_START interface
  leftSidebarVisible: boolean
  // TAURI_CREATOR:SIDEBAR_LEFT_END interface
  // TAURI_CREATOR:SIDEBAR_RIGHT_START interface
  rightSidebarVisible: boolean
  // TAURI_CREATOR:SIDEBAR_RIGHT_END interface
  commandPaletteOpen: boolean
  preferencesOpen: boolean
  lastQuickPaneEntry: string | null

  // TAURI_CREATOR:SIDEBAR_LEFT_START interface-actions
  toggleLeftSidebar: () => void
  setLeftSidebarVisible: (visible: boolean) => void
  // TAURI_CREATOR:SIDEBAR_LEFT_END interface-actions
  // TAURI_CREATOR:SIDEBAR_RIGHT_START interface-actions
  toggleRightSidebar: () => void
  setRightSidebarVisible: (visible: boolean) => void
  // TAURI_CREATOR:SIDEBAR_RIGHT_END interface-actions
  toggleCommandPalette: () => void
  setCommandPaletteOpen: (open: boolean) => void
  togglePreferences: () => void
  setPreferencesOpen: (open: boolean) => void
  setLastQuickPaneEntry: (text: string) => void
  setSquareCorners: (enabled: boolean) => void
}

export const useUIStore = create<UIState>()(
  devtools(
    set => ({
      // TAURI_CREATOR:SIDEBAR_LEFT_START state
      leftSidebarVisible: true,
      // TAURI_CREATOR:SIDEBAR_LEFT_END state
      // TAURI_CREATOR:SIDEBAR_RIGHT_START state
      rightSidebarVisible: true,
      // TAURI_CREATOR:SIDEBAR_RIGHT_END state
      commandPaletteOpen: false,
      preferencesOpen: false,
      lastQuickPaneEntry: null,

      // TAURI_CREATOR:SIDEBAR_LEFT_START actions
      toggleLeftSidebar: () =>
        set(
          state => ({ leftSidebarVisible: !state.leftSidebarVisible }),
          undefined,
          'toggleLeftSidebar'
        ),

      setLeftSidebarVisible: visible =>
        set(
          { leftSidebarVisible: visible },
          undefined,
          'setLeftSidebarVisible'
        ),
      // TAURI_CREATOR:SIDEBAR_LEFT_END actions

      // TAURI_CREATOR:SIDEBAR_RIGHT_START actions
      toggleRightSidebar: () =>
        set(
          state => ({ rightSidebarVisible: !state.rightSidebarVisible }),
          undefined,
          'toggleRightSidebar'
        ),

      setRightSidebarVisible: visible =>
        set(
          { rightSidebarVisible: visible },
          undefined,
          'setRightSidebarVisible'
        ),
      // TAURI_CREATOR:SIDEBAR_RIGHT_END actions

      toggleCommandPalette: () =>
        set(
          state => ({ commandPaletteOpen: !state.commandPaletteOpen }),
          undefined,
          'toggleCommandPalette'
        ),

      setCommandPaletteOpen: open =>
        set({ commandPaletteOpen: open }, undefined, 'setCommandPaletteOpen'),

      togglePreferences: () =>
        set(
          state => ({ preferencesOpen: !state.preferencesOpen }),
          undefined,
          'togglePreferences'
        ),

      setPreferencesOpen: open =>
        set({ preferencesOpen: open }, undefined, 'setPreferencesOpen'),

      setLastQuickPaneEntry: text =>
        set({ lastQuickPaneEntry: text }, undefined, 'setLastQuickPaneEntry'),

      setSquareCorners: (enabled: boolean) => {
        document.documentElement.classList.toggle('square-corners', enabled)
      },
    }),
    {
      name: 'ui-store',
    }
  )
)
