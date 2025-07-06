import { Module } from '@nestjs/common';
import { TemplateStoreService } from './template-store.service';
import { VisualResponseController } from './visual-response.controller';
import { VisualResponseService } from './visual-response.service';

@Module({
  controllers: [VisualResponseController],
  providers: [
    VisualResponseService,
    TemplateStoreService,
  ],
  exports: [
    VisualResponseService,
    TemplateStoreService,
  ],
})
export class VisualResponseModule {} 