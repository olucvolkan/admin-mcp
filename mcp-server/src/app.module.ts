import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { CacheService } from './cache/cache.service';
import { ChatController } from './chat/chat.controller';
import { ChatGateway } from './chat/chat.gateway';
import { ChatService } from './chat/chat.service';
import { Endpoint } from './entities/endpoint.entity';
import { FieldLink } from './entities/field-link.entity';
import { Project } from './entities/project.entity';
import { RequestParameter } from './entities/request-parameter.entity';
import { ResponseField } from './entities/response-field.entity';
import { ResponseMessage } from './entities/response-message.entity';
import { ExecutorService } from './executor/executor.service';
import { FormatterService } from './formatter/formatter.service';
import { OpenapiController } from './openapi.controller';
import { OpenapiService } from './openapi.service';
import { PlannerService } from './planner/planner.service';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('DATABASE_URL'),
      entities: [Project, Endpoint, RequestParameter, ResponseField, ResponseMessage, FieldLink],
        synchronize: true, // Set to false in production
        logging: ['error'],
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      Project,
      Endpoint,
      RequestParameter,
      ResponseField,
      ResponseMessage,
      FieldLink,
    ]),
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  controllers: [AppController, OpenapiController, ChatController],
  providers: [
    AppService,
    OpenapiService,
    ChatService,
    ChatGateway,
    PlannerService,
    ExecutorService,
    CacheService,
    FormatterService,
    AuthService,
    AuthGuard,
  ],
})
export class AppModule {}
