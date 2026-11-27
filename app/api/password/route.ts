import { NextResponse } from 'next/server';
import { isConfiguredAdmin, demo, identify, load, mutate, sameOrigin, UserError } from '@/lib/server';
import { issueSession, makeCredential, validPassword, verifyPassword } from '@/lib/passwords';

export async function POST(request:Request) {
  if (demo || !sameOrigin(request)) return NextResponse.json({error:'Operação indisponível.'},{status:403});
  const input = await request.json().catch(()=>null);
  if (!validPassword(input?.password)) {
    return NextResponse.json({error:'Use uma senha de 12 a 128 caracteres.'},{status:400});
  }
  try {
    const {data,credentials} = await load();
    const profile = await identify(data,credentials,true);
    const previous = profile && !isConfiguredAdmin(profile.email) ? credentials[profile.email] : null;
    if (!profile || !previous?.temporary) {
      return NextResponse.json({error:'Acesse sua conta com a senha temporária.'},{status:403});
    }
    if (await verifyPassword(input.password,previous.hash)) {
      return NextResponse.json({error:'Escolha uma senha diferente da temporária.'},{status:400});
    }
    const next = await makeCredential(input.password,false);
    await mutate((_data,actor,current)=>{
      if (actor.email!==profile.email || current[actor.email]?.version!==previous.version) {
        throw new UserError('A sessão mudou. Entre novamente.');
      }
      current[actor.email] = next;
    },true);
    await issueSession(profile.email,next.version);
    return NextResponse.json({ok:true});
  } catch (error) {
    if (error instanceof UserError) return NextResponse.json({error:error.message},{status:403});
    return NextResponse.json({error:'Não foi possível alterar a senha. Tente novamente.'},{status:503});
  }
}
