'use client';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Clock3, Ellipsis, FileText, History, LayoutDashboard, LogOut, Menu, Package, PackageCheck, Pencil, Plus, Search, Settings2, SlidersHorizontal, Trash2, Truck, Users, X } from 'lucide-react';
import { dateLabel, defaultCalendar, fmt, getSupplierDetails, monthLabel, received, round, currentMonth, workdays, type Data, type Entry, type Profile } from '@/lib/model';
import { demoMonth } from '@/lib/seed';
import { OperationForm, type Operation } from './workspace-forms';
import { ThemeToggle } from './theme-toggle';

type Tab = 'Visão geral'|'Programação'|'Envios'|'Recebimentos'|'PDF mensal'|'Cadastros'|'Perfis de acesso'|'Histórico';
type State = {demo:boolean; profile:Profile|null; data:Data|null; configuredAdminEmails:string[]};
const menu = [
  {label:'Visão geral',icon:LayoutDashboard},{label:'Programação',icon:CalendarDays},{label:'Envios',icon:Truck},
  {label:'Recebimentos',icon:PackageCheck},{label:'PDF mensal',icon:FileText},
  {label:'Cadastros',icon:Settings2},{label:'Perfis de acesso',icon:Users},{label:'Histórico',icon:History}
] as const;
const roleLabel = {internal:'Equipe interna',supplier:'Fornecedor',carrier:'Transportadora'};
const panelDescriptions: Record<Tab,string> = {
  'Visão geral':'Acompanhe a programação e o andamento das entregas de materiais.',
  'Programação':'Planeje as entregas do mês e acompanhe o saldo de cada linha.',
  'Envios':'Acompanhe os materiais despachados por fornecedores e transportadoras.',
  'Recebimentos':'Consulte as entradas de materiais e as baixas realizadas na programação.',
  'PDF mensal':'Prepare a programação mensal para divulgação aos setores.',
  'Cadastros':'Gerencie materiais, fornecedores e regras de conversão.',
  'Perfis de acesso':'Controle os fornecedores e materiais disponíveis para cada parceiro.',
  'Histórico':'Consulte quem fez cada alteração no planejamento.'
};
const partnerTabs = ['Visão geral','Programação','Envios','Recebimentos'];
const blank = '—';
const timeLabel = (iso:string) => new Date(iso).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});
const nonce = (month:string, diff:number) => {
  const [y,m] = month.split('-').map(Number);
  return new Date(Date.UTC(y,m-1+diff,1)).toISOString().slice(0,7);
};
function status(e:Entry, actual:number) {
  if (e.canceled) return ['Cancelado','gray'];
  if (e.closed || actual >= e.quantity) return ['Encerrado','green'];
  if (actual > 0) return ['Parcial','amber'];
  return ['Pendente','blue'];
}
function Badge({label,tone}:{label:string;tone:string}) {
  return <span className={'badge '+tone}><i/>{label}</span>;
}
function Table({columns,children,empty,emptyLabel='Nenhum registro para os filtros selecionados.'}:{columns:string[];children:ReactNode;empty?:boolean;emptyLabel?:string}) {
  return <div className="table-scroll"><table><thead><tr>{columns.map((c,i)=><th key={i}>{c}</th>)}</tr></thead><tbody>
    {empty ? <tr><td colSpan={columns.length} className="empty">{emptyLabel}</td></tr> : children}
  </tbody></table></div>;
}
function CatalogActions({operation,label,onOpen}:{operation:Operation;label:string;onOpen:(value:Operation)=>void}) {
  return <div className="catalog-actions">
    <button type="button" className="icon-button" title="Editar" aria-label={'Editar '+label} onClick={()=>onOpen(operation)}><Pencil size={15} aria-hidden="true"/></button>
    <button type="button" className="icon-button danger" title="Excluir" aria-label={'Excluir '+label} onClick={()=>onOpen({...operation,remove:true})}><Trash2 size={15} aria-hidden="true"/></button>
  </div>;
}
function HeroArt() {
  return <svg className="hero-art" width="305" height="160" viewBox="0 0 305 160" fill="none" aria-hidden="true">
    <defs><pattern id="dots" width="13" height="13" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="var(--hero-art-mark)" opacity=".35"/></pattern></defs>
    <path d="M6 0h299v160H6z" fill="url(#dots)"/>
    <circle cx="212" cy="79" r="69" stroke="var(--hero-art-line)"/>
    <circle cx="212" cy="79" r="51" stroke="var(--hero-art-line)"/>
    <path d="M44 117h230M69 36h200M90 145h171" stroke="var(--hero-art-line)" strokeDasharray="4 5"/>
    <g transform="translate(173 78) rotate(-11)">
      <rect x="-57" y="-48" width="114" height="96" rx="13" fill="var(--hero-art-line)"/>
      <rect x="-60" y="-53" width="114" height="96" rx="13" fill="var(--paper)" stroke="var(--accent-border)"/>
      <path d="M-60-39a14 14 0 0 1 14-14h86a14 14 0 0 1 14 14v10H-60z" fill="var(--primary-fill)"/>
      <path d="M-33-59v14m59-14v14" stroke="var(--hero-art-mark)" strokeWidth="5" strokeLinecap="round"/>
      {Array.from({length:12},(_,index)=><rect key={index} x={-45+(index%4)*22} y={-19+Math.floor(index/4)*18} width="13" height="10" rx="3" fill={index===6?'var(--hero-art-mark)':'var(--accent-surface)'}/>)}
    </g>
    <g transform="translate(235 106)">
      <rect x="-1" width="43" height="43" rx="11" fill="var(--hero-art-line)"/>
      <rect x="-3" y="-3" width="43" height="43" rx="11" fill="var(--primary-fill)"/>
      <path d="M8 20l7 7 14-16" stroke="var(--primary-ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </g>
    <path d="M96 35v14m-7-7h14m151-8v12m-6-6h12" stroke="var(--hero-art-mark)" strokeWidth="2" strokeLinecap="round"/>
  </svg>;
}

