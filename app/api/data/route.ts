import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { makeCredential, validPassword } from '@/lib/passwords';
import { apply } from '@/lib/actions';
import { allowed, type Data, type Profile } from '@/lib/model';
import { sameOrigin, demo, identify, isConfiguredAdmin, load, mutate, UserError } from '@/lib/server';

function visible(data:Data,profile:Profile):Data {
  if (profile.role === 'internal') return data;
  const entries = data.entries.filter(e=>allowed(profile,e));
  const shipments = data.shipments.filter(e=>allowed(profile,e));
  return {...data,entries,shipments,receipts:data.receipts.filter(e=>allowed(profile,e)),
    conversions:data.conversions.filter(e=>allowed(profile,e)),
    suppliers:data.suppliers.filter(s=>profile.scopes.some(p=>p.supplier===s)),
    supplierDetails:undefined,
    materials:data.materials.filter(m=>profile.scopes.some(p=>p.material===m.id)),
    history:[],publications:[],profiles:[]};
}
export async function GET() {
  try {
    const {data,credentials} = await load();
    const profile = await identify(data,credentials,true);
    const mustChangePassword = !demo && Boolean(profile && !isConfiguredAdmin(profile.email) && credentials[profile.email]?.temporary);
    const canManageProfiles = profile?.role==='internal' && (demo || isConfiguredAdmin(profile.email));
    return NextResponse.json({demo,profile,mustChangePassword,canManageProfiles,
      data:profile && !mustChangePassword ? visible(data,profile) : null},{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    console.error(error);
    return NextResponse.json({error:'O ambiente precisa estar configurado para carregar os dados.'},{status:503});
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({error:'Origem inválida.'},{status:403});
  try {
    const input = await request.json();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new UserError('Operação inválida.');
    const action = typeof input.action === 'string' ? input.action.trim() : '';
    const key = typeof input.id === 'string' ? input.id.trim().toLowerCase() : '';
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const requestId = typeof input.requestId === 'string' ? input.requestId.trim() : '';
    const managing = ['profile','revoke','resetPassword'].includes(action);
    if (!demo && managing) {
      const {data,credentials} = await load();
      const actor = await identify(data,credentials);
      if (!actor || !isConfiguredAdmin(actor.email)) {
        return NextResponse.json({error:'Apenas o administrador pode gerenciar perfis.'},{status:403});
      }
    }
    const needsPassword = !demo && (action==='resetPassword' || (action==='profile' && !key));
    const password = input.password;
    if (needsPassword && !validPassword(password)) throw new UserError('Use uma senha temporária de 12 a 128 caracteres.');
    const credential = needsPassword && validPassword(password) ? await makeCredential(password,true) : null;
    const renamedVersion = key && key!==email ? randomUUID() : null;
    delete input.password;
    await mutate((data,profile,credentials)=>{
      if (!demo && managing && !isConfiguredAdmin(profile.email)) throw new UserError('Apenas o administrador pode gerenciar perfis.');
      if (requestId && data.history.some(h=>h.requestId===requestId && h.email===profile.email)) return;
      apply(data,profile,input);
      if (demo) return;
      if (action==='profile') {
        if (renamedVersion && Object.hasOwn(credentials,key)) {
          credentials[email] = {...credentials[key],version:renamedVersion};
          delete credentials[key];
        }
        if (credential) credentials[email] = credential;
      }
      if (action==='resetPassword' && credential) credentials[key] = credential;
      if (action==='revoke') delete credentials[email];
    });
    return NextResponse.json({ok:true});
  } catch (error) {
    if (!(error instanceof UserError)) console.error(error);
    return NextResponse.json({error:error instanceof UserError ? error.message : 'Não foi possível salvar o registro.'},{status:error instanceof UserError ? 400 : 500});
  }
}
