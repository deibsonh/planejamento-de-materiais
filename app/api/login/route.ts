import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sameOrigin, authClient, demo, invited, load } from '@/lib/server';

export async function POST(request:Request) {
  if (!sameOrigin(request)) return NextResponse.json({error:'Origem inválida.'},{status:403});
  const input = await request.json();
  const email = String(input.email || '').trim().toLowerCase();
  const {data} = await load();
  if (demo) {
    if (email && !data.profiles.some(p=>p.email === email)) return NextResponse.json({error:'Selecione um perfil válido.'},{status:400});
    (await cookies()).set('romagnole-demo-profile',email,{httpOnly:true,sameSite:'lax',path:'/'});
    return NextResponse.json({ok:true});
  }
  if (invited(data,email)) {
    const client = await authClient();
    const {error} = await client.auth.signInWithOtp({email,options:{emailRedirectTo: new URL('/auth/callback',process.env.SITE_URL || request.url).href}});
    if (error) return NextResponse.json({error:'Não foi possível enviar o link. Tente novamente.'},{status:429});
  }
  return NextResponse.json({ok:true});
}
