'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, CircleDot, CirclePause, CirclePlay, Clock3, Container, Ellipsis, FileText, Flame, FlaskConical, Fuel, Gem, Grid3x3, Grip, History, Hourglass, KeyRound, LayoutDashboard, LogOut, Menu, Mountain, Package, PackageCheck, Pencil, Plus, Search, Settings2, Shapes, SlidersHorizontal, SprayCan, Trash2, TreePine, Truck, Users, X, type LucideIcon } from 'lucide-react';
import { dateLabel, getCalendar, fmt, getSupplierDetails, HISTORY_CATEGORIES, hasAdministrationAccess, hasOperationalAccess, hasPdfAccess, isProfileActive, listHolidays, monthLabel, received, round, currentMonth, workdays, type Data, type Entry, type MaterialType, type Profile } from '@/lib/model';
import { demoMonth } from '@/lib/seed';
import { OperationForm, roleLabel, type Operation } from './workspace-forms';

type Tab = 'Visão geral'|'Programação'|'Envios'|'Recebimentos'|'PDF mensal'|'Cadastros'|'Perfis de acesso'|'Histórico';
type State = {demo:boolean; profile:Profile|null; data:Data|null; mustChangePassword:boolean; canManageProfiles:boolean};
const planningMenu = [
  {label:'Visão geral',icon:LayoutDashboard},{label:'Programação',icon:CalendarDays},{label:'Envios',icon:Truck},
  {label:'Recebimentos',icon:PackageCheck},{label:'PDF mensal',icon:FileText}
] as const;
const administrationMenu = [
  {label:'Cadastros',icon:Settings2},{label:'Perfis de acesso',icon:Users},{label:'Histórico',icon:History}
] as const;
function canViewTab(tab:Tab,{profile,canManageProfiles}:State) {
  if (!profile) return false;
  if (tab==='Perfis de acesso') return canManageProfiles;
  if (tab==='Cadastros' || tab==='Histórico') return hasAdministrationAccess(profile);
  if (tab==='PDF mensal') return hasPdfAccess(profile);
  return true;
}
const panelDescriptions: Record<Tab,string> = {
  'Visão geral':'Acompanhe a programação e o andamento das entregas de materiais.',
  'Programação':'Planeje as entregas do mês e acompanhe o saldo de cada linha.',
  'Envios':'Acompanhe os materiais despachados por fornecedores e transportadoras.',
  'Recebimentos':'Consulte as entradas de materiais e as baixas realizadas na programação.',
  'PDF mensal':'Prepare a programação mensal para divulgação aos setores.',
  'Cadastros':'Gerencie materiais, fornecedores, regras de conversão e feriados.',
  'Perfis de acesso':'Gerencie os tipos de acesso e as permissões dos perfis cadastrados.',
  'Histórico':'Consulte quem fez cada alteração no planejamento.'
};
const blank = '—';
const timeLabel = (iso:string) => new Date(iso).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});
const historyDayFormatter = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
const normalizeSearch = (value:string) => value.trim().normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('pt-BR');
const emptyHistoryFilters = {date:'',author:'',category:''};
const nonce = (month:string, diff:number) => {
  const [y,m] = month.split('-').map(Number);
  return new Date(Date.UTC(y,m-1+diff,1)).toISOString().slice(0,7);
};
const inProgressFilter = 'andamento';
const planningStatuses = {
  Pendente:{tone:'blue', option:'Situação pendente'},
  Parcial:{tone:'planning-partial', option:'Situação parcial'},
  Entregue:{tone:'planning-delivered', option:'Situação entregue'},
  Cancelado:{tone:'planning-canceled', option:'Situação cancelado'}
} as const;
const weekdayFormatter = new Intl.DateTimeFormat('pt-BR',{weekday:'long',timeZone:'UTC'});
const materialIcons:Record<MaterialType,LucideIcon> = {
  Cimento:Container, Pedra:Mountain, Areia:Hourglass, Aditivo:FlaskConical, Sílica:Gem, Coque:Flame,
  'CA-50':Grip, 'CA-60':Grid3x3, Desmoldante:SprayCan, Combustível:Fuel, Madeira:TreePine, Arruela:CircleDot, Outro:Shapes
};
function MaterialIcon({type}:{type?:MaterialType}) {
  const Icon = type ? materialIcons[type] ?? Package : Package;
  return <span className="material-icon" title={type}><Icon size={15} aria-hidden="true"/></span>;
}
function status(e:Entry, actual:number): keyof typeof planningStatuses {
  if (e.canceled) return 'Cancelado';
  if (e.closed || actual >= e.quantity) return 'Entregue';
  if (actual > 0) return 'Parcial';
  return 'Pendente';
}
function Badge({label,tone}:{label:string;tone:string}) {
  return <span className={'badge '+tone}><i/>{label}</span>;
}
function Table({columns,children,empty,emptyLabel='Nenhum registro para os filtros selecionados.'}:{columns:string[];children:ReactNode;empty?:boolean;emptyLabel?:string}) {
  return <div className="table-scroll"><table><thead><tr>{columns.map((c,i)=><th key={i} className={c==='Ações'?'actions-heading':undefined}>{c}</th>)}</tr></thead><tbody>
    {empty ? <tr><td colSpan={columns.length} className="empty">{emptyLabel}</td></tr> : children}
  </tbody></table></div>;
}
function PaginatedTable<T>({label,columns,items,emptyLabel,renderRow,newestFirst=false}:{
  label:string;columns:string[];items:T[];emptyLabel?:string;renderRow:(item:T,index:number)=>ReactNode;
  newestFirst?:boolean;
}) {
  const pageSize = 10;
  const pageCount = Math.max(1,Math.ceil(items.length/pageSize));
  const [selectedPage,setPage] = useState(1);
  const page = Math.min(selectedPage,pageCount);
  if (page !== selectedPage) setPage(page);
  const offset = (page-1)*pageSize;
  const end = items.length-offset;
  const pageItems = newestFirst ? items.slice(offset,offset+pageSize) : items.slice(Math.max(0,end-pageSize),end).reverse();
  return <>
    <Table columns={columns} empty={!items.length} emptyLabel={emptyLabel}>
      {pageItems.map((item,index)=>renderRow(item,offset+index))}
    </Table>
    <nav className="catalog-pagination" aria-label={`Paginação de ${label}`}>
      <button type="button" className="button" disabled={page===1} onClick={()=>setPage(page-1)}>Anterior</button>
      <span aria-live="polite">Página {page} de {pageCount}</span>
      <button type="button" className="button" disabled={page===pageCount} onClick={()=>setPage(page+1)}>Próxima</button>
    </nav>
  </>;
}
function HistoryDateFilter({date,onChange}:{date:string;onChange:(date:string)=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft,setDraft] = useState(date);
  const label = date ? dateLabel(date) : 'Selecione uma data';
  return <>
    <button type="button" className="button history-date" aria-haspopup="dialog" onClick={()=>{
      setDraft(date);
      dialog.current?.showModal();
    }}>{label}</button>
    <dialog ref={dialog} className="dialog history-date-dialog" aria-labelledby="history-date-title">
      <form className="dialog-content" onSubmit={event=>{
        event.preventDefault();
        onChange(draft);
        dialog.current?.close();
      }}>
        <div className="dialog-head"><h2 id="history-date-title">Selecione uma data</h2>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={()=>dialog.current?.close()}><X size={18}/></button>
        </div>
        <div className="form-content">
          <input type="date" aria-label="Data do histórico" value={draft} required onChange={e=>setDraft(e.target.value)}/>
        </div>
        <div className="dialog-footer">
          {date && <button type="button" className="text-button history-clear-date" onClick={()=>{
            onChange('');
            dialog.current?.close();
          }}>Remover data</button>}
          <button type="button" className="button" onClick={()=>dialog.current?.close()}>Cancelar</button>
          <button type="submit" className="button primary">Aplicar</button>
        </div>
      </form>
    </dialog>
  </>;
}
function CatalogActions({operation,label,onOpen,children}:{operation:Operation;label:string;onOpen:(value:Operation)=>void;children?:ReactNode}) {
  return <div className="catalog-actions">
    <button type="button" className="icon-button" title="Editar" aria-label={'Editar '+label} onClick={()=>onOpen(operation)}><Pencil size={15} aria-hidden="true"/></button>
    {children}
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
  const [statusFilter,setStatusFilter] = useState(inProgressFilter);
  const [showFilters,setShowFilters] = useState(false);
  const [historyFilters,setHistoryFilters] = useState(emptyHistoryFilters);
  const [operation,setOperation] = useState<Operation|null>(null);
  const [toast,setToast] = useState('');
  const [menuId,setMenuId] = useState('');
  const [menuPosition,setMenuPosition] = useState({top:0,right:0});
  const [account,setAccount] = useState(false);
  const [mobile,setMobile] = useState(false);
  const [loginResult,setLoginResult] = useState('');
  const [accessPending,setAccessPending] = useState(false);
  const recoveryDialog = useRef<HTMLDialogElement>(null);
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
    if (!canViewTab(tab,refreshed)) go('Visão geral');
    if (input.action==='setProfileActive') {
      setToast(input.active ? 'Acesso reativado.' : 'Acesso desativado.');
      return;
    }
    const deleted = ['deleteMaterial','deleteSupplier','deleteConversion','deleteHoliday','deleteEntry','deleteShipment','deleteReceipt','clearHistory'].some(action=>action===input.action);
    setToast(deleted?'Registro excluído com sucesso.':input.action==='entryMonth'?'Programação salva com sucesso.':'Alteração salva com sucesso.');
  }

  function go(next:Tab) {setTab(next);setQuery('');setFilter('');setStatusFilter(inProgressFilter);setShowFilters(false);setMobile(false);setMenuId('');}
  async function access(email:string,password?:string) {
    const response = await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    await reload();
    go('Visão geral');
    setAccount(false);
  }
  async function submitAccess(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accessPending) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    setAccessPending(true);
    setLoginResult('');
    try {
      if (state?.demo) {
        await access('');
      } else if (state?.mustChangePassword) {
        if (password!==form.get('confirmation')) throw new Error('As senhas não coincidem.');
        const response = await fetch('/api/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
        if (!response.ok) throw new Error((await response.json()).error);
        await reload();
      } else {
        await access(String(form.get('email') ?? ''),password);
      }
    } catch (error) {
      setLoginResult(error instanceof Error ? error.message : 'Não foi possível acessar a conta.');
    } finally {
      setAccessPending(false);
    }
  }
  async function signOut() {
    try {
      const response = await fetch('/api/logout',{method:'POST'});
      if (!response.ok) throw new Error('Não foi possível sair.');
      setAccount(false);
      setLoginResult('');
      await reload();
      go('Visão geral');
    } catch {
      setToast('Não foi possível sair. Tente novamente.');
    }
  }
  const data = state?.data;
  const profile = state?.profile;
  const notification = toast && <div className="toast" role="status">{toast}<button className="icon-button" aria-label="Dispensar" onClick={()=>setToast('')}><X size={16}/></button></div>;
  if (!profile || !data) {
    const changingPassword = state?.mustChangePassword;
    return <main className="login">
      {state ? <div className="login-layout">
        <div className="login-brand">
          <span className="login-brand-mark"><CalendarDays size={28} aria-hidden="true"/></span>
          <p>Planejamento<br/> de Materiais</p>
          <span className="login-brand-name">Gerenciamento de ponta a ponta</span>
        </div>
        <section className="login-card" aria-labelledby="login-title">
          <h1 id="login-title">{state.demo ? 'Perfil indisponível' : changingPassword ? 'Defina sua nova senha' : 'Acesse sua conta'}</h1>
          <form key={changingPassword ? 'change' : 'login'} onSubmit={submitAccess}>
            {!state.demo && (changingPassword ? <>
              <p>Substitua a senha temporária para acessar o planejamento.</p>
              <label>Nova senha<input type="password" name="password" autoComplete="new-password" placeholder="Informe a nova senha" required/></label>
              <label>Confirme a nova senha<input type="password" name="confirmation" autoComplete="new-password" placeholder="Repita a nova senha" required/></label>
            </> : <>
              <label>E-mail<input name="email" type="email" autoComplete="username" required placeholder="Seu e-mail de trabalho"/></label>
              <label>Senha<input name="password" type="password" autoComplete="current-password" required placeholder="Informe sua senha"/></label>
            </>)}
            {loginResult && <p className="form-error" role="alert">{loginResult}</p>}
            <button className="button primary login-submit" type="submit" disabled={accessPending}>
              {accessPending ? (changingPassword?'Salvando…':'Entrando…') : state.demo ? 'Voltar como administrador' : changingPassword ? 'Salvar senha' : 'Entrar'}
              <ArrowRight size={17} aria-hidden="true"/>
            </button>
            {!state.demo && (changingPassword
              ? <button className="button" type="button" disabled={accessPending} onClick={()=>void signOut()}>Sair</button>
              : <button className="text-button login-recovery" type="button" onClick={()=>recoveryDialog.current?.showModal()}>Recuperar senha</button>)}
          </form>
        </section>
      </div> : <section className="login-loading" aria-labelledby="loading-title" role={failure?'alert':'status'}>
        <span className="login-brand-mark"><CalendarDays size={27} aria-hidden="true"/></span>
        <span className="app-title">Planejamento de Materiais</span>
        <h1 id="loading-title">{failure ? 'Configuração do ambiente' : 'Carregando planejamento…'}</h1>
        {failure ? <p>{failure}</p> : <div className="login-progress" aria-hidden="true"><span/></div>}
      </section>}
      <dialog className="dialog recovery-dialog" ref={recoveryDialog} aria-labelledby="recovery-title" aria-describedby="recovery-description"
        onClick={event=>{if(event.target===event.currentTarget) event.currentTarget.close();}}>
        <div className="recovery-content">
          <div className="recovery-heading">
            <span className="material-icon"><KeyRound size={20} aria-hidden="true"/></span>
            <button className="icon-button" type="button" aria-label="Fechar" onClick={()=>recoveryDialog.current?.close()}><X size={18}/></button>
          </div>
          <h2 id="recovery-title">Recuperar senha</h2>
          <p id="recovery-description">Entre em contato com o administrador para solicitar uma nova senha temporária.</p>
          <button className="button primary" type="button" autoFocus onClick={()=>recoveryDialog.current?.close()}>Entendi</button>
        </div>
      </dialog>
      {notification}
    </main>;
  }
  const operational = hasOperationalAccess(profile);
  const canDeletePermanently = state.canManageProfiles;
  const visiblePlanningMenu = planningMenu.filter(({label})=>canViewTab(label,state));
  const visibleAdministrationMenu = administrationMenu.filter(({label})=>canViewTab(label,state));
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
  const planning = tab==='Programação';
  const ordered = (planning ? selectedMonth : entries).filter(matching)
    .map(entry=>({entry,actual:received(data,entry.id)}))
    .map(row=>({...row,label:status(row.entry,row.actual)}))
    .filter(({label})=>!planning || !statusFilter ||
      (statusFilter===inProgressFilter ? label==='Pendente' || label==='Parcial' : label===statusFilter))
    .sort((a,b)=>a.entry.date.localeCompare(b.entry.date));
  const visibleEntries = tab==='Visão geral' ? ordered.slice(0,6) : ordered;
  const calendar = getCalendar(data,month);
  const holidays = tab==='Cadastros' && canViewTab(tab,state) ? listHolidays(data) : [];
  const work = workdays(month,calendar);
  const monthVersions = data.publications.filter(p=>p.month===month).slice().reverse();
  const profileInitials = operational ? 'RO' : profile.name.slice(0,2).toUpperCase();
  const primaryTitle = operational ? 'Nova programação':'Registrar envio';
  const primary = ()=>setOperation({kind:operational?'entryMonth':'shipment'});
  function toolbar() {
    const materialSelect = <select aria-label="Filtrar material" value={filter} onChange={e=>setFilter(e.target.value)}>
      <option value="">Todos os materiais</option>{Array.from(materials.values(),m=><option key={m.id} value={m.id}>{m.name}</option>)}
    </select>;
    if (planning) return <div className="tools">
      {materialSelect}
      <select aria-label="Filtrar situação" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
        <option value="">Todas situações</option>
        <option value={inProgressFilter}>Situação andamento</option>
        {Object.entries(planningStatuses).map(([label,{option}])=><option key={label} value={label}>{option}</option>)}
      </select>
    </div>;
    return <div className="tools">
      <div className="search"><Search size={16}/><input aria-label="Buscar material ou fornecedor" placeholder="Buscar material ou fornecedor…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <button className={'button '+(showFilters||filter?'selected':'')} onClick={()=>setShowFilters(!showFilters)}><SlidersHorizontal size={15}/> Filtros</button>
      {showFilters && materialSelect}
    </div>;
  }
  function planningTable() {
    return <Table columns={[planning?'Entrega':'Data prevista','Material','Fornecedor','Programado','Recebido',planning?'Pendente':'Saldo','Situação',...(operational?[planning?'Ações':'']:[])]} empty={!visibleEntries.length}>
      {visibleEntries.map(({entry:e,actual,label})=>{
        const material=materials.get(e.material);
        const balance = e.canceled || e.closed ? 0 : Math.max(0,round(e.quantity-actual));
        const quantityCell = (quantity:number) => <td><strong>{fmt(quantity)}</strong> <span className="muted">{material?.unit}</span></td>;
        return <tr key={e.id}><td className="date-cell"><time dateTime={e.date}>{dateLabel(e.date)}{planning&&<small>{weekdayFormatter.format(new Date(e.date))}</small>}</time></td><td><div className="material-cell"><MaterialIcon type={material?.type}/><div><strong>{material?.name || e.material}</strong><small>{e.material}</small></div></div></td>
          <td>{e.supplier}</td>{quantityCell(e.quantity)}
          {planning || actual ? quantityCell(actual) : <td><span className="muted">{blank}</span></td>}
          {planning ? quantityCell(balance) : <td>{e.canceled || e.closed ? blank : fmt(balance)}</td>}
          <td><Badge label={label} tone={planningStatuses[label].tone}/></td>
          {operational && <td className="row-actions"><button className="icon-button" aria-label="Ações da programação" onClick={event=>{
            const rect = event.currentTarget.getBoundingClientRect();
            setMenuPosition({top:Math.min(rect.bottom,window.innerHeight-(canDeletePermanently?155:119)),right:window.innerWidth-rect.right});
            setMenuId(menuId===e.id?'':e.id);
          }}><Ellipsis size={18}/></button>
            {menuId===e.id && <div className="pop row-pop" style={menuPosition}>
              <button onClick={()=>{setOperation({kind:'entry',id:e.id});setMenuId('');}} disabled={e.canceled||e.closed}>Editar programação</button>
              <button onClick={()=>{setOperation({kind:'receipt',id:e.id});setMenuId('');}} disabled={e.canceled||e.closed||actual>=e.quantity}>Registrar recebimento</button>
              <button className="danger" onClick={()=>{setOperation({kind:'cancel',id:e.id});setMenuId('');}} disabled={e.canceled||e.closed||actual>=e.quantity}>Cancelar programação</button>
              {canDeletePermanently&&<button className="danger" onClick={()=>{setOperation({kind:'deleteEntry',id:e.id});setMenuId('');}}>Excluir definitivamente</button>}
            </div>}</td>}
        </tr>;
      })}
    </Table>;
  }
  const history = tab==='Histórico' ? data.history : [];
  const authorQuery = normalizeSearch(historyFilters.author);
  const filteredHistory = history.filter(record=>{
    if (authorQuery && !normalizeSearch(record.author).includes(authorQuery)) return false;
    if (historyFilters.category && record.category!==historyFilters.category) return false;
    return !historyFilters.date || historyDayFormatter.format(new Date(record.date))===historyFilters.date;
  });
  function setHistoryFilter(key:keyof typeof historyFilters,value:string) {
    setHistoryFilters(filters=>({...filters,[key]:value}));
  }
  return <div className="shell">
    {mobile && <button className="mobile-overlay" aria-label="Fechar navegação" onClick={()=>setMobile(false)}/>}
    <aside className={'sidebar '+(mobile?'mobile-open':'')}>
      <span className="app-title">Planejamento de Materiais</span>
      <div className="nav"><p>PLANEJAMENTO</p>{visiblePlanningMenu.map(({label,icon:Icon})=><button className={tab===label?'active':''} key={label} onClick={()=>go(label)}><Icon size={17}/>{label}</button>)}
        {visibleAdministrationMenu.length>0&&<><p>ADMINISTRAÇÃO</p>{visibleAdministrationMenu.map(({label,icon:Icon})=><button className={tab===label?'active':''} key={label} onClick={()=>go(label)}><Icon size={17}/>{label}</button>)}</>}
      </div>
      <div className="sidebar-bottom">
        <div className="account-wrap">
          <button className="account" onClick={()=>setAccount(!account)}><span className="avatar">{profileInitials}</span><span><strong>{profile.name}</strong><small>{roleLabel[profile.role]}</small></span><ChevronsUpDown size={14}/></button>
          {account && <div className="pop account-pop">
            {state.demo ? <><span>Visualizar como</span><button onClick={()=>void access('').catch(e=>setToast(e.message))}>{roleLabel.admin}</button>
              {data.profiles.filter(isProfileActive).map(p=><button key={p.email} onClick={()=>void access(p.email).catch(e=>setToast(e.message))}>{p.name} · {roleLabel[p.role]}</button>)}</>
              : <button onClick={()=>void signOut()}><LogOut size={15}/> Sair</button>}
          </div>}
        </div>
      </div>
    </aside>
    <div className="main">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Abrir navegação" onClick={()=>setMobile(true)}><Menu size={20}/></button><span>Planejamento</span><ChevronRight size={14}/><strong>{tab}</strong></div><div className="top-actions">
        {state.demo && <span className="environment"><i/> Demonstração</span>}
      </div></header>
      <main className="content">
        <div className="page-heading"><div><h1>{tab}</h1><p>{panelDescriptions[tab]}</p></div>
          <div className="heading-actions">
            {visiblePlanningMenu.some(item=>item.label===tab) && <div className="month-control"><button aria-label="Mês anterior" onClick={()=>setMonth(nonce(month,-1))}><ChevronLeft size={15}/></button><label><CalendarDays size={16}/><span>{monthLabel(month)}</span><ChevronDown size={12}/><input type="month" aria-label="Selecionar mês" value={month} onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value))setMonth(e.target.value);}}/></label><button aria-label="Próximo mês" onClick={()=>setMonth(nonce(month,1))}><ChevronRight size={15}/></button></div>}
            {(tab==='Visão geral'||tab==='Programação'&&operational) && <button className="button primary" onClick={primary}><Plus size={17}/>{primaryTitle}</button>}
            {tab==='Envios' && <button className="button primary" onClick={()=>setOperation({kind:'shipment'})}><Plus size={17}/> Registrar envio</button>}
            {tab==='Recebimentos' && operational && <button className="button primary" onClick={()=>setOperation({kind:'receipt'})}><Plus size={17}/> Registrar recebimento</button>}
            {tab==='Perfis de acesso' && canViewTab(tab,state) && <button className="button primary" onClick={()=>setOperation({kind:'profile'})}><Plus size={17}/> Novo perfil</button>}
          </div>
        </div>
        {tab==='Visão geral' && <>
          <section className="hero"><div className="hero-content"><span className="hero-kicker"><CalendarDays size={14}/> PROGRAMAÇÃO MENSAL</span><h2>{monthLabel(month)}</h2><p>{open.length ? `${open.length} ${open.length===1?'linha com saldo pendente':'linhas com saldo pendente'} na programação.` : 'Nenhuma entrega pendente neste mês.'}</p><button onClick={()=>go('Programação')}>Ver programação <ArrowRight size={15}/></button></div><HeroArt/></section>
          <section className="metrics" aria-label="Indicadores do mês">{counts.map(({label,value,caption,icon:Icon,tone})=><article key={label} className="metric"><span className={'metric-icon '+tone}><Icon size={19}/></span><div className="metric-value">{value.toLocaleString('pt-BR')}</div><h3>{label}</h3><p>{caption}</p></article>)}</section>
        </>}
        {(tab==='Visão geral'||planning)&& <section className={planning?'panel planning-table':'panel'}>
          <div className="panel-heading"><div><h2>{tab==='Visão geral'?'Entregas programadas':'Programação do mês'}</h2><p>Quantidade planejada, recebida e situação por linha.</p></div>{toolbar()}</div>
          {planningTable()}
          <div className="panel-footer"><span>{visibleEntries.length} de {ordered.length} registros</span>{tab==='Visão geral'&& <button className="text-button" onClick={()=>go('Programação')}>Ver programação completa <ArrowRight size={15}/></button>}</div>
        </section>}
        {tab==='Envios'&& <section className="panel"><div className="panel-heading"><h2>Registros de envio</h2>{toolbar()}</div>
          <Table columns={['Expedição','Previsão','Material','Fornecedor','Quantidade','NF','Registrado por','Conferência',...(operational?['Ações']:[])]} empty={!shipments.filter(matching).length}>
            {shipments.filter(matching).slice().reverse().map(s=>{
              const links = data.receipts.filter(r=>r.shipment===s.id);
              const actual = round(links.reduce((sum,r)=>sum+r.converted,0));
              const difference = s.converted === undefined ? null : round(actual-s.converted);
              const comparison = s.duplicateOf ? ['Vinculado','gray'] : !links.length ? ['Sem recebimento','blue'] :
                difference === null ? ['Recebimento vinculado','blue'] : difference===0 ? ['Conferido','green'] :
                [`${fmt(Math.abs(difference))} ${materials.get(s.material)?.unit} a ${difference>0?'mais':'menos'}`,'amber'];
              return <tr key={s.id}><td>{dateLabel(s.date)}</td><td>{s.arrival?dateLabel(s.arrival):blank}</td><td><strong>{materials.get(s.material)?.name}</strong></td><td>{s.supplier}</td><td>{fmt(s.quantity)} {s.unit}</td><td>{s.nf||blank}</td><td>{s.author}</td><td><Badge label={comparison[0]} tone={comparison[1]}/></td>
              {operational && <td><div className="table-buttons">
                <button className="text-button" disabled={!!s.duplicateOf} onClick={()=>setOperation({kind:'duplicate',id:s.id})}><ArrowLeftRight size={15}/> Vincular</button>
                {canDeletePermanently&&<button type="button" className="icon-button danger" title="Excluir envio definitivamente" aria-label="Excluir envio definitivamente"
                  onClick={()=>setOperation({kind:'deleteShipment',id:s.id})}><Trash2 size={15} aria-hidden="true"/></button>}
              </div></td>}</tr>;})}
          </Table></section>}
        {tab==='Recebimentos'&& <section className="panel"><div className="panel-heading"><h2>Registros de recebimento</h2>{toolbar()}</div>
          <Table columns={['Recebido em','Material','Fornecedor','Quantidade','Convertida','NF','Frete','Ações']} empty={!receipts.filter(matching).length}>
            {receipts.filter(matching).slice().reverse().map(r=><tr key={r.id}><td>{dateLabel(r.date)}</td><td><strong>{materials.get(r.material)?.name}</strong></td><td>{r.supplier}</td><td>{fmt(r.quantity)} {r.unit}</td><td>{fmt(r.converted)} {materials.get(r.material)?.unit}</td><td>{r.nf||'Sem NF'}</td><td>{r.freight||blank}</td><td><div className="table-buttons">
              <button className="text-button" onClick={()=>setOperation({kind:'receiptDetails',id:r.id})}>Detalhes <ChevronRight size={14}/></button>
              {canDeletePermanently&&<button type="button" className="icon-button danger" title="Excluir recebimento definitivamente" aria-label="Excluir recebimento definitivamente"
                onClick={()=>setOperation({kind:'deleteReceipt',id:r.id})}><Trash2 size={15} aria-hidden="true"/></button>}
            </div></td></tr>)}
          </Table></section>}
        {tab==='PDF mensal'&&canViewTab(tab,state)&& <div className="stack">
          <section className="panel"><div className="panel-heading"><div><h2>Programação para os setores</h2><p>O PDF inclui as quantidades programadas do mês.</p></div><div className="tools">
            <a className="button" href={'/api/pdf?month='+month}><ArrowDownToLine size={16}/> Baixar PDF atual</a><button className="button primary" onClick={()=>setOperation({kind:'publish'})}><Plus size={16}/> Salvar versão</button>
          </div></div><div className="panel-body calendar-info"><div><span>Dias úteis equivalentes</span><strong>{fmt(work.total,2)}</strong></div><div><span>Turnos</span><strong>{calendar.shifts}</strong></div><div><span>Feriados</span><strong>{calendar.holidays.length ? calendar.holidays.map(dateLabel).join(', ') : 'Nenhum cadastrado'}</strong></div><button className="button" onClick={()=>setOperation({kind:'calendar'})}><CalendarDays size={16}/> Editar calendário</button></div></section>
          <section className="panel"><div className="panel-heading"><h2>Versões para divulgação</h2></div><Table columns={['Versão','Salva em','Linhas da programação','']} empty={!monthVersions.length}>{monthVersions.map((p,i)=><tr key={p.id}><td><strong>V{monthVersions.length-i}</strong></td><td>{timeLabel(p.date)}</td><td>{p.entries.length}</td><td><a className="text-button" href={`/api/pdf?month=${month}&version=${p.id}`}><ArrowDownToLine size={16}/> Baixar PDF</a></td></tr>)}</Table></section>
        </div>}
        {tab==='Cadastros'&&canViewTab(tab,state)&& <div className="stack catalog">
          <section className="panel catalog-table">
            <div className="panel-heading">
              <h2>Materiais</h2>
              <button type="button" className="button" onClick={()=>setOperation({kind:'material'})}>
                <Plus size={16} aria-hidden="true"/> Novo material
              </button>
            </div>
            <PaginatedTable label="materiais" columns={['Código','Material','Tipo','Unidade','Ações']} items={data.materials}
              renderRow={m=><tr key={m.id}>
                <td>{m.id}</td><td><strong>{m.name}</strong></td><td><span className="material-cell"><MaterialIcon type={m.type}/><span>{m.type ?? 'Sem tipo definido'}</span></span></td><td>{m.unit}</td>
                <td><CatalogActions operation={{kind:'material',id:m.id}} label={`material ${m.name} (${m.id})`} onOpen={setOperation}/></td>
              </tr>}/>
          </section>
          <section className="panel catalog-table">
            <div className="panel-heading">
              <h2>Fornecedores</h2>
              <button type="button" className="button" onClick={()=>setOperation({kind:'supplier'})}>
                <Plus size={16} aria-hidden="true"/> Novo fornecedor
              </button>
            </div>
            <PaginatedTable label="fornecedores" columns={['Código','Nome do fornecedor','Nome do responsável','E-mail','Contato','Ações']} items={data.suppliers} emptyLabel="Nenhum fornecedor cadastrado."
              renderRow={name=>{
                const details = getSupplierDetails(data,name);
                return <tr key={name}>
                  <td>{details?.code || blank}</td><td><strong>{name}</strong></td><td>{details?.responsible || blank}</td>
                  <td>{details?.email || blank}</td><td>{details?.contact || blank}</td>
                  <td><CatalogActions operation={{kind:'supplier',id:name}} label={`fornecedor ${name}`} onOpen={setOperation}/></td>
                </tr>;
              }}/>
          </section>
          <section className="panel catalog-table">
            <div className="panel-heading">
              <h2>Conversões</h2>
              <button type="button" className="button" onClick={()=>setOperation({kind:'conversion'})}>
                <Plus size={16} aria-hidden="true"/> Cadastrar conversão
              </button>
            </div>
            <PaginatedTable label="conversões" columns={['Fornecedor','Material','Unidade de origem','Operação','Fator','Ações']} items={data.conversions}
              renderRow={({supplier,material,unit,operation,factor})=>{
                const materialName = materials.get(material)?.name || material;
                return <tr key={JSON.stringify([supplier,material])}>
                  <td>{supplier}</td><td>{materialName}</td><td>{unit}</td><td>{operation==='divide'?'Divisão':'Multiplicação'}</td><td>{fmt(factor,8)}</td>
                  <td><CatalogActions operation={{kind:'conversion',scope:{supplier,material}}} label={`conversão de ${supplier} para ${materialName} (${material})`} onOpen={setOperation}/></td>
                </tr>;
              }}/>
          </section>
          <section className="panel catalog-table holiday-table">
            <div className="panel-heading">
              <h2>Feriados</h2>
              <button type="button" className="button" onClick={()=>setOperation({kind:'holiday'})}>
                <Plus size={16} aria-hidden="true"/> Novo feriado
              </button>
            </div>
            <PaginatedTable label="feriados" columns={['Data','Nome do feriado','Recorrência','Ações']} items={holidays} emptyLabel="Nenhum feriado cadastrado."
              renderRow={holiday=>{
                const action = holiday.active ? 'Desativar feriado' : 'Reativar feriado';
                const ActionIcon = holiday.active ? CirclePause : CirclePlay;
                return <tr key={holiday.date}>
                  <td><time dateTime={holiday.date}>{dateLabel(holiday.date)}</time></td>
                  <td><strong>{holiday.description}</strong></td>
                  <td>{holiday.annual?'Todos os anos':'Data única'}</td>
                  <td><CatalogActions operation={{kind:'holiday',id:holiday.date}} label={`feriado de ${dateLabel(holiday.date)}`} onOpen={setOperation}>
                    <button type="button" className="icon-button" title={action} aria-label={`${action}: ${holiday.description}, ${dateLabel(holiday.date)}`} onClick={()=>setOperation({kind:'setHolidayActive',id:holiday.date,active:!holiday.active})}><ActionIcon size={15} aria-hidden="true"/></button>
                  </CatalogActions></td>
                </tr>;
              }}/>
          </section>
        </div>}
        {tab==='Perfis de acesso'&&canViewTab(tab,state)&& <>
          <section className="panel catalog-table"><div className="panel-heading"><div><h2>Perfis cadastrados</h2><p>Compartilhe o endereço do portal e entregue a senha temporária diretamente à pessoa cadastrada.</p></div></div>
            <PaginatedTable label="perfis de acesso" columns={['Perfil','E-mail','Tipo','Ações']} items={data.profiles} renderRow={p=>{
              const active = isProfileActive(p);
              const ownProfile = profile.email===p.email;
              const accessAction = active ? 'Desativar acesso' : 'Reativar acesso';
              const AccessIcon = active ? CirclePause : CirclePlay;
              return <tr key={p.email}>
                <td><div className="profile-name"><strong>{p.name}</strong>{!active&&<Badge label="Inativo" tone="gray"/>}</div></td><td>{p.email}</td><td>{roleLabel[p.role]}</td>
                <td><div className="catalog-actions">
                  <button type="button" className="icon-button" title="Editar" aria-label={`Editar perfil de ${p.name}`} onClick={()=>setOperation({kind:'profile',id:p.email})}><Pencil size={15} aria-hidden="true"/></button>
                  {!state.demo&&<button type="button" className="icon-button" title="Redefinir senha" aria-label={`Redefinir senha de ${p.name}`} onClick={()=>setOperation({kind:'resetPassword',id:p.email})}><KeyRound size={15} aria-hidden="true"/></button>}
                  <button type="button" className="icon-button" title={accessAction} aria-label={`${accessAction} de ${p.name}`} disabled={ownProfile} onClick={()=>setOperation({kind:'setProfileActive',id:p.email,active:!active})}><AccessIcon size={15} aria-hidden="true"/></button>
                  <button type="button" className="icon-button danger" title="Revogar acesso" aria-label={`Revogar acesso de ${p.name}`} disabled={ownProfile} onClick={()=>setOperation({kind:'revoke',id:p.email})}><Trash2 size={15} aria-hidden="true"/></button>
                </div></td>
              </tr>;
            }}/>
          </section>
          <section className="panel profile-levels" aria-labelledby="profile-levels-title">
            <div className="panel-heading"><div>
              <h2 id="profile-levels-title">Níveis de acesso</h2>
              <p>Na ordem abaixo, cada nível tem as restrições do nível anterior e perde acesso a mais um recurso ou área.</p>
            </div></div>
            <ul className="panel-body" role="list">
              <li>Nível 4 - Todos os recursos, para administradores</li>
              <li>Nível 3 - Menos perfis de acesso, para gerenciadores</li>
              <li>Nível 2 - Menos administração, para auxiliares</li>
              <li>Nível 1 - Menos PDF mensal, para terceiros</li>
            </ul>
          </section>
        </>}
        {tab==='Histórico'&&canViewTab(tab,state)&& <section className="panel history-table">
          <div className="panel-heading"><h2>Alterações registradas</h2>
            <div className="tools history-filters" role="group" aria-label="Filtros do histórico">
              <input type="search" aria-label="Responsável" placeholder="Buscar responsável" value={historyFilters.author}
                onChange={e=>setHistoryFilter('author',e.target.value)}/>
              <HistoryDateFilter date={historyFilters.date} onChange={date=>setHistoryFilter('date',date)}/>
              <select aria-label="Tipo" value={historyFilters.category} onChange={e=>setHistoryFilter('category',e.target.value)}>
                <option value="">Todos os tipos</option>
                {HISTORY_CATEGORIES.map(category=><option key={category} value={category}>
                  Tipo {category==='PDF mensal' ? category : category.toLocaleLowerCase('pt-BR')}
                </option>)}
              </select>
              {canDeletePermanently&&<button type="button" className="button danger" disabled={!filteredHistory.length}
                onClick={()=>setOperation({kind:'clearHistory',historyIds:filteredHistory.map(record=>record.id)})}>
                <Trash2 size={15} aria-hidden="true"/> Limpar histórico
              </button>}
            </div>
          </div>
          <PaginatedTable key={JSON.stringify(historyFilters)} label="histórico"
            columns={['Data e hora','Responsável','Tipo','Alteração',...(canDeletePermanently?['Ações']:[])]}
            items={filteredHistory} newestFirst
            renderRow={record=><tr key={record.id}>
              <td>{timeLabel(record.date)}</td><td><strong>{record.author}</strong></td><td>{record.category}</td><td>{record.detail}</td>
              {canDeletePermanently&&<td><button type="button" className="icon-button danger" title="Excluir registro do histórico"
                aria-label={`Excluir registro de ${record.author} em ${timeLabel(record.date)}`}
                onClick={()=>setOperation({kind:'clearHistory',historyIds:[record.id]})}><Trash2 size={15} aria-hidden="true"/></button></td>}
            </tr>}/>
        </section>}
      </main>
    </div>
    {notification}
    {operation && <OperationForm operation={operation} profile={profile} data={data} month={month} demo={state.demo} onClose={()=>setOperation(null)} onSave={send}/>}
  </div>;
}
