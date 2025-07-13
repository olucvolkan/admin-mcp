/**
 * Simple Logger utility for debugging and information
 */
export class Logger {
  private context: string;
  private debug: boolean;

  constructor(context: string, debug: boolean = false) {
    this.context = context;
    this.debug = debug;
  }

  /**
   * Enable or disable debug mode
   */
  public setDebug(debug: boolean): void {
    this.debug = debug;
  }

  /**
   * Log info message
   */
  public info(message: string, ...args: any[]): void {
    console.log(`[${this.context}] ${message}`, ...args);
  }

  /**
   * Log warning message
   */
  public warn(message: string, ...args: any[]): void {
    console.warn(`[${this.context}] ${message}`, ...args);
  }

  /**
   * Log error message
   */
  public error(message: string, ...args: any[]): void {
    console.error(`[${this.context}] ${message}`, ...args);
  }

  /**
   * Log debug message (only if debug mode is enabled)
   */
  public debug(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`[${this.context}] [DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Log with custom level
   */
  public log(level: 'info' | 'warn' | 'error' | 'debug', message: string, ...args: any[]): void {
    switch (level) {
      case 'info':
        this.info(message, ...args);
        break;
      case 'warn':
        this.warn(message, ...args);
        break;
      case 'error':
        this.error(message, ...args);
        break;
      case 'debug':
        this.debug(message, ...args);
        break;
    }
  }
}