import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { hasPassword, makeCredential } from '@/lib/passwords';
import { apply, profileActions } from '@/lib/actions';
import { allowed, canManageProfiles, hasAdministrationAccess, hasOperationalAccess, hasPdfAccess, type Data, type Profile } from '@/lib/model';
import { sameOrigin, demo, ForbiddenError, identify, isBootstrapAdmin, isConfiguredAdmin, load, mutate, UserError } from '@/lib/server';

function visible(data:Data,profile:Profile):Data {
  if (hasAdministrationAccess(profile)) return {...data,profiles:canManageProfiles(profile) ? data.profiles.filter(p=>!isBootstrapAdmin(p.email)) : []};
  if (hasOperationalAccess(profile)) return {...data,supplierDetails:undefined,history:[],profiles:[],
    publications:hasPdfAccess(profile) ? data.publications : []};
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
    return NextResponse.json({demo,profile,mustChangePassword,canManageProfiles:canManageProfiles(profile),
      data:profile && !mustChangePassword ? visible(data,profile) : null},{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    console.error(error);
    return NextResponse.json({error:'O ambiente precisa estar configurado para carregar os dados.'},{status:503});
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({error:'O endereço de acesso não está autorizado.'},{status:403});
  try {
    const input = await request.json();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new UserError('Operação inválida.');
    const action = typeof input.action === 'string' ? input.action.trim() : '';
    const key = typeof input.id === 'string' ? input.id.trim().toLowerCase() : '';
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!demo && profileActions.has(action)) {
      const {data,credentials} = await load();
      const actor = await identify(data,credentials);
      if (!canManageProfiles(actor)) throw new ForbiddenError('Seu perfil não pode gerenciar perfis de acesso.');
    }
    const needsPassword = !demo && (action==='resetPassword' || (action==='profile' && !key));
    const password = needsPassword && hasPassword(input.password) ? input.password : null;
    if (needsPassword && password === null) throw new UserError('Informe a senha temporária.');
    const credential = password === null ? null : await makeCredential(password,true);
    const renamedVersion = action==='profile' && key && key!==email ? randomUUID() : null;
    delete input.password;
    await mutate((data,profile,credentials)=>{
      const applied = apply(data,profile,input);
      if (!applied || demo) return;
      if (action==='profile') {
        if (renamedVersion && Object.hasOwn(credentials,key)) {
          credentials[email] = {...credentials[key],version:renamedVersion};
          delete credentials[key];
        }
        if (credential) credentials[email] = credential;
      }
      if (action==='resetPassword' && credential) credentials[key] = credential;
      if (action==='setProfileActive' && input.active===false && Object.hasOwn(credentials,key)) {
        credentials[key] = {...credentials[key],version:randomUUID()};
      }
      if (action==='revoke') delete credentials[email];
    });
    return NextResponse.json({ok:true});
  } catch (error) {
    if (!(error instanceof UserError)) console.error(error);
    const status = error instanceof ForbiddenError ? 403 : error instanceof UserError ? 400 : 500;
    return NextResponse.json({error:error instanceof UserError ? error.message : 'Não foi possível salvar o registro.'},{status});
  }
}
