import {
  Menu,
  MenuItem,
  Submenu,
  PredefinedMenuItem,
} from '@tauri-apps/api/menu'

const APP_NAME = 'Tauri App'

export async function buildAppMenu(): Promise<Menu> {
  const appSubmenu = await Submenu.new({
    text: APP_NAME,
    items: [
      await MenuItem.new({
        id: 'about',
        text: `About ${APP_NAME}`,
        action: () =>
          alert(`${APP_NAME}\n\nBuilt with Tauri v2 + React + TypeScript`),
      }),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await PredefinedMenuItem.new({
        item: 'Hide',
        text: `Hide ${APP_NAME}`,
      }),
      await PredefinedMenuItem.new({
        item: 'HideOthers',
        text: 'Hide Others',
      }),
      await PredefinedMenuItem.new({
        item: 'ShowAll',
        text: 'Show All',
      }),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await PredefinedMenuItem.new({
        item: 'Quit',
        text: `Quit ${APP_NAME}`,
      }),
    ],
  })

  const viewSubmenu = await Submenu.new({
    text: 'View',
    items: [await PredefinedMenuItem.new({ item: 'Fullscreen' })],
  })

  const menu = await Menu.new({
    items: [appSubmenu, viewSubmenu],
  })

  await menu.setAsAppMenu()

  return menu
}
