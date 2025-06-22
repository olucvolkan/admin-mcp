import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import SwaggerParser from '@apidevtools/swagger-parser';
import { Project } from './entities/project.entity';
import { Endpoint } from './entities/endpoint.entity';

@Injectable()
export class OpenapiService {
  constructor(
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
    @InjectRepository(Endpoint)
    private endpointRepo: Repository<Endpoint>,
  ) {}

  async parseAndStore(filePath: string): Promise<void> {
    const parsed = await SwaggerParser.dereference(filePath);
    const project = await this.projectRepo.save({ name: parsed.info?.title || 'OpenAPI Project' });
    const paths = (parsed as any).paths || {};
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method] of Object.entries(methods as Record<string, any>)) {
        await this.endpointRepo.save({ path, method, project });
      }
    }
  }
}
