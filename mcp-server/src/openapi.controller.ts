import { Controller, Post, Req, Body } from '@nestjs/common';
import { OpenapiService } from './openapi.service';
import { writeFile } from 'fs/promises';
import { FastifyRequest } from 'fastify';

@Controller()
export class OpenapiController {
  constructor(private readonly openapiService: OpenapiService) {}

  @Post('upload-openapi')
  async upload(@Req() req: FastifyRequest): Promise<{ status: string }> {
    const file = await (req as any).file();
    const filePath = `/tmp/${Date.now()}_${file.filename}`;
    await writeFile(filePath, await file.toBuffer());
    await this.openapiService.parseAndStore(filePath);
    return { status: 'ok' };
  }

  @Post('chat')
  async chat(@Body('message') message: string): Promise<{ echo: string }> {
    return { echo: `You said: ${message}` };
  }
}
