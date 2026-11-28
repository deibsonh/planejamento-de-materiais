'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, Bell, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, CircleAlert, CircleCheck, CircleDot, Clock3, Container, Ellipsis, FileText, Flame, FlaskConical, Fuel, Gem, Grid3x3, Grip, History, Hourglass, Info, ListFilter, Tags, KeyRound, LayoutDashboard, LogOut, Menu, Mountain, Package, PackageCheck, Plus, Settings2, Shapes, SprayCan, Trash2, TriangleAlert, TreePine, Truck, UserRound, Users, X, type LucideIcon } from 'lucide-react';
import { allowed, dateLabel, deliveryDate, getCalendar, fmt, getSupplierDetails, hasAdministrationAccess, hasOperationalAccess, hasPdfAccess, isProfileActive, listHolidays, monthLabel, received, round, currentMonth, workdays, type Data, type Entry, type MaterialType, type Profile } from '@/lib/model';
import { demoMonth } from '@/lib/seed';
import { OperationForm, roleLabel, type Operation } from './workspace-forms';

const toastIcons = {info:Info,success:CircleCheck,warning:TriangleAlert,error:CircleAlert,default:Bell} as const;
type ToastMessage = {type:keyof typeof toastIcons;title:string;description:string};
function Toast({message,onDismiss}:{message:ToastMessage;onDismiss:()=>void}) {
  const Icon = toastIcons[message.type];
  return <div className={`toast toast-${message.type}`} role={message.type==='error'?'alert':'status'}>
    <span className="toast-symbol"><Icon size={20} aria-hidden="true"/></span>
    <div className="toast-content"><strong>{message.title}</strong><p>{message.description}</p></div>
    <button type="button" className="icon-button" aria-label="Dispensar notificação" onClick={onDismiss}><X size={17} aria-hidden="true"/></button>
  </div>;
}

