import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { OpenapiService } from './openapi.service';

@ApiTags('OpenAPI')
@Controller()
export class OpenapiController {
  constructor(private readonly openapiService: OpenapiService) {}

  @Post('upload-openapi')
  @ApiOperation({ summary: 'Upload and parse OpenAPI file' })
  @ApiResponse({ status: 200, description: 'File uploaded and parsed successfully' })
  async upload(@Req() req: FastifyRequest): Promise<{ 
    status: string; 
    projectId: number; 
    endpointsCount: number; 
    message: string;
  }> {
    const file = await (req as any).file();
    const filePath = `/tmp/${Date.now()}_${file.filename}`;
    await writeFile(filePath, await file.toBuffer());
    
    const result = await this.openapiService.parseAndStore(filePath);
    
    return { 
      status: 'success',
      projectId: result.projectId,
      endpointsCount: result.endpointsCount,
      message: `Successfully parsed ${result.endpointsCount} endpoints and stored in project ${result.projectId}`
    };
  }

  @Post('parse-sample-openapi')
  @ApiOperation({ summary: 'Parse the sample OpenAPI file (openapi.json)' })
  @ApiResponse({ status: 200, description: 'Sample OpenAPI file parsed successfully' })
  async parseSampleOpenApi(): Promise<{ 
    status: string; 
    projectId: number; 
    endpointsCount: number; 
    message: string;
  }> {
    const filePath = join(__dirname, '../openapi.json');
    const result = await this.openapiService.parseAndStore(filePath);
    
    return { 
      status: 'success',
      projectId: result.projectId,
      endpointsCount: result.endpointsCount,
      message: `Successfully parsed Swagger Petstore API with ${result.endpointsCount} endpoints`
    };
  }

  @Post('chat')
  @ApiOperation({ summary: 'Echo chat message' })
  @ApiResponse({ status: 200, description: 'Message echoed back' })
  async chat(@Body('message') message: string): Promise<{ echo: string }> {
    return { echo: `You said: ${message}` };
  }
}
