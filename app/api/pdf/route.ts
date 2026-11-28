import { createPdf } from '@/lib/pdf';
import { getCalendar, hasPdfAccess } from '@/lib/model';
import { identify, load } from '@/lib/server';
export async function GET(request:Request) {
  const {data,credentials} = await load();
  const profile = await identify(data,credentials);
  if (!hasPdfAccess(profile)) return new Response(null,{status:403});
  const params = new URL(request.url).searchParams;
  const month = params.get('month') || '';
  const version = params.get('version');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return new Response(null,{status:400});
  const publication = version ? data.publications.find(p=>p.id===version && p.month===month) : {
    id:'preview',month,date:'',entries:data.entries.filter(e=>!e.canceled && e.date.startsWith(month+'-')),
    calendar:getCalendar(data,month),materials:data.materials
  };
  if (!publication) return new Response(null,{status:404});
  return new Response(createPdf(publication),{headers:{
    'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="programacao-agregados-${month}.pdf"`,'Cache-Control':'no-store'
  }});
}
