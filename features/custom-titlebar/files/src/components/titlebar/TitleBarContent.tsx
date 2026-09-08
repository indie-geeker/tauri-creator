import type { ReactNode } from 'react'

export interface TitleBarContentProps {
  title?: string
  leading?: ReactNode
  trailing?: ReactNode
}

export function TitleBarTitle({
  title = '{{APP_PRODUCT_NAME}}',
}: Pick<TitleBarContentProps, 'title'>) {
  return (
    <span
      data-tauri-drag-region
      className="min-w-0 flex-1 truncate text-center text-sm font-medium"
    >
      {title}
    </span>
  )
}