export default function Workspace() {
  const [state,setState] = useState<State|null>(null);
  const [failure,setFailure] = useState('');
  const [month,setMonth] = useState(demoMonth);
  const [tab,setTab] = useState<Tab>('Visão geral');
  const [query,setQuery] = useState('');
  const [filter,setFilter] = useState('');
  const [showFilters,setShowFilters] = useState(false);
  const [operation,setOperation] = useState<Operation|null>(null);
  const [toast,setToast] = useState('');
  const [menuId,setMenuId] = useState('');
  const [menuPosition,setMenuPosition] = useState({top:0,right:0});
  const [account,setAccount] = useState(false);
  const [mobile,setMobile] = useState(false);
  const [login,setLogin] = useState('');
  const [loginResult,setLoginResult] = useState('');
  async function reload() {
    const response = await fetch('/api/data',{cache:'no-store'});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setState(result);
    return result as State;
  }
  useEffect(()=>{reload().then(result=>setMonth(result.demo ? demoMonth : currentMonth())).catch(e=>setFailure(e.message));},[]);
  useEffect(()=>{
    if (!menuId) return;
    const dismiss = () => setMenuId('');
    const onKey = (event:KeyboardEvent) => {if(event.key==='Escape')dismiss();};
    window.addEventListener('scroll',dismiss,true);
    window.addEventListener('resize',dismiss);
    window.addEventListener('keydown',onKey);
    return ()=>{
      window.removeEventListener('scroll',dismiss,true);
      window.removeEventListener('resize',dismiss);
      window.removeEventListener('keydown',onKey);
    };
  },[menuId]);
  useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(''),4200); return ()=>clearTimeout(timer);}},[toast]);
  async function send(input:Record<string,unknown>) {
    const response = await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    const refreshed = await reload();
    if (!refreshed.profile || (state?.profile?.role==='internal' && refreshed.profile.role!=='internal')) go('Visão geral');
    if (!refreshed.profile && input.action==='profile' && input.id===state?.profile?.email && typeof input.email==='string') {
      setLogin(input.email.trim().toLowerCase());
      setLoginResult('Perfil atualizado. Solicite um link para entrar com o novo e-mail.');
      return;
    }
    const deleted = ['deleteMaterial','deleteSupplier','deleteConversion'].some(action=>action===input.action);
    setToast(deleted?'Registro excluído com sucesso.':'Alteração salva com sucesso.');
  }

  function go(next:Tab) {setTab(next);setQuery('');setFilter('');setShowFilters(false);setMobile(false);setMenuId('');}
  async function access(email:string) {
    const response = await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (state?.demo) {await reload();go('Visão geral');setAccount(false);}
    else setLoginResult('Se o e-mail estiver autorizado, você receberá um link de acesso.');
  }
  const data = state?.data;
  const profile = state?.profile;
  if (!profile || !data) return <div className="login"><ThemeToggle className="login-theme"/><div className="login-card">
    <span className="app-title">Planejamento de Materiais</span>
    <h1>{failure ? 'Configuração do ambiente' : state ? 'Acesse sua conta' : 'Carregando planejamento…'}</h1>
    {failure && <p>{failure}</p>}
    {state && <form onSubmit={(e:FormEvent)=>{e.preventDefault();void access(login).catch(e=>setLoginResult(e.message));}}>
      <label>E-mail<input type="email" value={login} onChange={e=>setLogin(e.target.value)} required placeholder="Seu e-mail de trabalho"/></label>
      <button className="button primary" type="submit">Enviar link de acesso <ArrowRight size={16}/></button>
      {loginResult && <p role="status">{loginResult}</p>}
      {typeof window !== 'undefined' && window.location.search.includes('login=erro') && <p>O link expirou ou foi aberto em outro navegador. Solicite um novo link.</p>}
    </form>}
  </div></div>;
  const internal = profile.role === 'internal';
  const materials = new Map(data.materials.map(m=>[m.id,m]));
  const selectedMonth = data.entries.filter(e=>e.date.startsWith(month+'-'));
  const entries = selectedMonth.filter(e=>!e.canceled);
  const shipments = data.shipments.filter(e=>(e.arrival||e.date).startsWith(month+'-'));
  const receipts = data.receipts.filter(e=>e.date.startsWith(month+'-'));
  const open = entries.filter(e=>!e.closed && received(data,e.id)<e.quantity);
  const counts = [
    {label:'Entregas programadas',value:entries.length,caption:'Linhas ativas no mês',icon:CalendarDays,tone:'mint'},
    {label:'Envios registrados',value:shipments.filter(s=>!s.duplicateOf).length,caption:'Cargas informadas por parceiros',icon:Truck,tone:'sky'},
    {label:'Recebimentos',value:receipts.length,caption:'Entradas registradas no mês',icon:PackageCheck,tone:'violet'},
    {label:'Entregas pendentes',value:open.length,caption:'Linhas com saldo em aberto',icon:Clock3,tone:'peach'}
  ];
  const matching = (e: {material:string;supplier:string}) => (!filter || filter===e.material) &&
    (!query || [materials.get(e.material)?.name || '',e.material,e.supplier].join(' ').toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));
  const ordered = (tab==='Visão geral' ? entries : selectedMonth).filter(matching).sort((a,b)=>a.date.localeCompare(b.date));
  const visibleEntries = tab==='Visão geral' ? ordered.slice(0,6) : ordered;
  const calendar = data.calendars[month] || defaultCalendar;
  const work = workdays(month,calendar);
  const monthVersions = data.publications.filter(p=>p.month===month).slice().reverse();
  const profileInitials = profile.role==='internal' ? 'RO' : profile.name.slice(0,2).toUpperCase();
  const primaryTitle = internal ? 'Nova programação':'Registrar envio';
  const primary = ()=>setOperation({kind:internal?'entry':'shipment'});
  function toolbar() {
    return <div className="tools"><div className="search"><Search size={16}/><input aria-label="Buscar material ou fornecedor" placeholder="Buscar material ou fornecedor…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <button className={'button '+(showFilters||filter?'selected':'')} onClick={()=>setShowFilters(!showFilters)}><SlidersHorizontal size={15}/> Filtros</button>
      {showFilters && <select aria-label="Filtrar material" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">Todos os materiais</option>{data?.materials.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>}
    </div>;
  }
  function planningTable() {
    return <Table columns={['Data prevista','Material','Fornecedor','Programado','Recebido','Saldo','Situação',...(internal?['']:[])]} empty={!visibleEntries.length}>
      {visibleEntries.map(e=>{
        const actual = received(data!,e.id);
        const [label,tone] = status(e,actual);
        const material=materials.get(e.material);
        return <tr key={e.id}><td className="date-cell">{dateLabel(e.date)}</td><td><div className="material-cell"><span className="material-icon"><Package size={15}/></span><div><strong>{material?.name || e.material}</strong><small>{e.material}</small></div></div></td>
          <td>{e.supplier}</td><td><strong>{fmt(e.quantity)}</strong> <span className="muted">{material?.unit}</span></td>
          <td>{actual ? <><strong>{fmt(actual)}</strong> <span className="muted">{material?.unit}</span></> : <span className="muted">{blank}</span>}</td>
          <td>{e.canceled || e.closed ? blank : fmt(Math.max(0,round(e.quantity-actual)))}</td><td><Badge label={label} tone={tone}/></td>
          {internal && <td className="row-actions"><button className="icon-button" aria-label="Ações da programação" onClick={event=>{
            const rect = event.currentTarget.getBoundingClientRect();
            setMenuPosition({top:Math.min(rect.bottom,window.innerHeight-119),right:window.innerWidth-rect.right});
            setMenuId(menuId===e.id?'':e.id);
          }}><Ellipsis size={18}/></button>
            {menuId===e.id && <div className="pop row-pop" style={menuPosition}>
              <button onClick={()=>{setOperation({kind:'entry',id:e.id});setMenuId('');}} disabled={e.canceled||e.closed}>Editar programação</button>
              <button onClick={()=>{setOperation({kind:'receipt',id:e.id});setMenuId('');}} disabled={e.canceled||e.closed||actual>=e.quantity}>Registrar recebimento</button>
              <button className="danger" onClick={()=>{setOperation({kind:'cancel',id:e.id});setMenuId('');}} disabled={e.canceled||e.closed||actual>=e.quantity}>Cancelar linha</button>
            </div>}</td>}
        </tr>;
      })}
    </Table>;
  }
  return <div className="shell">
    {mobile && <button className="mobile-overlay" aria-label="Fechar navegação" onClick={()=>setMobile(false)}/>}
    <aside className={'sidebar '+(mobile?'mobile-open':'')}>
      <span className="app-title">Planejamento de Materiais</span>
      <div className="nav"><p>PLANEJAMENTO</p>{menu.slice(0,5).filter(item=>internal||partnerTabs.includes(item.label)).map(({label,icon:Icon})=><button className={tab===label?'active':''} key={label} onClick={()=>go(label)}><Icon size={17}/>{label}</button>)}
        {internal && <><p>ADMINISTRAÇÃO</p>{menu.slice(5).map(({label,icon:Icon})=><button className={tab===label?'active':''} key={label} onClick={()=>go(label)}><Icon size={17}/>{label}</button>)}</>}
      </div>
      <div className="sidebar-bottom">
        <div className="account-wrap">
          <button className="account" onClick={()=>setAccount(!account)}><span className="avatar">{profileInitials}</span><span><strong>{internal?'Romagnole':profile.name}</strong><small>{roleLabel[profile.role]}</small></span><ChevronsUpDown size={14}/></button>
          {account && <div className="pop account-pop">
            {state.demo ? <><span>Visualizar como</span><button onClick={()=>void access('').catch(e=>setToast(e.message))}>Romagnole</button>
              {(internal?data.profiles.filter(p=>p.role!=='internal'):[]).map(p=><button key={p.email} onClick={()=>void access(p.email).catch(e=>setToast(e.message))}>{p.name} · {roleLabel[p.role]}</button>)}</>
              : <button onClick={async()=>{await fetch('/api/logout',{method:'POST'});await reload();go('Visão geral');}}><LogOut size={15}/> Sair</button>}
          </div>}
        </div>
      </div>
    </aside>
    <div className="main">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Abrir navegação" onClick={()=>setMobile(true)}><Menu size={20}/></button><span>Planejamento</span><ChevronRight size={14}/><strong>{tab}</strong></div><div className="top-actions">
        {state.demo && <span className="environment"><i/> Demonstração</span>}
        <ThemeToggle/>
      </div></header>
      <main className="content">
        <div className="page-heading"><div><h1>{tab}</h1><p>{panelDescriptions[tab]}</p></div>
          <div className="heading-actions">
            {!['Cadastros','Perfis de acesso','Histórico'].includes(tab) && <div className="month-control"><button aria-label="Mês anterior" onClick={()=>setMonth(nonce(month,-1))}><ChevronLeft size={15}/></button><label><CalendarDays size={16}/><span>{monthLabel(month)}</span><ChevronDown size={12}/><input type="month" aria-label="Selecionar mês" value={month} onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value))setMonth(e.target.value);}}/></label><button aria-label="Próximo mês" onClick={()=>setMonth(nonce(month,1))}><ChevronRight size={15}/></button></div>}
            {(tab==='Visão geral'||tab==='Programação'&&internal) && <button className="button primary" onClick={primary}><Plus size={17}/>{primaryTitle}</button>}
            {tab==='Envios' && <button className="button primary" onClick={()=>setOperation({kind:'shipment'})}><Plus size={17}/> Registrar envio</button>}
            {tab==='Recebimentos' && internal && <button className="button primary" onClick={()=>setOperation({kind:'receipt'})}><Plus size={17}/> Registrar recebimento</button>}
            {tab==='Perfis de acesso' && <button className="button primary" onClick={()=>setOperation({kind:'profile'})}><Plus size={17}/> Novo perfil</button>}
          </div>
        </div>
        {tab==='Visão geral' && <>
          <section className="hero"><div className="hero-content"><span className="hero-kicker"><CalendarDays size={14}/> PROGRAMAÇÃO MENSAL</span><h2>{monthLabel(month)}</h2><p>{open.length ? `${open.length} ${open.length===1?'linha com saldo pendente':'linhas com saldo pendente'} na programação.` : 'Nenhuma entrega pendente neste mês.'}</p><button onClick={()=>go('Programação')}>Ver programação <ArrowRight size={15}/></button></div><HeroArt/></section>
          <section className="metrics" aria-label="Indicadores do mês">{counts.map(({label,value,caption,icon:Icon,tone})=><article key={label} className="metric"><span className={'metric-icon '+tone}><Icon size={19}/></span><div className="metric-value">{value.toLocaleString('pt-BR')}</div><h3>{label}</h3><p>{caption}</p></article>)}</section>
        </>}
        {(tab==='Visão geral'||tab==='Programação')&& <section className="panel">
          <div className="panel-heading"><div><h2>{tab==='Visão geral'?'Entregas programadas':'Programação do mês'}</h2><p>Quantidade planejada, recebida e situação por linha.</p></div>{toolbar()}</div>
          {planningTable()}
          <div className="panel-footer"><span>{visibleEntries.length} de {ordered.length} registros</span>{tab==='Visão geral'&& <button className="text-button" onClick={()=>go('Programação')}>Ver programação completa <ArrowRight size={15}/></button>}</div>
        </section>}
        {tab==='Envios'&& <section className="panel"><div className="panel-heading"><h2>Registros de envio</h2>{toolbar()}</div>
          <Table columns={['Expedição','Previsão','Material','Fornecedor','Quantidade','NF','Registrado por','Conferência',...(internal?['']:[])]} empty={!shipments.filter(matching).length}>
            {shipments.filter(matching).slice().reverse().map(s=>{
              const links = data.receipts.filter(r=>r.shipment===s.id);
              const actual = round(links.reduce((sum,r)=>sum+r.converted,0));
              const difference = s.converted === undefined ? null : round(actual-s.converted);
              const comparison = s.duplicateOf ? ['Vinculado','gray'] : !links.length ? ['Sem recebimento','blue'] :
                difference === null ? ['Recebimento vinculado','blue'] : difference===0 ? ['Conferido','green'] :
                [`${fmt(Math.abs(difference))} ${materials.get(s.material)?.unit} a ${difference>0?'mais':'menos'}`,'amber'];
              return <tr key={s.id}><td>{dateLabel(s.date)}</td><td>{s.arrival?dateLabel(s.arrival):blank}</td><td><strong>{materials.get(s.material)?.name}</strong></td><td>{s.supplier}</td><td>{fmt(s.quantity)} {s.unit}</td><td>{s.nf||blank}</td><td>{s.author}</td><td><Badge label={comparison[0]} tone={comparison[1]}/></td>
              {internal && <td><button className="text-button" disabled={!!s.duplicateOf} onClick={()=>setOperation({kind:'duplicate',id:s.id})}><ArrowLeftRight size={15}/> Vincular</button></td>}</tr>;})}
          </Table></section>}
        {tab==='Recebimentos'&& <section className="panel"><div className="panel-heading"><h2>Registros de recebimento</h2>{toolbar()}</div>
          <Table columns={['Recebido em','Material','Fornecedor','Quantidade','Convertida','NF','Frete','']} empty={!receipts.filter(matching).length}>
            {receipts.filter(matching).slice().reverse().map(r=><tr key={r.id}><td>{dateLabel(r.date)}</td><td><strong>{materials.get(r.material)?.name}</strong></td><td>{r.supplier}</td><td>{fmt(r.quantity)} {r.unit}</td><td>{fmt(r.converted)} {materials.get(r.material)?.unit}</td><td>{r.nf||'Sem NF'}</td><td>{r.freight||blank}</td><td><button className="text-button" onClick={()=>setOperation({kind:'receiptDetails',id:r.id})}>Detalhes <ChevronRight size={14}/></button></td></tr>)}
          </Table></section>}
        {tab==='PDF mensal'&& internal && <div className="stack">
          <section className="panel"><div className="panel-heading"><div><h2>Programação para os setores</h2><p>O PDF inclui as quantidades programadas do mês.</p></div><div className="tools">
            <a className="button" href={'/api/pdf?month='+month}><ArrowDownToLine size={16}/> Baixar PDF atual</a><button className="button primary" onClick={()=>setOperation({kind:'publish'})}><Plus size={16}/> Salvar versão</button>
          </div></div><div className="panel-body calendar-info"><div><span>Dias úteis equivalentes</span><strong>{fmt(work.total,2)}</strong></div><div><span>Turnos</span><strong>{calendar.shifts}</strong></div><div><span>Feriados</span><strong>{calendar.holidays.length ? calendar.holidays.map(dateLabel).join(', ') : 'Nenhum cadastrado'}</strong></div><button className="button" onClick={()=>setOperation({kind:'calendar'})}><CalendarDays size={16}/> Editar calendário</button></div></section>
          <section className="panel"><div className="panel-heading"><h2>Versões para divulgação</h2></div><Table columns={['Versão','Salva em','Linhas da programação','']} empty={!monthVersions.length}>{monthVersions.map((p,i)=><tr key={p.id}><td><strong>V{monthVersions.length-i}</strong></td><td>{timeLabel(p.date)}</td><td>{p.entries.length}</td><td><a className="text-button" href={`/api/pdf?month=${month}&version=${p.id}`}><ArrowDownToLine size={16}/> Baixar PDF</a></td></tr>)}</Table></section>
        </div>}
        {tab==='Cadastros'&&internal&& <div className="stack catalog">
          <section className="panel catalog-table">
            <div className="panel-heading">
              <h2>Materiais</h2>
              <button type="button" className="button catalog-create" onClick={()=>setOperation({kind:'material'})}>
                <Plus size={16} aria-hidden="true"/> Novo material
              </button>
            </div>
            <Table columns={['Código','Material','Unidade','Ações']} empty={!data.materials.length}>
              {data.materials.map(m=><tr key={m.id}>
                <td>{m.id}</td><td><strong>{m.name}</strong></td><td>{m.unit}</td>
                <td><CatalogActions operation={{kind:'material',id:m.id}} label={`material ${m.name} (${m.id})`} onOpen={setOperation}/></td>
              </tr>)}
            </Table>
          </section>
          <section className="panel catalog-table">
            <div className="panel-heading">
              <h2>Fornecedores</h2>
              <button type="button" className="button catalog-create" onClick={()=>setOperation({kind:'supplier'})}>
                <Plus size={16} aria-hidden="true"/> Novo fornecedor
              </button>
            </div>
            <Table columns={['Código','Nome do fornecedor','Nome do responsável','E-mail','Contato','Ações']} empty={!data.suppliers.length} emptyLabel="Nenhum fornecedor cadastrado.">
              {data.suppliers.map(name=>{
                const details = getSupplierDetails(data,name);
                return <tr key={name}>
                  <td>{details?.code || blank}</td><td><strong>{name}</strong></td><td>{details?.responsible || blank}</td>
                  <td>{details?.email || blank}</td><td>{details?.contact || blank}</td>
                  <td><CatalogActions operation={{kind:'supplier',id:name}} label={`fornecedor ${name}`} onOpen={setOperation}/></td>
                </tr>;
              })}
            </Table>
          </section>
          <section className="panel catalog-table">
            <div className="panel-heading">
              <h2>Conversões</h2>
              <button type="button" className="button catalog-create" onClick={()=>setOperation({kind:'conversion'})}>
                <Plus size={16} aria-hidden="true"/> Cadastrar conversão
              </button>
            </div>
            <Table columns={['Fornecedor','Material','Unidade de origem','Operação','Fator','Ações']} empty={!data.conversions.length}>
              {data.conversions.map(({supplier,material,unit,operation,factor})=>{
                const materialName = materials.get(material)?.name || material;
                return <tr key={JSON.stringify([supplier,material])}>
                  <td>{supplier}</td><td>{materialName}</td><td>{unit}</td><td>{operation==='divide'?'Divisão':'Multiplicação'}</td><td>{fmt(factor,8)}</td>
                  <td><CatalogActions operation={{kind:'conversion',scope:{supplier,material}}} label={`conversão de ${supplier} para ${materialName} (${material})`} onOpen={setOperation}/></td>
                </tr>;
              })}
            </Table>
          </section>
        </div>}
        {tab==='Perfis de acesso'&&internal&& <section className="panel"><div className="panel-heading"><div><h2>Perfis cadastrados</h2><p>Compartilhe o endereço do portal para que o parceiro solicite um link de acesso com o e-mail cadastrado.</p></div><button className="button" onClick={async()=>{try{await navigator.clipboard.writeText(window.location.origin);setToast('Endereço de acesso copiado.');}catch{setToast('Copie o endereço do site na barra do navegador.');}}}>Copiar endereço de acesso</button></div>
          <Table columns={['Perfil','E-mail','Tipo','Permissões','']} empty={!data.profiles.length}>{data.profiles.map(p=><tr key={p.email}>
            <td><strong>{p.name}</strong></td><td>{p.email}</td><td>{roleLabel[p.role]}{state.configuredAdminEmails.includes(p.email)&&<small className="profile-role-note">Acesso interno pela configuração</small>}</td>
            <td>{p.role==='internal'?'Acesso interno':p.scopes.map(s=>s.supplier+' / '+(materials.get(s.material)?.name || s.material)).join(' · ')}</td>
            <td><div className="table-buttons"><button className="text-button" onClick={()=>setOperation({kind:'profile',id:p.email})}>Editar</button><button className="text-button danger" disabled={profile.email===p.email} onClick={()=>setOperation({kind:'revoke',id:p.email})}>Revogar</button></div></td>
          </tr>)}</Table>
        </section>}
        {tab==='Histórico'&&internal&& <section className="panel"><div className="panel-heading"><h2>Alterações registradas</h2></div><Table columns={['Data e hora','Responsável','Alteração']} empty={!data.history.length}>{data.history.map((h,i)=><tr key={h.date+i}><td>{timeLabel(h.date)}</td><td><strong>{h.author}</strong></td><td>{h.detail}</td></tr>)}</Table></section>}
      </main>
    </div>
    {toast&& <div className="toast" role="status">{toast}<button className="icon-button" aria-label="Dispensar" onClick={()=>setToast('')}><X size={16}/></button></div>}
    {operation && <OperationForm operation={operation} profile={profile} data={data} month={month} configuredAdmin={state.configuredAdminEmails.includes(operation.id ?? '')} onClose={()=>setOperation(null)} onSave={send}/>}
  </div>;
}
