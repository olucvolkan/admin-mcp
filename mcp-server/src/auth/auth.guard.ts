import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuthService, UserContext } from './auth.service';

// Extend Fastify Request interface to include user context
declare module 'fastify' {
  interface FastifyRequest {
    userContext?: UserContext;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    try {
      // Extract user context (session cookie or Bearer token) from request
      const userContext = this.authService.extractUserContext(request);
      
      // Add user context to request for use in controllers/services
      request.userContext = userContext;

      // Log authentication status (without sensitive data)
      if (userContext?.authType === 'bearer') {
        this.logger.debug('Request with Bearer token authentication');
      } else if (userContext?.authType === 'session') {
        this.logger.debug(`Request with session cookie: ${userContext.cookieName}`);
      } else {
        this.logger.debug('Request without authentication');
      }

      // Always allow the request - authentication will be handled by target APIs
      return true;

    } catch (error) {
      this.logger.error(`Error extracting user context: ${error.message}`, error.stack);
      
      // Even if there's an error, allow the request to proceed
      // The target API will handle authentication
      return true;
    }
  }
} 