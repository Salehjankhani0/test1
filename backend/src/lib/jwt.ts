import jwt from 'jsonwebtoken';
import { env } from './env.ts';

export interface AuthTokenPayload {
  sub: string; // user id
  phone: string;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtTtlSeconds });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
  } catch {
    return null;
  }
}
