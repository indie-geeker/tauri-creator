import './window-controls.css'
import { cn } from '@/lib/utils'
import { usePlatform, type AppPlatform } from './use-platform'
import { MacOSWindowControls } from './MacOSWindowControls'
import { WindowsWindowControls } from './WindowsWindowControls'
import { TitleBarTitle, type TitleBarContentProps } from './TitleBarContent'
import { LinuxTitleBar } from './LinuxTitleBar'
import type { WindowControlsProps } from './use-window-controls'

export interface TitleBarProps
  extends TitleBarContentProps, WindowControlsProps {
  className?: string
  /** Override the layout in development or tests. Native calls still require Tauri. */
  forcePlatform?: AppPlatform
}

export function TitleBar({
  className,
  title,
  leading,
  trailing,
  onWindowError,
  forcePlatform,
}: TitleBarProps) {
  const detectedPlatform = usePlatform()
  const current =
    import.meta.env.DEV && forcePlatform ? forcePlatform : detectedPlatform
  if (current === 'linux')
    return <LinuxTitleBar {...{ className, title, leading, trailing }} />
  return (
    <div
      data-tauri-drag-region
      className={cn(
        'flex h-8 w-full shrink-0 items-center gap-2 border-b bg-background',
        className
      )}
    >
      {current === 'macos' && (
        <MacOSWindowControls onWindowError={onWindowError} />
      )}
      {leading}
      <TitleBarTitle title={title} />
      {trailing}
      {current === 'windows' && (
        <WindowsWindowControls onWindowError={onWindowError} />
      )}
    </div>
  )
}
