/**
 * Centralized Logging Utility for SurveyPro
 * 
 * Provides consistent logging across the application with:
 * - Environment-aware logging (dev vs production)
 * - Categorized log levels
 * - Structured log messages
 * - Easy debugging and filtering
 * 
 * Usage:
 * ```typescript
 * import { logger } from '@/utils/logger'
 * 
 * logger.info('User logged in', { userId: 123 })
 * logger.error('Failed to save parcel', error)
 * logger.debug('Calculation result', { area: 1234.56 })
 * ```
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  [key: string]: any
}

class Logger {
  private isDevelopment: boolean
  private enabledLevels: Set<LogLevel>

  constructor() {
    this.isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development'
    
    // In production, only log warnings and errors
    // In development, log everything
    this.enabledLevels = new Set(
      this.isDevelopment 
        ? ['debug', 'info', 'warn', 'error']
        : ['warn', 'error']
    )
  }

  /**
   * Debug-level logging (development only)
   * Use for detailed debugging information
   */
  debug(message: string, context?: LogContext): void {
    if (this.enabledLevels.has('debug')) {
      console.log(`[DEBUG] ${message}`, context || '')
    }
  }

  /**
   * Info-level logging (development only)
   * Use for general information and progress updates
   */
  info(message: string, context?: LogContext): void {
    if (this.enabledLevels.has('info')) {
      console.log(`[INFO] ${message}`, context || '')
    }
  }

  /**
   * Warning-level logging (always enabled)
   * Use for recoverable errors or important notices
   */
  warn(message: string, context?: LogContext): void {
    if (this.enabledLevels.has('warn')) {
      console.warn(`[WARN] ${message}`, context || '')
    }
  }

  /**
   * Error-level logging (always enabled)
   * Use for errors that need attention
   */
  error(message: string, error?: Error | LogContext): void {
    if (this.enabledLevels.has('error')) {
      if (error instanceof Error) {
        console.error(`[ERROR] ${message}`, {
          message: error.message,
          stack: error.stack
        })
      } else {
        console.error(`[ERROR] ${message}`, error || '')
      }
    }
  }

  /**
   * Group-start for related log messages
   * Automatically collapsed in production
   */
  group(label: string): void {
    if (this.isDevelopment) {
      console.group(label)
    } else {
      console.groupCollapsed(label)
    }
  }

  /**
   * End log group
   */
  groupEnd(): void {
    console.groupEnd()
  }

  /**
   * Performance timing utility
   * Returns a function to end the timer
   */
  time(label: string): () => void {
    if (this.isDevelopment) {
      console.time(label)
      return () => console.timeEnd(label)
    }
    return () => {} // No-op in production
  }

  /**
   * Table logging for structured data
   * Development only
   */
  table(data: any): void {
    if (this.isDevelopment) {
      console.table(data)
    }
  }
}

// Export singleton instance
export const logger = new Logger()

// Export convenience functions
export const log = logger.info.bind(logger)
export const debug = logger.debug.bind(logger)
export const warn = logger.warn.bind(logger)
export const error = logger.error.bind(logger)
