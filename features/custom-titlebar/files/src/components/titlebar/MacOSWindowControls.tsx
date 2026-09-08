import { MacOSIcons } from './WindowControlIcons'
import {
  useWindowControls,
  type WindowControlsProps,
} from './use-window-controls'

export function MacOSWindowControls(props: WindowControlsProps) {
  const { isMaximized, run } = useWindowControls(props)
  const buttonClass =
    'flex h-3 w-3 items-center justify-center rounded-full text-black/60'
  return (
    <div className="tc-window-controls tc-macos flex items-center gap-2 px-3">
      <button
        type="button"
        className={`${buttonClass} bg-[#ff544d]`}
        aria-label="Close window"
        onClick={() => {
          void run('close')
        }}
      >
        <MacOSIcons.close />
      </button>
      <button
        type="button"
        className={`${buttonClass} bg-[#ffbd2e]`}
        aria-label="Minimize window"
        onClick={() => {
          void run('minimize')
        }}
      >
        <MacOSIcons.minimize />
      </button>
      <button
        type="button"
        className={`${buttonClass} bg-[#28c93f]`}
        aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
        onClick={() => {
          void run('toggleMaximize')
        }}
      >
        <MacOSIcons.maximize />
      </button>
    </div>
  )
}
