import { cn } from '@/lib/utils'

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
  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      {children || (
        <div className="flex flex-1 flex-col items-center justify-center">
          <h1 className="text-4xl font-bold text-foreground">Hello World</h1>
          <p className="mt-3 text-sm text-muted-foreground">{status}</p>
          {/* TAURI_CREATOR:MAIN_CONTENT */}
        </div>
      )}
    </div>
  )
}
