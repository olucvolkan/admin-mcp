import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Endpoint } from './entities/endpoint.entity';
import { FieldLink } from './entities/field-link.entity';
import { Project } from './entities/project.entity';
import { RequestParameter } from './entities/request-parameter.entity';
import { ResponseField } from './entities/response-field.entity';
import { ResponseMessage } from './entities/response-message.entity';
import { OpenapiController } from './openapi.controller';
import { OpenapiService } from './openapi.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [Project, Endpoint, RequestParameter, ResponseField, ResponseMessage, FieldLink],
        synchronize: configService.get<string>('NODE_ENV') !== 'production', // Only in development
        logging: configService.get<string>('NODE_ENV') === 'development',
        ssl: configService.get<string>('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Project, Endpoint, RequestParameter, ResponseField, ResponseMessage, FieldLink]),
  ],
  controllers: [AppController, OpenapiController],
  providers: [AppService, OpenapiService],
})
export class AppModule {}
