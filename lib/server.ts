import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { demoProfile, type Data, type Profile } from './model';
import { initialData } from './seed';

export const demo = process.env.VERCEL !== '1' && (process.env.DEMO_MODE === 'true' ||
  (process.env.NODE_ENV === 'development' && !process.env.SUPABASE_URL));
export function sameOrigin(request:Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    if (process.env.SITE_URL && !demo) return new URL(origin).origin === new URL(process.env.SITE_URL).origin;
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.host === request.headers.get('host');
  } catch { return false; }
}
const admins = () => (process.env.ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase());
export function isConfiguredAdmin(email:string) {
  return Boolean(email) && admins().includes(email);
}
export class UserError extends Error {}
export async function authClient() {
  const jar = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: {httpOnly:true,sameSite:'lax',secure:process.env.SITE_URL?.startsWith('https://') || false},
    cookies: { getAll: () => jar.getAll(), setAll: items => items.forEach(({name,value,options}) => jar.set(name,value,options)) }
  });
}
export async function identify(data: Data): Promise<Profile | null> {
  if (demo) {
    const selected = (await cookies()).get('romagnole-demo-profile')?.value;
    return data.profiles.find(p => p.email === selected) || demoProfile;
  }
  const client = await authClient();
  const {data:{user}} = await client.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !user?.email_confirmed_at) return null;
  if (isConfiguredAdmin(email)) return {email, name:user.user_metadata?.name || email, role:'internal', scopes:[]};
  return data.profiles.find(p => p.email === email) || null;
}
export function invited(data: Data, email: string) {
  return isConfiguredAdmin(email) || data.profiles.some(p => p.email === email);
}
function db() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEYS) throw new Error('Configure o Supabase para executar o site.');
  return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEYS,{auth:{persistSession:false,autoRefreshToken:false}});
}
const demoFile = '.data/romagnole.json';
async function local() {
  try { return JSON.parse(await readFile(demoFile,'utf8')) as Data; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return initialData(true); }
}
export async function load() {
  if (demo) return {data:await local(), version:0};
  const {data,error} = await db().from('planning_workspace').select('payload,version').eq('id',1).single();
  if (error) throw error;
  return {data:(data.payload || initialData(false)) as Data,version:data.version as number};
}
type Mutation = (data:Data, profile:Profile) => void;
let pending = Promise.resolve();
export async function mutate(fn: Mutation) {
  async function execute() {
    for (let attempt = 0; attempt < 5; attempt++) {
      const {data,version} = await load();
      const profile = await identify(data);
      if (!profile) throw new UserError('Acesse sua conta para continuar.');
      fn(data,profile);
      if (demo) {
        await mkdir('.data',{recursive:true});
        await writeFile(demoFile+'.tmp',JSON.stringify(data),{mode:0o600});
        await rename(demoFile+'.tmp',demoFile);
        return;
      }
      const {data: rows,error} = await db().from('planning_workspace').update({payload:data,version:version+1})
        .eq('id',1).eq('version',version).select('id');
      if (error) throw error;
      if (rows.length) return;
    }
    throw new UserError('Houve uma atualização simultânea. Tente novamente.');
  }
  if (!demo) return execute();
  const result = pending.then(execute);
  pending = result.catch(() => {});
  return result;
}
