import '@fastify/jwt';
import type { onRequestHookHandler } from 'fastify';

/** Extend Fastify's type system with our JWT payload shape & custom decorator. */
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string };
    user: { sub: string; email: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: onRequestHookHandler;
  }
}
