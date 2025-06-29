import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true })
  );

  // Register cookie plugin for session handling
  await app.register(require('@fastify/cookie'), {
    secret: process.env.COOKIE_SECRET || 'default-secret-change-in-production',
  });

  // Register multipart form data plugin for file uploads
  await app.register(require('@fastify/multipart'), {
    limits: {
      fieldNameSize: 100, // Max field name size in bytes
      fieldSize: 100,     // Max field value size in bytes
      fields: 10,         // Max number of non-file fields
      fileSize: 50 * 1024 * 1024, // Max file size: 50MB
      files: 1,           // Max number of file fields
      headerPairs: 2000   // Max number of header key=>value pairs
    }
  });

  // Register static file serving for test UI
  await app.register(require('@fastify/static'), {
    root: require('path').join(__dirname, '..', 'public'),
    prefix: '/',
  });

  // CORS configuration - simplified
  app.enableCors({
    origin: true, // Allow all origins in development
    credentials: true, // Enable credentials for cookie support
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  
  console.log(`🚀 MCP Server is running on port ${port}`);
  console.log(`📚 Session cookie name: ${process.env.SESSION_COOKIE_NAME || 'session'}`);
  console.log(`📁 File upload enabled with 50MB limit`);
}

bootstrap();
