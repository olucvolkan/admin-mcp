/**
 * Simple EventEmitter implementation for browser compatibility
 */
export class EventEmitter {
  private events: { [key: string]: Function[] } = {};

  /**
   * Add an event listener
   */
  public on(event: string, listener: Function): this {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    return this;
  }

  /**
   * Add a one-time event listener
   */
  public once(event: string, listener: Function): this {
    const onceWrapper = (...args: any[]) => {
      listener(...args);
      this.off(event, onceWrapper);
    };
    return this.on(event, onceWrapper);
  }

  /**
   * Remove an event listener
   */
  public off(event: string, listener?: Function): this {
    if (!this.events[event]) return this;

    if (!listener) {
      delete this.events[event];
      return this;
    }

    const index = this.events[event].indexOf(listener);
    if (index > -1) {
      this.events[event].splice(index, 1);
    }

    if (this.events[event].length === 0) {
      delete this.events[event];
    }

    return this;
  }

  /**
   * Emit an event
   */
  public emit(event: string, ...args: any[]): boolean {
    if (!this.events[event]) return false;

    this.events[event].forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    });

    return true;
  }

  /**
   * Get all listeners for an event
   */
  public listeners(event: string): Function[] {
    return this.events[event] || [];
  }

  /**
   * Get all event names
   */
  public eventNames(): string[] {
    return Object.keys(this.events);
  }

  /**
   * Remove all listeners
   */
  public removeAllListeners(event?: string): this {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
    return this;
  }
}