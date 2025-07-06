import { Injectable, Logger } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

// Extend FastifyRequest to include cookies property
declare module 'fastify' {
  interface FastifyRequest {
    cookies: Record<string, string>;
  }
}

export interface UserContext {
  sessionCookie?: string;
  cookieName?: string;
  bearerToken?: string;
  authType: 'session' | 'bearer' | 'none';
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
   * Extract authentication context from request (session cookie or Bearer token)
   * No validation - just forward to target APIs
   */
  extractUserContext(request: FastifyRequest): UserContext {
    // First, check for Bearer token in Authorization header
    const authHeader = request.headers['authorization'] || request.headers['Authorization'];
    if (authHeader && typeof authHeader === 'string') {
      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      if (bearerMatch) {
        this.logger.debug('Found Bearer token in Authorization header');
        return {
          bearerToken: bearerMatch[1],
          authType: 'bearer'
        };
      }
    }

    // Then check for session cookie
    const cookies = request.cookies || {};
    const sessionCookie = cookies[this.sessionCookieName];
    
    if (sessionCookie) {
      this.logger.debug(`Found session cookie with name: ${this.sessionCookieName}`);
      return {
        sessionCookie,
        cookieName: this.sessionCookieName,
        authType: 'session'
      };
    }

    this.logger.debug('No authentication found (no Bearer token or session cookie)');
    return {
      authType: 'none'
    };
  }

  /**
   * Create headers to forward authentication to target APIs
   */
  createAuthHeaders(userContext: UserContext): Record<string, string> {
    if (!userContext || userContext.authType === 'none') {
      return {};
    }

    if (userContext.authType === 'bearer' && userContext.bearerToken) {
      return {
        'Authorization': `Bearer ${userContext.bearerToken}`
      };
    }

    if (userContext.authType === 'session' && userContext.sessionCookie && userContext.cookieName) {
      return {
        'Cookie': `${userContext.cookieName}=${userContext.sessionCookie}`
      };
    }

    return {};
  }

  /**
   * Get session cookie name for configuration
   */
  getSessionCookieName(): string {
    return this.sessionCookieName;
  }
} 