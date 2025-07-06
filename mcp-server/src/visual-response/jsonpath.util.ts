import { MappingExpression } from './visual-response.interfaces';

/**
 * Simple JSONPath utility for evaluating template expressions
 */
export class JSONPathUtil {
  /**
   * Evaluate a mapping expression against input data
   */
  static evaluate(expression: string | MappingExpression, data: any): any {
    if (typeof expression === 'string') {
      return this.evaluateJSONPath(expression, data);
    }

    switch (expression.type) {
      case 'jsonpath':
        const result = this.evaluateJSONPath(expression.value, data);
        return expression.format ? this.formatValue(result, expression.format) : result;
      
      case 'static':
        return expression.value;
      
      case 'function':
        return this.evaluateFunction(expression.value, data);
      
      default:
        return null;
    }
  }

  /**
   * Evaluate JSONPath expression
   * Supports basic JSONPath syntax: $.field, $.field.subfield, $[0], $.field[*]
   */
  private static evaluateJSONPath(path: string, data: any): any {
    if (!path || !data) return null;

    // Remove leading $. if present
    const cleanPath = path.replace(/^\$\.?/, '');
    
    if (cleanPath === '' || cleanPath === '$') {
      return data;
    }

    try {
      return this.resolvePath(cleanPath, data);
    } catch (error) {
      console.warn(`JSONPath evaluation failed for path "${path}":`, error);
      return null;
    }
  }

  /**
   * Resolve a dot-notation path in an object
   */
  private static resolvePath(path: string, obj: any): any {
    if (!obj || typeof obj !== 'object') return null;

    const parts = this.parsePath(path);
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return null;
      }

      if (part.type === 'property') {
        current = current[part.value];
      } else if (part.type === 'index') {
        if (Array.isArray(current)) {
          const index = parseInt(part.value, 10);
          current = current[index];
        } else {
          return null;
        }
      } else if (part.type === 'wildcard') {
        if (Array.isArray(current)) {
          return current; // Return the array for further processing
        } else {
          return null;
        }
      }
    }

    return current;
  }

  /**
   * Parse path into components
   */
  private static parsePath(path: string): Array<{ type: 'property' | 'index' | 'wildcard'; value: string }> {
    const parts: Array<{ type: 'property' | 'index' | 'wildcard'; value: string }> = [];
    const segments = path.split('.');

    for (const segment of segments) {
      if (segment.includes('[')) {
        // Handle array notation: field[0] or field[*]
        const [fieldName, bracket] = segment.split('[');
        if (fieldName) {
          parts.push({ type: 'property', value: fieldName });
        }
        
        const indexPart = bracket.replace(']', '');
        if (indexPart === '*') {
          parts.push({ type: 'wildcard', value: '*' });
        } else if (!isNaN(parseInt(indexPart, 10))) {
          parts.push({ type: 'index', value: indexPart });
        }
      } else {
        parts.push({ type: 'property', value: segment });
      }
    }

    return parts;
  }

  /**
   * Format a value according to format string
   */
  private static formatValue(value: any, format: string): any {
    if (value === null || value === undefined) return value;

    switch (format.toLowerCase()) {
      case 'date':
        return this.formatDate(value);
      case 'uppercase':
        return String(value).toUpperCase();
      case 'lowercase':
        return String(value).toLowerCase();
      case 'capitalize':
        return String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase();
      case 'currency':
        return this.formatCurrency(value);
      default:
        return value;
    }
  }

  /**
   * Format date value
   */
  private static formatDate(value: any): string {
    if (!value) return '';
    
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return String(value);
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return String(value);
    }
  }

  /**
   * Format currency value
   */
  private static formatCurrency(value: any): string {
    const num = parseFloat(value);
    if (isNaN(num)) return String(value);
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(num);
  }

  /**
   * Evaluate simple function expressions
   */
  private static evaluateFunction(funcExpression: string, data: any): any {
    // Support basic functions like concat($.field1, " - ", $.field2)
    if (funcExpression.startsWith('concat(')) {
      return this.evaluateConcat(funcExpression, data);
    }
    
    // Add more functions as needed
    return null;
  }

  /**
   * Evaluate concat function
   */
  private static evaluateConcat(expression: string, data: any): string {
    const content = expression.slice(7, -1); // Remove 'concat(' and ')'
    const parts = this.parseFunction(content);
    
    return parts.map(part => {
      if (part.startsWith('"') && part.endsWith('"')) {
        return part.slice(1, -1); // String literal
      } else if (part.startsWith('$')) {
        return this.evaluateJSONPath(part, data) || '';
      }
      return part;
    }).join('');
  }

  /**
   * Parse function arguments
   */
  private static parseFunction(content: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      
      if (char === '"' && (i === 0 || content[i - 1] !== '\\')) {
        inQuotes = !inQuotes;
        current += char;
      } else if (char === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      parts.push(current.trim());
    }
    
    return parts;
  }
} 