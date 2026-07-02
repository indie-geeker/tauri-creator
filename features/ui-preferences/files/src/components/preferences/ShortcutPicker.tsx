import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ShortcutDisplayPlatform = 'macos' | 'other'

export type ShortcutKeyboardEvent = Pick<
  KeyboardEvent,
  'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'
>

interface ShortcutPickerProps {
  value: string | null
  defaultValue: string
  onChange: (shortcut: string | null) => void
  disabled?: boolean
  className?: string
}

export function getShortcutDisplayPlatform(): ShortcutDisplayPlatform {
  if (typeof navigator === 'undefined') return 'other'

  return navigator.platform.toLowerCase().includes('mac') ? 'macos' : 'other'
}

export function formatShortcutForDisplay(
  shortcut: string,
  platform: ShortcutDisplayPlatform = getShortcutDisplayPlatform()
): string {
  const isMac = platform === 'macos'

  let formatted = shortcut
    .replace(/CommandOrControl/gi, isMac ? '⌘' : 'Ctrl')
    .replace(/CmdOrCtrl/gi, isMac ? '⌘' : 'Ctrl')
    .replace(/Command/gi, '⌘')
    .replace(/Control/gi, isMac ? '⌃' : 'Ctrl')
    .replace(/Ctrl/gi, isMac ? '⌃' : 'Ctrl')
    .replace(/Shift/gi, isMac ? '⇧' : 'Shift')
    .replace(/Alt/gi, isMac ? '⌥' : 'Alt')
    .replace(/Super/gi, isMac ? '⌘' : 'Win')
    .replace(/Period/gi, '.')
    .replace(/Comma/gi, ',')
    .replace(/Slash/gi, '/')
    .replace(/Backslash/gi, '\\')
    .replace(/BracketLeft/gi, '[')
    .replace(/BracketRight/gi, ']')
    .replace(/Semicolon/gi, ';')
    .replace(/Quote/gi, "'")
    .replace(/Backquote/gi, '`')
    .replace(/Minus/gi, '-')
    .replace(/Equal/gi, '=')
    .replace(/Space/gi, 'Space')
    .replace(/Enter/gi, '↵')
    .replace(/Escape/gi, 'Esc')
    .replace(/Backspace/gi, '⌫')
    .replace(/Delete/gi, '⌦')
    .replace(/ArrowUp/gi, '↑')
    .replace(/ArrowDown/gi, '↓')
    .replace(/ArrowLeft/gi, '←')
    .replace(/ArrowRight/gi, '→')
    .replace(/Tab/gi, '⇥')

  if (isMac) {
    formatted = formatted.replace(/\+/g, '')
  }

  return formatted
}

export function keyEventToShortcut(
  event: ShortcutKeyboardEvent
): string | null {
  const modifierKeys = ['Control', 'Shift', 'Alt', 'Meta', 'ContextMenu', 'OS']
  if (modifierKeys.includes(event.key)) return null

  const parts: string[] = []

  if (event.metaKey || event.ctrlKey) {
    parts.push('CommandOrControl')
  }
  if (event.shiftKey) {
    parts.push('Shift')
  }
  if (event.altKey) {
    parts.push('Alt')
  }

  if (parts.length === 0) return null

  let key = event.code
  if (key.startsWith('Key')) {
    key = key.slice(3)
  } else if (key.startsWith('Digit')) {
    key = key.slice(5)
  } else if (key.startsWith('Numpad')) {
    key = `Num${key.slice(6)}`
  }

  parts.push(key)

  return parts.join('+')
}

export function ShortcutPicker({
  value,
  defaultValue,
  onChange,
  disabled = false,
  className,
}: ShortcutPickerProps) {
  const { t } = useTranslation()
  const [isCapturing, setIsCapturing] = useState(false)
  const [pendingShortcut, setPendingShortcut] = useState<string | null>(null)
  const inputRef = useRef<HTMLDivElement>(null)

  const displayValue = value ?? defaultValue
  const isDefault = value === null

  useEffect(() => {
    if (!isCapturing) return

    const inputElement = inputRef.current

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        setPendingShortcut(null)
        setIsCapturing(false)
        return
      }

      const shortcut = keyEventToShortcut(event)
      if (shortcut) {
        setPendingShortcut(shortcut)
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (!pendingShortcut) return

      const valueToSave =
        pendingShortcut === defaultValue ? null : pendingShortcut
      onChange(valueToSave)
      setPendingShortcut(null)
      setIsCapturing(false)
    }

    const handleBlur = () => {
      setPendingShortcut(null)
      setIsCapturing(false)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    inputElement?.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      inputElement?.removeEventListener('blur', handleBlur)
    }
  }, [defaultValue, isCapturing, onChange, pendingShortcut])

  const handleClick = () => {
    if (disabled) return
    setIsCapturing(true)
    inputRef.current?.focus()
  }

  const handleReset = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (disabled) return
    onChange(null)
  }

  const handleKeyboardActivation = (
    event: ReactKeyboardEvent<HTMLDivElement>
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    handleClick()
  }

  return (
    <div className="flex items-center gap-2">
      <div
        ref={inputRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleClick}
        onKeyDown={handleKeyboardActivation}
        className={cn(
          'border-input h-9 min-w-[120px] rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none select-none',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'flex items-center justify-center font-mono',
          isCapturing && 'border-ring ring-ring/50 ring-[3px] bg-muted/50',
          disabled && 'pointer-events-none cursor-not-allowed opacity-50',
          className
        )}
        aria-label={t('preferences.general.quickPaneShortcut')}
      >
        {isCapturing ? (
          <span className="text-muted-foreground animate-pulse">
            {pendingShortcut
              ? formatShortcutForDisplay(pendingShortcut)
              : t('preferences.general.pressShortcut')}
          </span>
        ) : (
          <span className={isDefault ? 'text-muted-foreground' : ''}>
            {formatShortcutForDisplay(displayValue)}
          </span>
        )}
      </div>

      {!isDefault && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('common.reset')}
          title={t('common.reset')}
          onClick={handleReset}
        >
          <RotateCcw aria-hidden="true" size={14} strokeWidth={2} />
        </Button>
      ) : null}
    </div>
  )
}
