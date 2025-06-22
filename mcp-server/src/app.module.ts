import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OpenapiController } from './openapi.controller';
import { OpenapiService } from './openapi.service';
import { Project } from './entities/project.entity';
import { Endpoint } from './entities/endpoint.entity';
import { RequestParameter } from './entities/request-parameter.entity';
import { ResponseField } from './entities/response-field.entity';
import { ResponseMessage } from './entities/response-message.entity';
import { FieldLink } from './entities/field-link.entity';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'db.sqlite',
      entities: [Project, Endpoint, RequestParameter, ResponseField, ResponseMessage, FieldLink],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Project, Endpoint, RequestParameter, ResponseField, ResponseMessage, FieldLink]),
  ],
  controllers: [AppController, OpenapiController],
  providers: [AppService, OpenapiService],
})
export class AppModule {}
