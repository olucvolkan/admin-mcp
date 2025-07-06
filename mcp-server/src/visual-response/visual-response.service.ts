import { Injectable, Logger } from '@nestjs/common';
import { JSONPathUtil } from './jsonpath.util';
import { TemplateStoreService } from './template-store.service';
import {
    ColumnDef,
    ColumnMapping,
    MappingTemplate,
    RowData,
    TransformationResult,
    VisualItem,
    VisualResponse
} from './visual-response.interfaces';

/**
 * Service responsible for transforming raw API responses into VisualResponse format
 */
@Injectable()
export class VisualResponseService {
  private readonly logger = new Logger(VisualResponseService.name);

  constructor(private templateStore: TemplateStoreService) {}

  /**
   * Transform raw response data into VisualResponse format
   */
  async transform(
    data: any, 
    endpoint: string, 
    method: string = 'GET',
    fallbackToAuto = true
  ): Promise<TransformationResult> {
    try {
      // Get template for this endpoint
      let template = await this.templateStore.getTemplate(endpoint, method);
      let usedFallback = false;
      let templateUsed = 'custom';

      // If no template found and auto-fallback enabled, generate one
      if (!template && fallbackToAuto) {
        this.logger.debug(`No template found for ${method} ${endpoint}, generating auto template`);
        template = await this.templateStore.generateTemplate(endpoint, method, null, data);
        usedFallback = true;
        templateUsed = 'auto-generated';
      }

      // If still no template, use basic fallback
      if (!template) {
        this.logger.warn(`No template found for ${method} ${endpoint}, using basic fallback`);
        return {
          success: true,
          visualResponse: this.createBasicFallback(data),
          usedFallback: true,
          templateUsed: 'basic-fallback'
        };
      }

      // Apply template to transform data
      const visualResponse = await this.applyTemplate(template, data);

      return {
        success: true,
        visualResponse,
        usedFallback,
        templateUsed
      };

    } catch (error) {
      this.logger.error(`Transformation failed for ${method} ${endpoint}:`, error);
      
      return {
        success: false,
        error: error.message,
        visualResponse: this.createErrorFallback(error.message, data),
        usedFallback: true,
        templateUsed: 'error-fallback'
      };
    }
  }

  /**
   * Apply a mapping template to transform data
   */
  private async applyTemplate(template: MappingTemplate, data: any): Promise<VisualResponse> {
    const visualResponse: VisualResponse = {
      layout: template.layout
    };

    // Set overall title if specified
    if (template.title) {
      visualResponse.title = typeof template.title === 'string' 
        ? template.title 
        : JSONPathUtil.evaluate(template.title, data);
    }

    if (!template.mappings) {
      return visualResponse;
    }

    try {
      switch (template.layout) {
        case 'card':
        case 'list':
        case 'detail':
          visualResponse.items = await this.transformToItems(template, data);
          break;
        
        case 'table':
          const tableResult = await this.transformToTable(template, data);
          visualResponse.columns = tableResult.columns;
          visualResponse.rows = tableResult.rows;
          break;
      }

      return visualResponse;

    } catch (error) {
      this.logger.error('Template application failed:', error);
      
      // Try fallback if specified
      if (template.fallback) {
        return {
          layout: template.fallback.layout,
          errorMessage: template.fallback.message || 'Template transformation failed, using fallback',
          items: template.fallback.layout === 'detail' ? [{ title: 'Raw Data', description: JSON.stringify(data, null, 2) }] : undefined
        };
      }

      throw error;
    }
  }

  /**
   * Transform data to items array for card/list/detail layouts
   */
  private async transformToItems(template: MappingTemplate, data: any): Promise<VisualItem[]> {
    const { mappings } = template;
    if (!mappings) return [];

    // Get items array from data
    let itemsData: any[];
    
    if (mappings.items) {
      const itemsResult = JSONPathUtil.evaluate(mappings.items, data);
      if (Array.isArray(itemsResult)) {
        itemsData = itemsResult;
      } else if (itemsResult) {
        itemsData = [itemsResult]; // Single item
      } else {
        itemsData = [data]; // Use entire data as single item
      }
    } else {
      // No items path specified, treat data as single item or array
      itemsData = Array.isArray(data) ? data : [data];
    }

    // Transform each item
    return itemsData.map(item => {
      const visualItem: VisualItem = {
        title: 'Untitled'
      };

      // Map title
      if (mappings.title) {
        const title = JSONPathUtil.evaluate(mappings.title, item);
        visualItem.title = title ? String(title) : 'Untitled';
      }

      // Map subtitle
      if (mappings.subtitle) {
        const subtitle = JSONPathUtil.evaluate(mappings.subtitle, item);
        if (subtitle) visualItem.subtitle = String(subtitle);
      }

      // Map description
      if (mappings.description) {
        const description = JSONPathUtil.evaluate(mappings.description, item);
        if (description) visualItem.description = String(description);
      }

      // Map image URL
      if (mappings.imageUrl) {
        const imageUrl = JSONPathUtil.evaluate(mappings.imageUrl, item);
        if (imageUrl && typeof imageUrl === 'string') {
          visualItem.imageUrl = imageUrl;
        }
      }

      // Map link URL
      if (mappings.linkUrl) {
        const linkUrl = JSONPathUtil.evaluate(mappings.linkUrl, item);
        if (linkUrl && typeof linkUrl === 'string') {
          visualItem.linkUrl = linkUrl;
        }
      }

      // For detail layout, include all fields as metadata
      if (template.layout === 'detail' && item && typeof item === 'object') {
        visualItem.metadata = { ...item };
      }

      return visualItem;
    });
  }

