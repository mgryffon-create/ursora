import type { User } from 'npm:@supabase/supabase-js@2';
import { adminClient } from './db.ts';

export async function requireUser(req: Request): Promise<{ user: User; db: ReturnType<typeof adminClient> }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Authentication required.', 401);
  }

  const token = authHeader.slice(7).trim();
  if (!token) throw new AuthError('Authentication required.', 401);

  const db = adminClient();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw new AuthError('Invalid or expired session.', 401);

  return { user, db };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}
