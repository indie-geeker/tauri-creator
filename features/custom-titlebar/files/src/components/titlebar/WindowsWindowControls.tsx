import { WindowsIcons } from './WindowControlIcons'
import {
  useWindowControls,
  type WindowControlsProps,
} from './use-window-controls'

export function WindowsWindowControls(props: WindowControlsProps) {
  const { isMaximized, run } = useWindowControls(props)
  const buttonClass =
    'flex h-8 w-12 items-center justify-center hover:bg-foreground/10'
  return (
    <div className="tc-window-controls tc-windows flex">
      <button
        type="button"
        className={buttonClass}
        aria-label="Minimize window"
        onClick={() => {
          void run('minimize')
        }}
      >
        <WindowsIcons.minimize />
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
        onClick={() => {
          void run('toggleMaximize')
        }}
      >
        {isMaximized ? <WindowsIcons.restore /> : <WindowsIcons.maximize />}
      </button>
      <button
        type="button"
        className={`${buttonClass} hover:bg-red-600 hover:text-white`}
        aria-label="Close window"
        onClick={() => {
          void run('close')
        }}
      >
        <WindowsIcons.close />
      </button>
    </div>
  )
}