  /**
   * Transform data to table format
   */
  private async transformToTable(template: MappingTemplate, data: any): Promise<{ columns: ColumnDef[], rows: RowData[] }> {
    const { mappings } = template;
    if (!mappings?.columns) {
      throw new Error('Table layout requires column mappings');
    }

    // Get columns definition
    const columns: ColumnDef[] = mappings.columns.map((col: ColumnMapping) => ({
      field: col.field,
      header: col.header,
      type: col.type || 'string'
    }));

    // Get data array
    let rowsData: any[];
    if (mappings.items) {
      const itemsResult = JSONPathUtil.evaluate(mappings.items, data);
      rowsData = Array.isArray(itemsResult) ? itemsResult : [itemsResult];
    } else {
      rowsData = Array.isArray(data) ? data : [data];
    }

    // Transform rows
    const rows: RowData[] = rowsData.map(item => {
      const row: RowData = {};
      
      mappings.columns!.forEach((col: ColumnMapping) => {
        const value = JSONPathUtil.evaluate(col.path, item);
        row[col.field] = value !== null && value !== undefined ? value : '';
      });
      
      return row;
    });

    return { columns, rows };
  }

  /**
   * Create basic fallback VisualResponse
   */
  private createBasicFallback(data: any): VisualResponse {
    // If it's an array, show as list
    if (Array.isArray(data)) {
      return {
        layout: 'list',
        title: 'Data List',
        items: data.map((item, index) => ({
          title: `Item ${index + 1}`,
          description: typeof item === 'object' ? JSON.stringify(item, null, 2) : String(item)
        })),
        errorMessage: 'No template found, showing basic list view'
      };
    }

    // If it's an object, show as detail
    if (data && typeof data === 'object') {
      const entries = Object.entries(data);
      return {
        layout: 'detail',
        title: 'Data Details',
        items: [{
          title: 'Raw Data',
          description: entries.map(([key, value]) => 
            `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`
          ).join('\n')
        }],
        errorMessage: 'No template found, showing basic detail view'
      };
    }

    // Primitive value
    return {
      layout: 'detail',
      title: 'Data',
      items: [{
        title: 'Value',
        description: String(data)
      }],
      errorMessage: 'No template found, showing basic value view'
    };
  }

  /**
   * Create error fallback VisualResponse
   */
  private createErrorFallback(error: string, data: any): VisualResponse {
    return {
      layout: 'detail',
      title: 'Transformation Error',
      items: [{
        title: 'Error',
        description: error
      }, {
        title: 'Raw Data',
        description: JSON.stringify(data, null, 2)
      }],
      errorMessage: `Transformation failed: ${error}`
    };
  }

  /**
   * Validate a VisualResponse
   */
  validateVisualResponse(visualResponse: VisualResponse): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!visualResponse.layout) {
      errors.push('Layout is required');
    }

    if (visualResponse.layout === 'table') {
      if (!visualResponse.columns || visualResponse.columns.length === 0) {
        errors.push('Table layout requires columns');
      }
      if (!visualResponse.rows) {
        errors.push('Table layout requires rows');
      }
    }

    if (['card', 'list', 'detail'].includes(visualResponse.layout)) {
      if (!visualResponse.items || visualResponse.items.length === 0) {
        errors.push(`${visualResponse.layout} layout requires items`);
      } else {
        visualResponse.items.forEach((item, index) => {
          if (!item.title) {
            errors.push(`Item ${index} missing required title`);
          }
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get available templates for debugging
   */
  getAvailableTemplates(): Record<string, any> {
    return this.templateStore.getAllTemplates();
  }

  /**
   * Manually set a template
   */
  async setTemplate(endpoint: string, method: string, template: MappingTemplate): Promise<void> {
    await this.templateStore.setTemplate(endpoint, method, template);
  }

  /**
   * Test a template against sample data
   */
  async testTemplate(template: MappingTemplate, sampleData: any): Promise<TransformationResult> {
    try {
      const visualResponse = await this.applyTemplate(template, sampleData);
      const validation = this.validateVisualResponse(visualResponse);
      
      return {
        success: validation.valid,
        visualResponse,
        error: validation.valid ? undefined : validation.errors.join(', '),
        usedFallback: false,
        templateUsed: 'test'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        usedFallback: false,
        templateUsed: 'test'
      };
    }
  }
} 