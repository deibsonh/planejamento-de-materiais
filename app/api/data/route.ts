import { NextResponse } from 'next/server';
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
    const {data} = await load();
    const profile = await identify(data);
    const configuredAdminEmails = !demo && profile?.role==='internal'
      ? data.profiles.filter(p=>isConfiguredAdmin(p.email.toLowerCase())).map(p=>p.email)
      : [];
    return NextResponse.json({demo,profile,configuredAdminEmails,data:profile ? visible(data,profile) : null},{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    console.error(error);
    return NextResponse.json({error:'O ambiente precisa estar configurado para carregar os dados.'},{status:503});
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({error:'Origem inválida.'},{status:403});
  try {
    const input = await request.json();
    await mutate((data,profile)=>apply(data,profile,input));
    return NextResponse.json({ok:true});
  } catch (error) {
    if (!(error instanceof UserError)) console.error(error);
    return NextResponse.json({error:error instanceof UserError ? error.message : 'Não foi possível salvar o registro.'},{status:error instanceof UserError ? 400 : 500});
  }
}
