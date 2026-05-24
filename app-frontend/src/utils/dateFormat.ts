/**
 * Date formatting utilities for HTML5 date inputs
 * Converts between ISO 8601 datetime strings and yyyy-MM-dd format
 */

/**
 * Convert any date value to yyyy-MM-dd format for HTML5 date inputs
 * Handles ISO 8601 strings, Date objects, and existing yyyy-MM-dd strings
 */
export function toDateInputFormat(date: string | Date | null | undefined): string {
  if (!date) return ''
  
  try {
    // If already in yyyy-MM-dd format, return as-is
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date
    }
    
    // Convert to Date object
    const dateObj = typeof date === 'string' ? new Date(date) : date
    
    // Check if valid date
    if (isNaN(dateObj.getTime())) {
      console.warn('[DateFormat] Invalid date:', date)
      return ''
    }
    
    // Format as yyyy-MM-dd
    const year = dateObj.getFullYear()
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    const day = String(dateObj.getDate()).padStart(2, '0')
    
    return `${year}-${month}-${day}`
  } catch (error) {
    console.error('[DateFormat] Error formatting date:', error)
    return ''
  }
}

/**
 * Get today's date in yyyy-MM-dd format
 */
export function getTodayDateInput(): string {
  return toDateInputFormat(new Date())
}

/**
 * Convert yyyy-MM-dd to ISO 8601 string for database storage
 */
export function toISOString(dateInput: string): string {
  if (!dateInput) return ''
  
  try {
    const date = new Date(dateInput)
    if (isNaN(date.getTime())) return ''
    return date.toISOString()
  } catch (error) {
    console.error('[DateFormat] Error converting to ISO:', error)
    return ''
  }
}
