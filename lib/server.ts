import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { demoProfile, type Data, type Profile } from './model';
import { initialData } from './seed';
import { adminEmail, readSession, type Credentials } from './passwords';

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
export function isConfiguredAdmin(email:string) {
  return Boolean(email) && email === adminEmail();
}
export class UserError extends Error {}

export async function identify(data:Data,credentials:Credentials,allowTemporary=false):Promise<Profile|null> {
  if (demo) {
    const selected = (await cookies()).get('romagnole-demo-profile')?.value;
    return data.profiles.find(p => p.email === selected) || demoProfile;
  }
  const email = await readSession(credentials);
  if (!email) return null;
  if (isConfiguredAdmin(email)) return {email,name:'Administrador',role:'internal',scopes:[]};
  if (credentials[email]?.temporary && !allowTemporary) return null;
  return data.profiles.find(p=>p.email===email) || null;
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
  if (demo) return {data:await local(),credentials:{} as Credentials,version:0};
  const {data,error} = await db().from('planning_workspace').select('payload,version').eq('id',1).single();
  if (error) throw error;
  const {credentials={},...workspace} = (data.payload || initialData(false)) as Data & {credentials?:Credentials};
  return {data:workspace,credentials,version:data.version as number};
}
export async function countLoginAttempt(email:string) {
  const {data,error} = await db().rpc('planning_allow_login',{account:email});
  if (error) throw error;
  return data === true;
}

type Mutation = (data:Data,profile:Profile,credentials:Credentials) => void;
let pending = Promise.resolve();
export async function mutate(fn:Mutation,allowTemporary=false) {
  async function execute() {
    for (let attempt = 0; attempt < 5; attempt++) {
      const {data,version,credentials} = await load();
      const profile = await identify(data,credentials,allowTemporary);
      if (!profile) throw new UserError('Acesse sua conta para continuar.');
      fn(data,profile,credentials);
      if (demo) {
        await mkdir('.data',{recursive:true});
        await writeFile(demoFile+'.tmp',JSON.stringify(data),{mode:0o600});
        await rename(demoFile+'.tmp',demoFile);
        return;
      }
      const {data: rows,error} = await db().from('planning_workspace').update({payload:{...data,credentials},version:version+1})
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
