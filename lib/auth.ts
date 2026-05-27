import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-please-change-in-production'
);

export async function signToken(payload: { username: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as { username: string };
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function checkCredentials(username: string, password: string) {
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'password123';
  return username === adminUser && password === adminPass;
}
