import { cn } from '@/lib/utils'
import { TitleBarTitle, type TitleBarContentProps } from './TitleBarContent'

/** Linux retains system decorations and their window controls. */
export function LinuxTitleBar({
  className,
  title,
  leading,
  trailing,
}: TitleBarContentProps & { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-8 shrink-0 items-center gap-2 border-b bg-background px-2',
        className
      )}
    >
      {leading}
      <TitleBarTitle title={title} />
      {trailing}
    </div>
  )
}
