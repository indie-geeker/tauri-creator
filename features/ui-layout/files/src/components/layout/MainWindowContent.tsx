import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui-store'

interface MainWindowContentProps {
  children?: React.ReactNode
  className?: string
  status?: string
}

export function MainWindowContent({
  children,
  className,
  status = 'Ready',
}: MainWindowContentProps) {
  const lastQuickPaneEntry = useUIStore(state => state.lastQuickPaneEntry)

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      {children || (
        <div className="flex flex-1 flex-col items-center justify-center">
          <h1 className="text-4xl font-bold text-foreground">
            {lastQuickPaneEntry
              ? `Last entry: ${lastQuickPaneEntry}`
              : 'Hello World'}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{status}</p>
          {/* TAURI_CREATOR:MAIN_CONTENT */}
        </div>
      )}
    </div>
  )
}
