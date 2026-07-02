import {
  debug as writeDebug,
  error as writeError,
  info as writeInfo,
  trace as writeTrace,
  warn as writeWarn,
  type LogOptions,
} from '@tauri-apps/plugin-log'

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'
export type LogContext = Record<string, unknown>

type LogEntry = {
  level: LogLevel
  message: string
  timestamp: Date
  context?: LogContext
}

type BackendLogger = (message: string, options?: LogOptions) => Promise<void>

const backendLoggers: Record<LogLevel, BackendLogger> = {
  trace: writeTrace,
  debug: writeDebug,
  info: writeInfo,
  warn: writeWarn,
  error: writeError,
}

function stringifyContextValue(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return String(value)
  }

  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

export function serializeContext(
  context?: LogContext
): Record<string, string> | undefined {
  if (!context) return undefined

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      stringifyContextValue(value),
    ])
  )
}

class Logger {
  private isDevelopment = import.meta.env.DEV

  trace = (message: string, context?: LogContext): void => {
    this.log('trace', message, context)
  }

  debug = (message: string, context?: LogContext): void => {
    this.log('debug', message, context)
  }

  info = (message: string, context?: LogContext): void => {
    this.log('info', message, context)
  }

  warn = (message: string, context?: LogContext): void => {
    this.log('warn', message, context)
  }

  error = (message: string, context?: LogContext): void => {
    this.log('error', message, context)
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
    }

    if (this.isDevelopment) {
      this.logToConsole(entry)
    }

    void this.logToBackend(entry)
  }

  private async logToBackend(entry: LogEntry): Promise<void> {
    const keyValues = serializeContext(entry.context)

    try {
      await backendLoggers[entry.level](
        entry.message,
        keyValues ? { keyValues } : undefined
      )
    } catch (error) {
      if (this.isDevelopment) {
        console.warn('Failed to write log through Tauri plugin:', error)
      }
    }
  }

  private logToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString()
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}]`
    const args = entry.context
      ? [prefix, entry.message, entry.context]
      : [prefix, entry.message]

    switch (entry.level) {
      case 'trace':
      case 'debug':
        console.debug(...args)
        break
      case 'info':
        console.info(...args)
        break
      case 'warn':
        console.warn(...args)
        break
      case 'error':
        console.error(...args)
        break
    }
  }
}

export const logger = new Logger()
export const { trace, debug, info, warn, error } = logger
