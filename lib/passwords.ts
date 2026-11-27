import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';

const derive = promisify(scrypt);
const cookieName = 'romagnole-session';
const sessionSeconds = 8 * 60 * 60;

export type Credential = {hash:string; version:string; temporary:boolean};
export type Credentials = Record<string,Credential>;

export function adminEmail() {
  return (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
}

export function validPassword(value:unknown): value is string {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}

export async function makeCredential(password:string, temporary:boolean):Promise<Credential> {
  const salt = randomBytes(16).toString('hex');
  const digest = await derive(password,salt,64) as Buffer;
  return {hash:salt+':'+digest.toString('hex'),version:randomUUID(),temporary};
}

function equal(a:string,b:string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left,right);
}

export async function verifyPassword(password:string, hash:string) {
  const [salt,digest] = hash.split(':');
  const candidate = await derive(password,salt,64) as Buffer;
  return equal(candidate.toString('hex'),digest);
}

export function verifyAdmin(password:string) {
  const configured = process.env.ADMIN_PASSWORD;
  return validPassword(configured) && equal(sign(password),sign(configured));
}

function sign(value:string) {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('Configure AUTH_SESSION_SECRET.');
  return createHmac('sha256',secret).update(value).digest('base64url');
}

function signature(payload:string,version:string) {
  return sign(JSON.stringify([payload,version]));
}

export function sessionVersion(email:string, credentials:Credentials) {
  if (email === adminEmail()) return validPassword(process.env.ADMIN_PASSWORD) ? process.env.ADMIN_PASSWORD : undefined;
  return Object.hasOwn(credentials,email) ? credentials[email].version : undefined;
}

export async function readSession(credentials:Credentials) {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const [payload,mac,extra] = token.split('.');
  if (!payload || !mac || extra !== undefined) return null;
  let session: {email?:unknown; expires?:unknown};
  try { session = JSON.parse(Buffer.from(payload,'base64url').toString('utf8')); }
  catch { return null; }
  if (!session || typeof session.email !== 'string' || typeof session.expires !== 'number' || session.expires <= Date.now()) return null;
  const version = sessionVersion(session.email,credentials);
  return version && equal(mac,signature(payload,version)) ? session.email : null;
}

export async function issueSession(email:string,version:string) {
  const payload = Buffer.from(JSON.stringify({email,expires:Date.now()+sessionSeconds*1000})).toString('base64url');
  (await cookies()).set(cookieName,payload+'.'+signature(payload,version),{
    httpOnly:true,sameSite:'lax',secure:process.env.VERCEL==='1' || process.env.SITE_URL?.startsWith('https://'),
    path:'/',maxAge:sessionSeconds
  });
}

export async function clearSession() {
  (await cookies()).delete(cookieName);
}
