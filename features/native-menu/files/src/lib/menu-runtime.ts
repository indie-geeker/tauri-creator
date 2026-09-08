import { buildAppMenu } from './menu'
export async function startMenuRuntime(): Promise<() => void> {
  const menu = await buildAppMenu()
  return () => {
    void menu.close().catch(console.error)
  }
}
