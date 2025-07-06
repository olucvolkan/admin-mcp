import { Injectable } from '@nestjs/common';
import { MappingTemplate, TemplateStore } from './visual-response.interfaces';

/**
 * In-memory template store for managing Visual Response mapping templates
 * This can be extended to use a database or file system in the future
 */
@Injectable()
export class TemplateStoreService implements TemplateStore {
  private templates = new Map<string, MappingTemplate>();

  constructor() {
    this.initializeDefaultTemplates();
  }

  /**
   * Get template for a specific endpoint and method
   */
  async getTemplate(endpoint: string, method: string): Promise<MappingTemplate | null> {
    const key = this.createKey(endpoint, method);
    return this.templates.get(key) || null;
  }

  /**
   * Set template for a specific endpoint and method
   */
  async setTemplate(endpoint: string, method: string, template: MappingTemplate): Promise<void> {
    const key = this.createKey(endpoint, method);
    this.templates.set(key, template);
  }

  /**
   * Generate template using LLM (placeholder for now)
   */
  async generateTemplate(endpoint: string, method: string, openApiSpec: any, sampleResponse: any): Promise<MappingTemplate> {
    // This is a placeholder for LLM integration
    // For now, return a basic template based on the response structure
    return this.createBasicTemplate(sampleResponse);
  }

  /**
   * Get all templates (for debugging/admin purposes)
   */
  getAllTemplates(): Record<string, MappingTemplate> {
    const result: Record<string, MappingTemplate> = {};
    this.templates.forEach((template, key) => {
      result[key] = template;
    });
    return result;
  }

  /**
   * Remove template
   */
  async removeTemplate(endpoint: string, method: string): Promise<boolean> {
    const key = this.createKey(endpoint, method);
    return this.templates.delete(key);
  }

  /**
   * Create key for template storage
   */
  private createKey(endpoint: string, method: string): string {
    return `${method.toUpperCase()}:${endpoint}`;
  }

  /**
   * Initialize some default templates for common patterns
   */
  private initializeDefaultTemplates(): void {
    // Example template for Show Radyo API (from the README example)
    this.templates.set('GET:/api/radyo/stations', {
      layout: 'card',
      title: 'Radio Stations',
      mappings: {
        items: '$.data.data',
        title: '$.name',
        subtitle: {
          type: 'jsonpath',
          value: '$.created_at',
          format: 'date'
        },
        imageUrl: '$.logo.url',
        linkUrl: '$.stream_link'
      },
      fallback: {
        layout: 'list',
        message: 'Using fallback layout for radio stations'
      }
    });

    // Generic list template
    this.templates.set('GET:/api/generic/list', {
      layout: 'list',
      mappings: {
        items: '$.data',
        title: '$.name',
        subtitle: '$.description'
      }
    });

    // Generic detail template
    this.templates.set('GET:/api/generic/detail', {
      layout: 'detail',
      mappings: {
        items: '$',
        title: '$.name',
        description: '$.description'
      }
    });

    // User list template (common pattern)
    this.templates.set('GET:/api/users', {
      layout: 'table',
      title: 'Users',
      mappings: {
        columns: [
          { field: 'id', header: 'ID', path: '$.id', type: 'number' },
          { field: 'name', header: 'Name', path: '$.name', type: 'string' },
          { field: 'email', header: 'Email', path: '$.email', type: 'string' },
          { field: 'created', header: 'Created', path: '$.created_at', type: 'date' }
        ]
      }
    });
  }

  /**
   * Create a basic template by analyzing response structure
   */
  private createBasicTemplate(sampleResponse: any): MappingTemplate {
    if (!sampleResponse) {
      return {
        layout: 'detail',
        mappings: {
          items: '$'
        }
      };
    }

    // If response has data array, use list/card layout
    if (this.hasArrayData(sampleResponse)) {
      const firstItem = this.getFirstArrayItem(sampleResponse);
      
      // If item has image-like fields, use card layout
      if (this.hasImageField(firstItem)) {
        return {
          layout: 'card',
          mappings: {
            items: this.findArrayPath(sampleResponse),
            title: this.findTitleField(firstItem),
            subtitle: this.findSubtitleField(firstItem),
            imageUrl: this.findImageField(firstItem),
            linkUrl: this.findLinkField(firstItem)
          }
        };
      }

      // If has multiple fields, use table layout
      if (this.hasMultipleFields(firstItem)) {
        return {
          layout: 'table',
          mappings: {
            columns: this.generateTableColumns(firstItem)
          }
        };
      }

      // Otherwise use simple list
      return {
        layout: 'list',
        mappings: {
          items: this.findArrayPath(sampleResponse),
          title: this.findTitleField(firstItem)
        }
      };
    }

    // Single object - use detail layout
    return {
      layout: 'detail',
      mappings: {
        items: '$',
        title: this.findTitleField(sampleResponse),
        description: this.findDescriptionField(sampleResponse)
      }
    };
  }

