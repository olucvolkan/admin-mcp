import {
    Body,
    Controller,
    Delete,
    Get,
    HttpException,
    HttpStatus,
    Param,
    Post,
    Put
} from '@nestjs/common';
import { TemplateStoreService } from './template-store.service';
import {
    MappingTemplate,
    TransformationResult,
    VisualResponse
} from './visual-response.interfaces';
import { VisualResponseService } from './visual-response.service';

@Controller('visual-response')
export class VisualResponseController {
  constructor(
    private visualResponseService: VisualResponseService,
    private templateStore: TemplateStoreService
  ) {}

  /**
   * Test transformation of sample data
   */
  @Post('test')
  async testTransformation(
    @Body() body: {
      data: any;
      endpoint: string;
      method?: string;
      useTemplate?: boolean;
    }
  ): Promise<TransformationResult> {
    try {
      const { data, endpoint, method = 'GET', useTemplate = true } = body;
      
      return await this.visualResponseService.transform(
        data, 
        endpoint, 
        method, 
        useTemplate
      );
    } catch (error) {
      throw new HttpException(
        `Transformation test failed: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Test a specific template against sample data
   */
  @Post('test-template')
  async testTemplate(
    @Body() body: {
      template: MappingTemplate;
      sampleData: any;
    }
  ): Promise<TransformationResult> {
    try {
      const { template, sampleData } = body;
      
      return await this.visualResponseService.testTemplate(template, sampleData);
    } catch (error) {
      throw new HttpException(
        `Template test failed: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Get all available templates
   */
  @Get('templates')
  getTemplates(): Record<string, MappingTemplate> {
    return this.visualResponseService.getAvailableTemplates();
  }

  /**
   * Get a specific template
   */
  @Get('templates/:endpoint/:method')
  async getTemplate(
    @Param('endpoint') endpoint: string,
    @Param('method') method: string
  ): Promise<MappingTemplate | null> {
    // Decode URL-encoded endpoint
    const decodedEndpoint = decodeURIComponent(endpoint);
    return await this.templateStore.getTemplate(decodedEndpoint, method.toUpperCase());
  }

  /**
   * Set or update a template
   */
  @Put('templates/:endpoint/:method')
  async setTemplate(
    @Param('endpoint') endpoint: string,
    @Param('method') method: string,
    @Body() template: MappingTemplate
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Decode URL-encoded endpoint
      const decodedEndpoint = decodeURIComponent(endpoint);
      
      await this.visualResponseService.setTemplate(
        decodedEndpoint, 
        method.toUpperCase(), 
        template
      );
      
      return {
        success: true,
        message: `Template for ${method.toUpperCase()} ${decodedEndpoint} updated successfully`
      };
    } catch (error) {
      throw new HttpException(
        `Failed to set template: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Delete a template
   */
  @Delete('templates/:endpoint/:method')
  async deleteTemplate(
    @Param('endpoint') endpoint: string,
    @Param('method') method: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Decode URL-encoded endpoint
      const decodedEndpoint = decodeURIComponent(endpoint);
      
      const deleted = await this.templateStore.removeTemplate(
        decodedEndpoint, 
        method.toUpperCase()
      );
      
      if (deleted) {
        return {
          success: true,
          message: `Template for ${method.toUpperCase()} ${decodedEndpoint} deleted successfully`
        };
      } else {
        return {
          success: false,
          message: `Template for ${method.toUpperCase()} ${decodedEndpoint} not found`
        };
      }
    } catch (error) {
      throw new HttpException(
        `Failed to delete template: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Generate template from sample data (using auto-generation)
   */
  @Post('generate-template')
  async generateTemplate(
    @Body() body: {
      endpoint: string;
      method?: string;
      sampleResponse: any;
      openApiSpec?: any;
    }
  ): Promise<MappingTemplate> {
    try {
      const { endpoint, method = 'GET', sampleResponse, openApiSpec } = body;
      
      return await this.templateStore.generateTemplate(
        endpoint,
        method.toUpperCase(),
        openApiSpec,
        sampleResponse
      );
    } catch (error) {
      throw new HttpException(
        `Template generation failed: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Validate a visual response structure
   */
  @Post('validate')
  validateVisualResponse(@Body() visualResponse: VisualResponse): {
    valid: boolean;
    errors: string[];
  } {
    return this.visualResponseService.validateVisualResponse(visualResponse);
  }

  /**
   * Get example templates for different layouts
   */
  @Get('examples')
  getExampleTemplates(): Record<string, MappingTemplate> {
    return {
      card: {
        layout: 'card',
        title: 'Sample Cards',
        mappings: {
          items: '$.data',
          title: '$.name',
          subtitle: '$.description',
          imageUrl: '$.image_url',
          linkUrl: '$.url'
        }
      },
      table: {
        layout: 'table',
        title: 'Sample Table',
        mappings: {
          items: '$.data',
          columns: [
            { field: 'id', header: 'ID', path: '$.id', type: 'number' },
            { field: 'name', header: 'Name', path: '$.name', type: 'string' },
            { field: 'created', header: 'Created', path: '$.created_at', type: 'date' }
          ]
        }
      },
      list: {
        layout: 'list',
        title: 'Sample List',
        mappings: {
          items: '$.data',
          title: '$.name',
          subtitle: '$.status'
        }
      },
      detail: {
        layout: 'detail',
        title: 'Sample Detail',
        mappings: {
          items: '$',
          title: '$.name',
          description: '$.full_description'
        }
      }
    };
  }

  /**
   * Get transformation stats
   */
  @Get('stats')
  getStats(): {
    totalTemplates: number;
    templatesByLayout: Record<string, number>;
    templates: Array<{
      endpoint: string;
      method: string;
      layout: string;
    }>;
  } {
    const templates = this.visualResponseService.getAvailableTemplates();
    const templateEntries = Object.entries(templates);
    
    const templatesByLayout: Record<string, number> = {};
    const templateDetails: Array<{
      endpoint: string;
      method: string;
      layout: string;
    }> = [];

    templateEntries.forEach(([key, template]) => {
      const [method, endpoint] = key.split(':', 2);
      
      // Count by layout
      templatesByLayout[template.layout] = (templatesByLayout[template.layout] || 0) + 1;
      
      // Add to details
      templateDetails.push({
        endpoint,
        method,
        layout: template.layout
      });
    });

    return {
      totalTemplates: templateEntries.length,
      templatesByLayout,
      templates: templateDetails
    };
  }
} 