type Tab = 'Visão geral'|'Programação'|'Entregas'|'Recebidos'|'PDF mensal'|'Cadastros'|'Perfis de acesso'|'Histórico';
type State = {demo:boolean; profile:Profile|null; data:Data|null; mustChangePassword:boolean; canManageProfiles:boolean};
const planningMenu = [
  {label:'Visão geral',icon:LayoutDashboard},{label:'Programação',icon:CalendarDays},{label:'Entregas',icon:Truck},
  {label:'Recebidos',icon:PackageCheck},{label:'PDF mensal',icon:FileText}
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
  'Entregas':'Acompanhe as entregas registradas por fornecedores e transportadoras.',
  'Recebidos':'Consulte as entradas de materiais e as baixas realizadas na programação.',
  'PDF mensal':'Prepare a programação mensal para divulgação aos setores.',
  'Cadastros':'Gerencie materiais, fornecedores, regras de conversão e feriados.',
  'Perfis de acesso':'Gerencie os tipos de acesso e as permissões dos perfis cadastrados.',
  'Histórico':'Consulte quem fez cada alteração no planejamento.'
};
const blank = '—';
const timeLabel = (iso:string) => new Date(iso).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});
const planningDayFormatter = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
const currentPlanningDay = () => planningDayFormatter.format(new Date());
const historyDayFormatter = new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short'});
const normalizeSearch = (value:string) => value.trim().normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('pt-BR');
const emptyHistoryFilters = {date:'',author:'',category:''};
const nonce = (month:string, diff:number) => {
  const [y,m] = month.split('-').map(Number);
  return new Date(Date.UTC(y,m-1+diff,1)).toISOString().slice(0,7);
};
const inProgressFilter = 'andamento';
const planningStatuses = {
  Pendente:{tone:'planning-pending', option:'Situação pendente'},
  Parcial:{tone:'planning-partial', option:'Situação parcial'},
  Atrasado:{tone:'planning-overdue', option:'Situação atrasado'},
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
function status(e:Entry, actual:number, today:string): keyof typeof planningStatuses {
  if (e.canceled) return 'Cancelado';
  if (e.closed || actual >= e.quantity) return 'Entregue';
  if (e.date < today) return 'Atrasado';
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
function PaginatedTable<T>({label,columns,items,emptyLabel,renderRow,newestFirst=false,pageSize=10,onPageSizeChange}:{
  label:string;columns:string[];items:T[];emptyLabel?:string;renderRow:(item:T,index:number)=>ReactNode;
  newestFirst?:boolean;pageSize?:number;onPageSizeChange?:(size:number)=>void;
}) {
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
    <nav className={onPageSizeChange?'catalog-pagination adjustable-pagination':'catalog-pagination'} aria-label={`Paginação de ${label}`}>
      <button type="button" className="button" disabled={page===1} onClick={()=>setPage(page-1)}>Anterior</button>
      <span aria-live="polite">Página {page} de {pageCount}</span>
      <button type="button" className="button" disabled={page===pageCount} onClick={()=>setPage(page+1)}>Próxima</button>
      {onPageSizeChange&&<label>Itens por página <select value={pageSize} onChange={event=>{
        setPage(1);
        onPageSizeChange(Number(event.target.value));
      }}>{[10,20,50,100].map(size=><option key={size}>{size}</option>)}</select></label>}
    </nav>
  </>;
}
function RowActions({label,children}:{label:string;children:ReactNode}) {
  const popover = useRef<HTMLDivElement>(null);
  const [open,setOpen] = useState(false);
  useEffect(()=>{
    if (!open) return;
    const dismiss = (event:Event) => {
      const menu = popover.current;
      if (menu?.matches(':popover-open') && !(event.target instanceof Node && menu.contains(event.target))) menu.hidePopover();
    };
    window.addEventListener('scroll',dismiss,true);
    window.addEventListener('resize',dismiss);
    return ()=>{
      window.removeEventListener('scroll',dismiss,true);
      window.removeEventListener('resize',dismiss);
    };
  },[open]);
  return <td className="row-actions">
    <button type="button" className="icon-button" aria-label={label} aria-expanded={open} onClick={event=>{
      const menu = popover.current;
      if (!menu || menu.matches(':popover-open')) {menu?.hidePopover();return;}
      const anchor = event.currentTarget.getBoundingClientRect();
      menu.showPopover();
      const {width,height} = menu.getBoundingClientRect();
      menu.style.left = Math.max(8,anchor.right-width)+'px';
      menu.style.top = Math.max(8,Math.min(anchor.bottom,window.innerHeight-height-8))+'px';
      menu.querySelector<HTMLElement>('button:not(:disabled),a')?.focus({preventScroll:true});
    }}><Ellipsis size={18} aria-hidden="true"/></button>
    <div ref={popover} className="pop row-pop" popover="auto" onToggle={event=>setOpen(event.newState==='open')}
      onClickCapture={event=>{
        if (event.target instanceof Element && event.target.closest('button:not(:disabled),a')) event.currentTarget.hidePopover();
      }}>{children}</div>
  </td>;
}
const catalogSubjects = {material:'material',supplier:'fornecedor',conversion:'conversão',holiday:'feriado'} as const;
function CatalogActions({operation,label,onOpen,children}:{operation:Operation & {kind:keyof typeof catalogSubjects};label:string;onOpen:(value:Operation)=>void;children?:ReactNode}) {
  return <RowActions label={'Ações de '+label}>
    <button type="button" onClick={()=>onOpen(operation)}>Editar {catalogSubjects[operation.kind]}</button>
    {children}
    <button type="button" className="danger" onClick={()=>onOpen({...operation,remove:true})}>Excluir {catalogSubjects[operation.kind]}</button>
  </RowActions>;
}
function FilterField({icon:Icon,children}:{icon:LucideIcon;children:ReactNode}) {
  return <span className="filter-field"><Icon size={15} aria-hidden="true"/>{children}</span>;
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
  const [today,setToday] = useState(currentPlanningDay);
  const [tab,setTab] = useState<Tab>('Visão geral');
  const [filter,setFilter] = useState('');
  const [supplierFilter,setSupplierFilter] = useState('');
  const [planningPageSize,setPlanningPageSize] = useState(10);
  const [statusFilter,setStatusFilter] = useState(inProgressFilter);
  const [historyFilters,setHistoryFilters] = useState(emptyHistoryFilters);
  const [operation,setOperation] = useState<Operation|null>(null);
  const [toast,setToast] = useState<ToastMessage|null>(null);
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
    const refreshDay = () => setToday(currentPlanningDay());
    const timer = window.setInterval(refreshDay,60_000);
    window.addEventListener('focus',refreshDay);
    return ()=>{
      window.clearInterval(timer);
      window.removeEventListener('focus',refreshDay);
    };
  },[]);
  useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(null),toast.type==='error'||toast.type==='warning'?7000:5500); return ()=>clearTimeout(timer);}},[toast]);
  async function send(input:Record<string,unknown>) {
    const response = await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    const refreshed = await reload();
    if (!canViewTab(tab,refreshed)) go('Visão geral');
    if (input.action==='setProfileActive') {
      setToast(input.active
        ? {type:'success',title:'Acesso reativado',description:'O perfil pode voltar a entrar no portal.'}
        : {type:'warning',title:'Acesso desativado',description:'O perfil perdeu o acesso ao portal.'});
    } else if (input.action==='clearHistory') {
      setToast({type:'success',title:'Histórico atualizado',description:'Os registros selecionados foram excluídos.'});
    } else if (['deleteMaterial','deleteSupplier','deleteConversion','deleteHoliday','deleteEntry','deleteShipment','deleteReceipt','deleteShipmentLogged','deleteReceiptLogged'].includes(String(input.action))) {
      setToast({type:'success',title:'Registro excluído',description:'O registro foi removido da listagem.'});
    } else if (input.action==='entryMonth') {
      setToast({type:'success',title:'Programação salva',description:'As quantidades informadas foram registradas no calendário.'});
    } else if (input.action==='cancel') {
      setToast({type:'warning',title:'Programação cancelada',description:'A entrega foi retirada da programação ativa.'});
    } else {
      setToast({type:'default',title:'Alteração salva',description:'Os dados do planejamento foram atualizados.'});
    }
  }

  function go(next:Tab) {setTab(next);setFilter('');setSupplierFilter('');setStatusFilter(next==='Programação'?inProgressFilter:'');setMobile(false);}
  async function access(email:string,password?:string) {
    const response = await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    const next = await reload();
    go('Visão geral');
    setAccount(false);
    if (next.demo && next.profile) setToast({type:'info',title:'Perfil de demonstração',description:`Você está visualizando o portal como ${next.profile.name}.`});
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
      setToast({type:'error',title:'Falha ao sair',description:'Tente encerrar a sessão novamente.'});
    }
  }
  const data = state?.data;
  const profile = state?.profile;
  const notification = toast && <Toast message={toast} onDismiss={()=>setToast(null)}/>;
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
  const shipments = data.shipments.filter(e=>deliveryDate(e).startsWith(month+'-'));
  const receipts = data.receipts.filter(e=>e.date.startsWith(month+'-'));
  const open = entries.filter(e=>!e.closed && received(data,e.id)<e.quantity);
  const counts = [
    {label:'Entregas programadas',value:entries.length,caption:'Linhas ativas no mês',icon:CalendarDays,tone:'mint'},
    {label:'Entregas registradas',value:shipments.filter(s=>!s.duplicateOf).length,caption:'Cargas informadas por parceiros',icon:Truck,tone:'sky'},
    {label:'Recebidos',value:receipts.length,caption:'Entradas registradas no mês',icon:PackageCheck,tone:'violet'},
    {label:'Entregas pendentes',value:open.length,caption:'Linhas com saldo em aberto',icon:Clock3,tone:'peach'}
  ];
  const planning = tab==='Programação';
  const overview = tab==='Visão geral';
  const scheduledView = planning || overview;
  const matchingScope = (record:{supplier:string;material:string}) =>
    (!filter || record.material===filter) && (!supplierFilter || record.supplier===supplierFilter);
  const scheduledEntries = overview ? data.entries.filter(entry=>entry.date===today && allowed(profile,entry)) : selectedMonth;
  const ordered = scheduledView ? scheduledEntries.filter(matchingScope)
    .map(entry=>({entry,actual:received(data,entry.id)}))
    .map(row=>({...row,label:status(row.entry,row.actual,today)}))
    .filter(({label})=>overview || !statusFilter ||
      (statusFilter===inProgressFilter ? label==='Pendente' || label==='Parcial' || label==='Atrasado' : label===statusFilter))
    .sort((a,b)=>a.entry.date.localeCompare(b.entry.date)) : [];
  const calendar = getCalendar(data,month);
  const holidays = tab==='Cadastros' && canViewTab(tab,state) ? listHolidays(data) : [];
  const work = workdays(month,calendar);
  const monthVersions = data.publications.filter(p=>p.month===month).slice().reverse();
  const profileInitials = operational ? 'RO' : profile.name.slice(0,2).toUpperCase();
  const primaryTitle = operational ? 'Nova programação':'Registrar entrega';
  const primary = ()=>setOperation({kind:operational?'entryMonth':'shipment'});
  const deliveryRows = tab==='Entregas' ? shipments.filter(matchingScope).slice().reverse().map(shipment=>{
    const links = data.receipts.filter(receipt=>receipt.shipment===shipment.id);
    const difference = shipment.converted===undefined ? null : round(links.reduce((sum,receipt)=>sum+receipt.converted,0)-shipment.converted);
    const situation = shipment.duplicateOf ? 'Entrega vinculada' : !links.length ? 'Sem recebimento' : difference===null ?
      'Recebimento vinculado' : difference===0 ? 'Entrega conferida' : 'Entrega com divergência';
    const detail = situation==='Entrega com divergência' && difference!==null
      ? `${fmt(Math.abs(difference))} ${materials.get(shipment.material)?.unit ?? ''} a ${difference>0?'mais':'menos'}` : situation;
    const tone = shipment.duplicateOf ? 'gray' : situation==='Entrega conferida' ? 'planning-delivered' :
      situation==='Entrega com divergência' ? 'planning-partial' : 'blue';
    return {shipment,situation,detail,tone};
  }).filter(row=>!statusFilter || row.situation===statusFilter) : [];
  const receiptRows = tab==='Recebidos' ? receipts.filter(matchingScope).slice().reverse()
    .filter(receipt=>!statusFilter || (receipt.shipment ? 'Entrega vinculada' : 'Sem entrega vinculada')===statusFilter) : [];
  const paginationKey = JSON.stringify([month,filter,supplierFilter,statusFilter]);
  function toolbar() {
    const materialSelect = <select aria-label="Filtrar material" value={filter} onChange={e=>setFilter(e.target.value)}>
      <option value="">Todos os materiais</option>{Array.from(materials.values(),m=><option key={m.id} value={m.id}>{m.name}</option>)}
    </select>;
    return <div className="tools movement-filters">
      <FilterField icon={Package}>{materialSelect}</FilterField>
      <FilterField icon={Truck}><select aria-label="Filtrar fornecedor" value={supplierFilter} onChange={e=>setSupplierFilter(e.target.value)}>
        <option value="">Todos os fornecedores</option>
        {data?.suppliers.map(supplier=><option key={supplier}>{supplier}</option>)}
      </select></FilterField>
      {!overview&&<FilterField icon={ListFilter}><select aria-label="Filtrar situação" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
        <option value="">Todas situações</option>
        {planning ? <>
          <option value={inProgressFilter}>Situação andamento</option>
          {Object.entries(planningStatuses).map(([label,{option}])=><option key={label} value={label}>{option}</option>)}
        </> : (tab==='Entregas'
          ? ['Entrega vinculada','Sem recebimento','Recebimento vinculado','Entrega conferida','Entrega com divergência']
          : ['Entrega vinculada','Sem entrega vinculada']).map(option=><option key={option}>{option}</option>)}
      </select></FilterField>}
    </div>;
  }
  function planningTable() {
    const columns = ['Entrega','Material','Fornecedor','Programado','Recebido','Pendente','Situação',...(operational?['Ações']:[])];
    const renderRow = ({entry:e,actual,label}:typeof ordered[number])=>{
        const material=materials.get(e.material);
        const balance = e.canceled || e.closed ? 0 : Math.max(0,round(e.quantity-actual));
        const quantityCell = (quantity:number) => <td><strong>{fmt(quantity)}</strong> <span className="muted">{material?.unit}</span></td>;
        return <tr key={e.id}><td className="date-cell"><time dateTime={e.date}>{dateLabel(e.date)}<small>{weekdayFormatter.format(new Date(e.date))}</small></time></td><td><div className="material-cell"><MaterialIcon type={material?.type}/><div><strong>{material?.name || e.material}</strong><small>{e.material}</small></div></div></td>
          <td>{e.supplier}</td>{quantityCell(e.quantity)}
          {quantityCell(actual)}
          {quantityCell(balance)}
          <td><Badge label={label} tone={planningStatuses[label].tone}/></td>
          {operational && <RowActions label="Ações da programação">
            <button type="button" onClick={()=>setOperation({kind:'entry',id:e.id})} disabled={e.canceled||e.closed}>Editar programação</button>
            <button type="button" onClick={()=>setOperation({kind:'receipt',id:e.id})} disabled={e.canceled||e.closed||actual>=e.quantity}>Registrar recebido</button>
            <button type="button" className="danger" onClick={()=>setOperation({kind:'cancel',id:e.id})} disabled={e.canceled||e.closed||actual>=e.quantity}>Cancelar programação</button>
            {canDeletePermanently&&<button type="button" className="danger" onClick={()=>setOperation({kind:'deleteEntry',id:e.id})}>Excluir definitivamente</button>}
          </RowActions>}
        </tr>;
    };
    if (planning) return <PaginatedTable key={paginationKey}
      label="programação do mês" columns={columns} items={ordered} newestFirst renderRow={renderRow}
      pageSize={planningPageSize} onPageSizeChange={setPlanningPageSize}/>;
    return <Table columns={columns} empty={!ordered.length} emptyLabel="Nenhuma entrega para hoje com os filtros selecionados.">{ordered.map(renderRow)}</Table>;
  }
  const history = tab==='Histórico' ? data.history : [];
  const authorQuery = normalizeSearch(historyFilters.author);
  const categoryQuery = normalizeSearch(historyFilters.category);
  const dateQuery = historyFilters.date.trim();
  const filteredHistory = history.filter(record=>{
    if (authorQuery && !normalizeSearch(record.author).includes(authorQuery)) return false;
    if (categoryQuery && !normalizeSearch(record.category).includes(categoryQuery)) return false;
    return !dateQuery || historyDayFormatter.format(new Date(record.date)).includes(dateQuery);
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
            {state.demo ? <><span>Visualizar como</span><button onClick={()=>void access('').catch(e=>setToast({type:'error',title:'Perfil indisponível',description:e.message}))}>{roleLabel.admin}</button>
              {data.profiles.filter(isProfileActive).map(p=><button key={p.email} onClick={()=>void access(p.email).catch(e=>setToast({type:'error',title:'Perfil indisponível',description:e.message}))}>{p.name} · {roleLabel[p.role]}</button>)}</>
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
            {tab==='Entregas' && <button className="button primary" onClick={()=>setOperation({kind:'shipment'})}><Plus size={17}/> Registrar entrega</button>}
            {tab==='Recebidos' && operational && <button className="button primary" onClick={()=>setOperation({kind:'receipt'})}><Plus size={17}/> Registrar recebido</button>}
            {tab==='Perfis de acesso' && canViewTab(tab,state) && <button className="button primary" onClick={()=>setOperation({kind:'profile'})}><Plus size={17}/> Novo perfil</button>}
          </div>
        </div>
        {tab==='Visão geral' && <>
          <section className="hero"><div className="hero-content"><span className="hero-kicker"><CalendarDays size={14}/> PROGRAMAÇÃO MENSAL</span><h2>{monthLabel(month)}</h2><p>{open.length ? `${open.length} ${open.length===1?'linha com saldo pendente':'linhas com saldo pendente'} na programação.` : 'Nenhuma entrega pendente neste mês.'}</p><button onClick={()=>go('Programação')}>Ver programação <ArrowRight size={15}/></button></div><HeroArt/></section>
          <section className="metrics" aria-label="Indicadores do mês">{counts.map(({label,value,caption,icon:Icon,tone})=><article key={label} className="metric"><span className={'metric-icon '+tone}><Icon size={19}/></span><div className="metric-value">{value.toLocaleString('pt-BR')}</div><h3>{label}</h3><p>{caption}</p></article>)}</section>
        </>}
        {scheduledView&& <section className="panel planning-table">
          <div className="panel-heading"><div><h2>{overview?'Entregas de hoje':'Programação do mês'}</h2><p>Quantidade planejada, recebida e situação por linha.</p></div>{toolbar()}</div>
          {planningTable()}
          {!planning&&<div className="panel-footer"><span>{ordered.length} {ordered.length===1?'registro':'registros'}</span><button className="text-button" onClick={()=>{setMonth(today.slice(0,7));go('Programação');}}>Ver programação completa <ArrowRight size={15}/></button></div>}
        </section>}
        {tab==='Entregas'&& <section className="panel"><div className="panel-heading"><h2>Entregas registradas</h2>{toolbar()}</div>
          <PaginatedTable key={paginationKey} label="entregas" pageSize={planningPageSize} onPageSizeChange={setPlanningPageSize}
            columns={['Data de entrega','Material','Fornecedor','Quantidade na nota fiscal','Número da nota fiscal','Número do frete','Registrado por','Conferência','Ações']}
            items={deliveryRows} newestFirst renderRow={({shipment:s,detail,tone})=>
              <tr key={s.id}><td>{dateLabel(deliveryDate(s))}</td><td><strong>{materials.get(s.material)?.name}</strong></td><td>{s.supplier}</td>
                <td>{fmt(s.quantity)} {s.unit}</td><td>{s.nf||blank}</td><td>{s.freight||blank}</td><td>{s.author}</td><td><Badge label={detail} tone={tone}/></td>
                <RowActions label="Ações da entrega">
                  {operational && <button type="button" disabled={!!s.duplicateOf} onClick={()=>setOperation({kind:'duplicate',id:s.id})}>Vincular entrega</button>}
                  {allowed(profile,s)&&<>
                    <button type="button" onClick={()=>setOperation({kind:'shipment',id:s.id})}>Editar entrega</button>
                    <button type="button" className="danger" onClick={()=>setOperation({kind:'deleteShipmentLogged',id:s.id})}>Excluir entrega</button>
                  </>}
                  {canDeletePermanently&&<button type="button" className="danger" onClick={()=>setOperation({kind:'deleteShipment',id:s.id})}>Excluir definitivamente</button>}
                </RowActions>
              </tr>}/>
        </section>}
        {tab==='Recebidos'&& <section className="panel"><div className="panel-heading"><h2>Materiais recebidos</h2>{toolbar()}</div>
          <PaginatedTable key={paginationKey} label="recebidos" pageSize={planningPageSize} onPageSizeChange={setPlanningPageSize}
            columns={['Recebido em','Material','Fornecedor','Quantidade','Convertida','NF','Frete','Situação','Ações']}
            items={receiptRows} newestFirst renderRow={r=><tr key={r.id}><td>{dateLabel(r.date)}</td><td><strong>{materials.get(r.material)?.name}</strong></td><td>{r.supplier}</td><td>{fmt(r.quantity)} {r.unit}</td><td>{fmt(r.converted)} {materials.get(r.material)?.unit}</td><td>{r.nf||'Sem NF'}</td><td>{r.freight||blank}</td>
              <td><Badge label={r.shipment?'Entrega vinculada':'Sem entrega vinculada'} tone={r.shipment?'planning-delivered':'gray'}/></td>
              <RowActions label="Ações do recebimento">
                <button type="button" onClick={()=>setOperation({kind:'receiptDetails',id:r.id})}>Ver detalhes</button>
                {canDeletePermanently&&<>
                  <button type="button" onClick={()=>setOperation({kind:'receipt',id:r.id})}>Editar material recebido</button>
                  <button type="button" className="danger" onClick={()=>setOperation({kind:'deleteReceiptLogged',id:r.id})}>Excluir material recebido</button>
                  <button type="button" className="danger" onClick={()=>setOperation({kind:'deleteReceipt',id:r.id})}>Excluir definitivamente</button>
                </>}
              </RowActions></tr>}/>
        </section>}
        {tab==='PDF mensal'&&canViewTab(tab,state)&& <div className="stack">
          <section className="panel"><div className="panel-heading"><div><h2>Programação para os setores</h2><p>O PDF inclui as quantidades programadas do mês.</p></div><div className="tools">
            <a className="button" href={'/api/pdf?month='+month}><ArrowDownToLine size={16}/> Baixar PDF atual</a><button className="button primary" onClick={()=>setOperation({kind:'publish'})}><Plus size={16}/> Salvar versão</button>
          </div></div><div className="panel-body calendar-info"><div><span>Dias úteis equivalentes</span><strong>{fmt(work.total,2)}</strong></div><div><span>Turnos</span><strong>{calendar.shifts}</strong></div><div><span>Feriados</span><strong>{calendar.holidays.length ? calendar.holidays.map(dateLabel).join(', ') : 'Nenhum cadastrado'}</strong></div><button className="button" onClick={()=>setOperation({kind:'calendar'})}><CalendarDays size={16}/> Editar calendário</button></div></section>
          <section className="panel"><div className="panel-heading"><h2>Versões para divulgação</h2></div><Table columns={['Versão','Salva em','Linhas da programação','Ações']} empty={!monthVersions.length}>{monthVersions.map((p,i)=><tr key={p.id}><td><strong>V{monthVersions.length-i}</strong></td><td>{timeLabel(p.date)}</td><td>{p.entries.length}</td><RowActions label="Ações da versão do PDF"><a href={`/api/pdf?month=${month}&version=${p.id}`}>Baixar PDF</a></RowActions></tr>)}</Table></section>
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
                <CatalogActions operation={{kind:'material',id:m.id}} label={`material ${m.name} (${m.id})`} onOpen={setOperation}/>
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
                  <CatalogActions operation={{kind:'supplier',id:name}} label={`fornecedor ${name}`} onOpen={setOperation}/>
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
                  <CatalogActions operation={{kind:'conversion',scope:{supplier,material}}} label={`conversão de ${supplier} para ${materialName} (${material})`} onOpen={setOperation}/>
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
                return <tr key={holiday.date}>
                  <td><time dateTime={holiday.date}>{dateLabel(holiday.date)}</time></td>
                  <td><strong>{holiday.description}</strong></td>
                  <td>{holiday.annual?'Todos os anos':'Data única'}</td>
                  <CatalogActions operation={{kind:'holiday',id:holiday.date}} label={`feriado de ${dateLabel(holiday.date)}`} onOpen={setOperation}>
                    <button type="button" onClick={()=>setOperation({kind:'setHolidayActive',id:holiday.date,active:!holiday.active})}>{action}</button>
                  </CatalogActions>
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
              return <tr key={p.email}>
                <td><div className="profile-name"><strong>{p.name}</strong>{!active&&<Badge label="Inativo" tone="gray"/>}</div></td><td>{p.email}</td><td>{roleLabel[p.role]}</td>
                <RowActions label={`Ações de ${p.name}`}>
                  <button type="button" onClick={()=>setOperation({kind:'profile',id:p.email})}>Editar perfil</button>
                  {!state.demo&&<button type="button" onClick={()=>setOperation({kind:'resetPassword',id:p.email})}>Redefinir senha</button>}
                  <button type="button" disabled={ownProfile} onClick={()=>setOperation({kind:'setProfileActive',id:p.email,active:!active})}>{accessAction}</button>
                  <button type="button" className="danger" disabled={ownProfile} onClick={()=>setOperation({kind:'revoke',id:p.email})}>Revogar acesso</button>
                </RowActions>
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
              <FilterField icon={UserRound}><input type="search" aria-label="Responsável" placeholder="Buscar responsável" value={historyFilters.author}
                onChange={e=>setHistoryFilter('author',e.target.value)}/></FilterField>
              <FilterField icon={CalendarDays}><input type="search" aria-label="Data" placeholder="Buscar data" value={historyFilters.date}
                onChange={e=>setHistoryFilter('date',e.target.value)}/></FilterField>
              <FilterField icon={Tags}><input type="search" aria-label="Tipo" placeholder="Buscar tipo" value={historyFilters.category}
                onChange={e=>setHistoryFilter('category',e.target.value)}/></FilterField>
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
              {canDeletePermanently&&<RowActions label={`Ações do registro de ${record.author} em ${timeLabel(record.date)}`}>
                <button type="button" className="danger" onClick={()=>setOperation({kind:'clearHistory',historyIds:[record.id]})}>Excluir histórico</button>
              </RowActions>}
            </tr>}/>
        </section>}
      </main>
    </div>
    {notification}
    {operation && <OperationForm operation={operation} profile={profile} data={data} month={month} demo={state.demo} onClose={()=>setOperation(null)} onSave={send}/>}
  </div>;
}