  private hasArrayData(obj: any): boolean {
    if (Array.isArray(obj)) return true;
    if (obj && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        if (Array.isArray(obj[key])) return true;
        if (obj[key] && typeof obj[key] === 'object' && this.hasArrayData(obj[key])) return true;
      }
    }
    return false;
  }

  private getFirstArrayItem(obj: any): any {
    if (Array.isArray(obj) && obj.length > 0) return obj[0];
    if (obj && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        if (Array.isArray(obj[key]) && obj[key].length > 0) return obj[key][0];
        if (obj[key] && typeof obj[key] === 'object') {
          const item = this.getFirstArrayItem(obj[key]);
          if (item) return item;
        }
      }
    }
    return null;
  }

  private findArrayPath(obj: any, path = '$'): string {
    if (Array.isArray(obj)) return path;
    if (obj && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        if (Array.isArray(obj[key])) return `${path}.${key}`;
        if (obj[key] && typeof obj[key] === 'object') {
          const result = this.findArrayPath(obj[key], `${path}.${key}`);
          if (result !== `${path}.${key}`) return result;
        }
      }
    }
    return path;
  }

  private hasImageField(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const imageFields = ['image', 'img', 'logo', 'avatar', 'picture', 'photo', 'thumbnail'];
    return Object.keys(obj).some(key => 
      imageFields.some(field => key.toLowerCase().includes(field)) ||
      (obj[key] && typeof obj[key] === 'string' && this.looksLikeImageUrl(obj[key]))
    );
  }

  private hasMultipleFields(obj: any): boolean {
    return obj && typeof obj === 'object' && Object.keys(obj).length > 3;
  }

  private findTitleField(obj: any): string {
    if (!obj || typeof obj !== 'object') return '$.';
    const titleFields = ['name', 'title', 'label', 'displayName', 'firstName'];
    for (const field of titleFields) {
      if (obj[field]) return `$.${field}`;
    }
    const keys = Object.keys(obj);
    return keys.length > 0 ? `$.${keys[0]}` : '$.';
  }

  private findSubtitleField(obj: any): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    const subtitleFields = ['description', 'subtitle', 'summary', 'created_at', 'updated_at', 'type'];
    for (const field of subtitleFields) {
      if (obj[field]) return `$.${field}`;
    }
    return undefined;
  }

  private findDescriptionField(obj: any): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    const descFields = ['description', 'details', 'summary', 'content', 'body'];
    for (const field of descFields) {
      if (obj[field]) return `$.${field}`;
    }
    return undefined;
  }

  private findImageField(obj: any): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    
    // Look for direct image fields
    const imageFields = ['image', 'img', 'logo', 'avatar', 'picture', 'photo', 'thumbnail'];
    for (const field of imageFields) {
      if (obj[field]) {
        // Check if it's a nested object with url
        if (obj[field] && typeof obj[field] === 'object' && obj[field].url) {
          return `$.${field}.url`;
        } else if (typeof obj[field] === 'string') {
          return `$.${field}`;
        }
      }
    }

    // Look for URL fields that might be images
    for (const key of Object.keys(obj)) {
      if (key.toLowerCase().includes('url') || key.toLowerCase().includes('link')) {
        const value = obj[key];
        if (typeof value === 'string' && this.looksLikeImageUrl(value)) {
          return `$.${key}`;
        }
      }
    }

    return undefined;
  }

  private findLinkField(obj: any): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    const linkFields = ['url', 'link', 'href', 'website', 'stream_link'];
    for (const field of linkFields) {
      if (obj[field] && typeof obj[field] === 'string') {
        return `$.${field}`;
      }
    }
    return undefined;
  }

  private looksLikeImageUrl(url: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
    const lowerUrl = url.toLowerCase();
    return imageExtensions.some(ext => lowerUrl.includes(ext));
  }

  private generateTableColumns(obj: any): any[] {
    if (!obj || typeof obj !== 'object') return [];
    
    return Object.keys(obj).slice(0, 6).map(key => ({
      field: key,
      header: this.formatHeader(key),
      path: `$.${key}`,
      type: this.inferColumnType(obj[key])
    }));
  }

  private formatHeader(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  private inferColumnType(value: any): string {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') {
      if (value.match(/^\d{4}-\d{2}-\d{2}/)) return 'date';
      if (value.startsWith('http')) return 'url';
      if (this.looksLikeImageUrl(value)) return 'image';
    }
    return 'string';
  }
} 