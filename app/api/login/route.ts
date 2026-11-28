import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { countLoginAttempt, sameOrigin, demo, isConfiguredAdmin, load } from '@/lib/server';
import { hasPassword, issueSession, sessionVersion, verifyAdmin, verifyPassword } from '@/lib/passwords';
import { isProfileActive } from '@/lib/model';

export async function POST(request:Request) {
  if (!sameOrigin(request)) return NextResponse.json({error:'O endereço de acesso não está autorizado.'},{status:403});
  const input = await request.json().catch(()=>null);
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const invalid = () => NextResponse.json({error:'E-mail ou senha inválidos.'},{status:401});
  try {
    const {data,credentials} = await load();
    const hasActiveProfile = data.profiles.some(p=>p.email===email && isProfileActive(p));
    if (demo) {
      if (email && !hasActiveProfile) return NextResponse.json({error:'Selecione um perfil ativo.'},{status:400});
      (await cookies()).set('planning-demo-profile',email,{httpOnly:true,sameSite:'lax',path:'/'});
      return NextResponse.json({ok:true});
    }
    const password = input?.password;
    if (!email || !hasPassword(password)) return invalid();
    const admin = isConfiguredAdmin(email);
    const version = sessionVersion(email,credentials);
    if (!version || (!admin && !hasActiveProfile)) return invalid();
    if (!await countLoginAttempt(email)) {
      return NextResponse.json({error:'Muitas tentativas. Aguarde alguns minutos e tente novamente.'},{status:429});
    }
    if (!(admin ? verifyAdmin(password) : await verifyPassword(password,credentials[email].hash))) return invalid();
    await issueSession(email,version,request);
    return NextResponse.json({ok:true});
  } catch {
    return NextResponse.json({error:'Não foi possível iniciar a sessão. Tente novamente.'},{status:503});
  }
}
