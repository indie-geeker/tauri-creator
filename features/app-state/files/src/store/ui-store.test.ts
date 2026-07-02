import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from './ui-store'

describe('UIStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useUIStore.setState({
      // TAURI_CREATOR:SIDEBAR_LEFT_START reset
      leftSidebarVisible: true,
      // TAURI_CREATOR:SIDEBAR_LEFT_END reset
      // TAURI_CREATOR:SIDEBAR_RIGHT_START reset
      rightSidebarVisible: true,
      // TAURI_CREATOR:SIDEBAR_RIGHT_END reset
      commandPaletteOpen: false,
      preferencesOpen: false,
    })
  })

  it('has correct initial state', () => {
    const state = useUIStore.getState()
    // TAURI_CREATOR:SIDEBAR_LEFT_START initial-assertion
    expect(state.leftSidebarVisible).toBe(true)
    // TAURI_CREATOR:SIDEBAR_LEFT_END initial-assertion
    // TAURI_CREATOR:SIDEBAR_RIGHT_START initial-assertion
    expect(state.rightSidebarVisible).toBe(true)
    // TAURI_CREATOR:SIDEBAR_RIGHT_END initial-assertion
    expect(state.commandPaletteOpen).toBe(false)
    expect(state.preferencesOpen).toBe(false)
  })

  // TAURI_CREATOR:SIDEBAR_LEFT_START left-tests
  it('toggles left sidebar visibility', () => {
    const { toggleLeftSidebar } = useUIStore.getState()

    toggleLeftSidebar()
    expect(useUIStore.getState().leftSidebarVisible).toBe(false)

    toggleLeftSidebar()
    expect(useUIStore.getState().leftSidebarVisible).toBe(true)
  })

  it('sets left sidebar visibility directly', () => {
    const { setLeftSidebarVisible } = useUIStore.getState()

    setLeftSidebarVisible(false)
    expect(useUIStore.getState().leftSidebarVisible).toBe(false)

    setLeftSidebarVisible(true)
    expect(useUIStore.getState().leftSidebarVisible).toBe(true)
  })
  // TAURI_CREATOR:SIDEBAR_LEFT_END left-tests

  it('toggles preferences dialog', () => {
    const { togglePreferences } = useUIStore.getState()

    togglePreferences()
    expect(useUIStore.getState().preferencesOpen).toBe(true)

    togglePreferences()
    expect(useUIStore.getState().preferencesOpen).toBe(false)
  })

  it('toggles command palette', () => {
    const { toggleCommandPalette } = useUIStore.getState()

    toggleCommandPalette()
    expect(useUIStore.getState().commandPaletteOpen).toBe(true)

    toggleCommandPalette()
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
  })
})
