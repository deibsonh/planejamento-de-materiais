import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { demoProfile, isProfileActive, normalizeProfileRole, type Data, type Profile, type HistoryRecord, type HistoryCategory } from './model';
import { initialData } from './seed';
import { adminEmail, readSession, type Credentials } from './passwords';

export const demo = process.env.VERCEL !== '1' && (process.env.DEMO_MODE === 'true' ||
  (process.env.NODE_ENV === 'development' && !process.env.SUPABASE_URL));
export function sameOrigin(request:Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (process.env.SITE_URL && !demo) {
      if (url.origin === new URL(process.env.SITE_URL).origin) return true;
      if (process.env.VERCEL === '1' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) return false;
    }
    return url.host === request.headers.get('host');
  } catch { return false; }
}
export function isConfiguredAdmin(email:string) {
  const normalized = email.trim().toLowerCase();
  return Boolean(normalized) && normalized === adminEmail();
}
export function isBootstrapAdmin(email:string) {
  return demo ? email.trim().toLowerCase() === demoProfile.email : isConfiguredAdmin(email);
}
export class UserError extends Error {}
export class ForbiddenError extends UserError {}

export async function identify(data:Data,credentials:Credentials,allowTemporary=false):Promise<Profile|null> {
  if (demo) {
    const selected = (await cookies()).get('planning-demo-profile')?.value;
    if (!selected || isBootstrapAdmin(selected)) return demoProfile;
    const profile = data.profiles.find(p=>p.email===selected);
    if (!profile) return demoProfile;
    return isProfileActive(profile) ? profile : null;
  }
  const email = await readSession(credentials);
  if (!email) return null;
  if (isConfiguredAdmin(email)) return {email,name:'Administrador',role:'admin',scopes:[]};
  if (credentials[email]?.temporary && !allowTemporary) return null;
  return data.profiles.find(p=>p.email===email && isProfileActive(p)) || null;
}
function db() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEYS) throw new Error('Configure o Supabase para executar o site.');
  return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEYS,{auth:{persistSession:false,autoRefreshToken:false}});
}
const demoFile = '.data/planejamento.json';
type StoredHistory = Omit<HistoryRecord,'id'|'category'> & {id?:string;category?:HistoryCategory|'Envios'|'Recebimentos'};
type StoredData = Omit<Data,'profiles'|'history'> & {
  profiles:(Omit<Profile,'role'> & {role:string})[];
  history:StoredHistory[];
};
function legacyHistoryCategory(detail:string):HistoryCategory {
  if (/^(Registrou (envio|entrega)|Vinculou (os envios|as entregas))/.test(detail)) return 'Entregas';
  if (/^Registrou (recebimento|material recebido)/.test(detail)) return 'Recebidos';
  if (/^(Publicou programação|Atualizou calendário)/.test(detail)) return 'PDF mensal';
  if (/^(Redefiniu a senha|(?:Alterou|Cadastrou|Revogou|Desativou|Reativou) (?:o )?acesso)/.test(detail)) return 'Perfis de acesso';
  if (/^(Alterou|Cadastrou|Excluiu|Reativou|Desativou) (material |fornecedor |conversão |feriado )/.test(detail)) return 'Cadastros';
  if (/^(Incluiu |Cancelou |Alterou .+ → )/.test(detail)) return 'Programação';
  return 'Outros';
}
function normalizeWorkspace(data:StoredData):Data {
  const occurrences = new Map<string,number>();
  const history = data.history.map(record=>{
    let id = record.id;
    if (!id) {
      const fingerprint = createHash('sha256')
        .update(JSON.stringify([record.date,record.author,record.detail,record.email,record.requestId])).digest('hex');
      const occurrence = (occurrences.get(fingerprint) ?? 0)+1;
      occurrences.set(fingerprint,occurrence);
      id = fingerprint+'-'+occurrence;
    }
    const category = record.category==='Envios' ? 'Entregas' : record.category==='Recebimentos' ? 'Recebidos' : record.category;
    return {...record,id,category:category ?? legacyHistoryCategory(record.detail)};
  });
  return {...data,history,profiles:data.profiles.map(p=>({...p,role:normalizeProfileRole(p.role) ?? 'partner'}))};
}
async function local():Promise<StoredData> {
  try { return JSON.parse(await readFile(demoFile,'utf8')) as StoredData; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return initialData(true); }
}
export async function load() {
  if (demo) return {data:normalizeWorkspace(await local()),credentials:{} as Credentials,version:0};
  const {data,error} = await db().from('planning_workspace').select('payload,version').eq('id',1).single();
  if (error) throw error;
  const {credentials={},...workspace} = (data.payload || initialData(false)) as StoredData & {credentials?:Credentials};
  return {data:normalizeWorkspace(workspace),credentials,version:data.version as number};
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
