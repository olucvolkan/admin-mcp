import { Injectable, Logger } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

// Extend FastifyRequest to include cookies property
declare module 'fastify' {
  interface FastifyRequest {
    cookies: Record<string, string>;
  }
}

export interface UserContext {
  sessionCookie: string;
  cookieName: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly sessionCookieName: string;

  constructor() {
    this.sessionCookieName = process.env.SESSION_COOKIE_NAME || 'session';
    this.logger.log(`Auth service initialized - session cookie: ${this.sessionCookieName}`);
  }

  /**
   * Extract session cookie from request
   * No validation - just forward to target APIs
   */
  extractUserContext(request: FastifyRequest): UserContext | null {
    const cookies = request.cookies || {};
    const sessionCookie = cookies[this.sessionCookieName];
    
    if (!sessionCookie) {
      this.logger.debug(`No session cookie found with name: ${this.sessionCookieName}`);
      return null;
    }

    return {
      sessionCookie,
      cookieName: this.sessionCookieName
    };
  }

  /**
   * Create headers to forward authentication to target APIs
   */
  createAuthHeaders(userContext: UserContext | null): Record<string, string> {
    if (!userContext) {
      return {};
    }

    return {
      'Cookie': `${userContext.cookieName}=${userContext.sessionCookie}`
    };
  }

  /**
   * Get session cookie name for configuration
   */
  getSessionCookieName(): string {
    return this.sessionCookieName;
  }
} 