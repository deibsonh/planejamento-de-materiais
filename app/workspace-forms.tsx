'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Plus, Trash2, X } from 'lucide-react';
import { allowed, calendarDays, catalogUnit, dateLabel, deliveryDate, getCalendar, fmt, getSupplierDetails, hasOperationalAccess, listHolidays, MATERIAL_TYPES, monthLabel, received, REGISTERED_UNITS, round, type Data, type Profile, type Scope } from '@/lib/model';

const permanentDeletionTitles = {
  deleteEntry:'Excluir programação definitivamente',
  deleteShipment:'Excluir entrega definitivamente',
  deleteShipmentLogged:'Excluir entrega',
  deleteReceipt:'Excluir recebimento definitivamente',
  deleteReceiptLogged:'Excluir recebido com histórico',
  clearHistory:'Limpar histórico'
} as const;
const titles = {
  ...permanentDeletionTitles,
  entry:'Editar programação', entryMonth:'Nova programação', receipt:'Registrar recebido', shipment:'Registrar entrega', cancel:'Cancelar programação',
  material:'Novo material', supplier:'Novo fornecedor', conversion:'Cadastrar conversão', profile:'Configurar perfil',
  calendar:'Calendário do mês', holiday:'Novo feriado', publish:'Salvar versão da programação', duplicate:'Vincular entregas',
  receiptDetails:'Detalhes do recebimento', revoke:'Revogar acesso', resetPassword:'Redefinir senha', setProfileActive:'Desativar acesso', setHolidayActive:'Desativar feriado'
};
const catalogOperations = {
  material:{editTitle:'Editar material',deleteTitle:'Excluir material',deleteAction:'deleteMaterial',subject:'o material'},
  supplier:{editTitle:'Editar fornecedor',deleteTitle:'Excluir fornecedor',deleteAction:'deleteSupplier',subject:'o fornecedor'},
  conversion:{editTitle:'Editar conversão',deleteTitle:'Excluir conversão',deleteAction:'deleteConversion',subject:'a conversão'},
  holiday:{editTitle:'Editar feriado',deleteTitle:'Excluir feriado',deleteAction:'deleteHoliday',subject:'o feriado'}
};
export type Operation = {id?:string;scope?:Scope;remove?:boolean} & (
  {kind:Exclude<keyof typeof titles,'setProfileActive'|'setHolidayActive'|'clearHistory'>} | {kind:'setProfileActive'|'setHolidayActive';id:string;active:boolean} | {kind:'clearHistory';historyIds:string[]}
);
const accessOptions = {
  partner:'Nível 1 - Terceiro',
  internal:'Nível 2 - Auxiliar',
  manager:'Nível 3 - Gerenciador',
  admin:'Nível 4 - Administrador'
} satisfies Record<Exclude<Profile['role'],'operator'>,string>;
export const roleLabel = {...accessOptions,operator:accessOptions.partner};
type Props = {operation:Operation;profile:Profile;data:Data;month:string;demo:boolean;onClose:()=>void;onSave:(input:Record<string,unknown>)=>Promise<void>};
const today = () => {
  const parts = new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Sao_Paulo'}).formatToParts(new Date());
  return ['year','month','day'].map(key=>parts.find(part=>part.type===key)?.value).join('-');
};
function parseQuantity(value:string) {
  const text = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(text)) return NaN;
  return Number(text.replaceAll('.','').replace(',','.'));
}
function validPlannedQuantity(quantity:number) {
  return Number.isFinite(quantity) && round(quantity)>=0.001 && quantity<=1e10;
}
function Field({label,children,wide=false}:{label:string;children:ReactNode;wide?:boolean}) {
  return <label className={wide?'wide':''}>{label}{children}</label>;
}
function Input({name,type='text',placeholder,initial,optional=false}:{name:string;type?:string;placeholder?:string;initial?:string|number;optional?:boolean}) {
  return <input name={name} type={type} placeholder={placeholder} defaultValue={initial} required={!optional} maxLength={180} autoComplete="off"/>;
}
function quantityInputValue(value:number) {
  return value.toLocaleString('pt-BR',{useGrouping:false,maximumSignificantDigits:21});
}
function Quantity({name='quantity',initial,placeholder='0,000'}:{name?:string;initial?:number;placeholder?:string}) {
  return <input name={name} inputMode="decimal" defaultValue={initial===undefined ? '' : quantityInputValue(initial)} placeholder={placeholder} required/>;
}
function CatalogUnitSelect({initial}:{initial?:string}) {
  const standard = initial ? catalogUnit(initial) : undefined;
  return <select name="unit" defaultValue={standard ?? initial ?? ''} required>
    <option value="" disabled>Selecione a unidade</option>
    {REGISTERED_UNITS.map(({value,label})=><option key={value} value={value}>{label}</option>)}
    {initial && !standard && <option value={initial}>{initial}</option>}
  </select>;
}
export function OperationForm({operation,profile,data,month,demo,onClose,onSave}:Props) {
  const {kind,id,scope:previousScope} = operation;
  const catalog = kind==='material'||kind==='supplier'||kind==='conversion'||kind==='holiday' ? catalogOperations[kind] : undefined;
  const deleting = Boolean(catalog && operation.remove);
  const initial = data.entries.find(e=>e.id===id);
  const shipment = data.shipments.find(e=>e.id===id);
  const receipt = data.receipts.find(e=>e.id===id);
  const existingProfile = data.profiles.find(e=>e.email===id);
  const showTemporaryPassword = !demo && !existingProfile;
  const existingMaterial = kind==='material' ? data.materials.find(m=>m.id===id) : undefined;
  const existingSupplier = kind==='supplier' && id ? getSupplierDetails(data,id) : undefined;
  const existingConversion = kind==='conversion' && previousScope ? data.conversions.find(c=>c.supplier===previousScope.supplier&&c.material===previousScope.material) : undefined;
  const movement = kind==='shipment' ? shipment : kind==='receipt' ? receipt : undefined;
  const editingReceipt = kind==='receipt' ? receipt : undefined;
  const initialScope = kind==='conversion' ? previousScope : movement ?? initial;
  const calendar = getCalendar(data,month);
  const existingHoliday = (kind==='holiday'||kind==='setHolidayActive') && id ? listHolidays(data).find(holiday=>holiday.date===id) : undefined;
  const [annualHoliday,setAnnualHoliday] = useState(existingHoliday?.annual ?? false);
  const planningDays = kind==='entryMonth' ? calendarDays(month) : [];
  const [dailyQuantities,setDailyQuantities] = useState<Record<string,string>>({});
  const [supplier,setSupplier] = useState(initialScope?.supplier || '');
  const [material,setMaterial] = useState(initialScope?.material || '');
  const [unit,setUnit] = useState(movement?.unit ?? '');
  const [quantity,setQuantity] = useState(movement ? quantityInputValue(movement.quantity) : '');
  const [nf,setNf] = useState(movement?.nf ?? '');
  const [role,setRole] = useState<Profile['role']>(existingProfile?.role ?? 'partner');
  const needsScopes = role==='partner';
  const [scopes,setScopes] = useState<Scope[]>(existingProfile?.scopes.length?existingProfile.scopes:[{supplier:'',material:''}]);
  const [allocations,setAllocations] = useState(editingReceipt?.allocations.map(row=>({entry:row.entry,amount:quantityInputValue(row.quantity),close:row.close}))
    ?? [{entry:initial?.id || '',amount:'',close:false}]);
  const [error,setError] = useState('');
  const [saving,setSaving] = useState(false);
  const requestId = useRef('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  const chosen = data.materials.find(m=>m.id===material);
  const canSchedule = Boolean(supplier && chosen && allowed(profile,{supplier,material}));
  const plannedEntries = kind==='entryMonth' && canSchedule ? planningDays.flatMap(({iso})=>{
    const raw = dailyQuantities[iso]?.trim();
    if (!raw || calendar.holidays.includes(iso)) return [];
    const quantity = parseQuantity(raw);
    return quantity===0 ? [] : [{date:iso,quantity}];
  }) : [];
  const plannedTotal = round(plannedEntries.reduce((sum,{quantity})=>validPlannedQuantity(quantity)?sum+round(quantity):sum,0));
  const conversion = data.conversions.find(c=>c.supplier===supplier && c.material===material);
  const actualUnit = unit || chosen?.unit || '';
  const sameMovementScope = movement?.supplier===supplier && movement.material===material;
  const retainedFactor = editingReceipt && sameMovementScope && editingReceipt.unit===actualUnit ? editingReceipt : undefined;
  const factor = retainedFactor ? retainedFactor.operation==='identity'?undefined:retainedFactor :
    actualUnit === chosen?.unit ? undefined : conversion;
  const amount = parseQuantity(quantity);
  const convert = round(!factor ? amount : factor.operation==='divide' ? amount/factor.factor : amount*factor.factor);
  const distributed = round(allocations.reduce((sum,a)=>sum+(parseQuantity(a.amount)||0),0));
  const previousAllocations = new Map(editingReceipt?.allocations.map(row=>[row.entry,row]));
  const balanceFor = (entry:Data['entries'][number]) => round(entry.quantity-received(data,entry.id)+(previousAllocations.get(entry.id)?.quantity ?? 0));
  const available = data.entries.filter(entry=>entry.supplier===supplier && entry.material===material &&
    (previousAllocations.has(entry.id) || (!entry.canceled && !entry.closed && balanceFor(entry)>0))).sort((a,b)=>a.date.localeCompare(b.date));
  const shipmentOptions = data.shipments.filter(s=>s.supplier===supplier&&s.material===material&&!s.duplicateOf);
  const kindsWithScope = ['receipt','entry','entryMonth','shipment','conversion'];
  const scoped = !deleting && kindsWithScope.includes(kind);
  const title = catalog && deleting ? catalog.deleteTitle : catalog && (id || previousScope) ? catalog.editTitle :
    kind==='profile'&&existingProfile ? 'Editar perfil' : kind==='setProfileActive'&&operation.active ? 'Reativar acesso' :
    movement ? kind==='shipment'?'Editar entrega':'Editar material recebido' : kind==='setHolidayActive'&&operation.active ? 'Reativar feriado' : titles[kind];
  const permanentDeletion = Object.hasOwn(permanentDeletionTitles,kind);
  const submitLabel = deleting || permanentDeletion ? 'Confirmar exclusão' : kind==='cancel'||kind==='revoke'||kind==='setProfileActive'||kind==='setHolidayActive' ? title :
    kind==='entryMonth' ? 'Salvar programação' : 'Salvar registro';
  const catalogName = kind==='material' && existingMaterial ? `${existingMaterial.name} (${existingMaterial.id})` :
    kind==='supplier' ? id : existingHoliday ? `${existingHoliday.description} (${dateLabel(existingHoliday.date)})` :
    previousScope && `${previousScope.supplier} / ${data.materials.find(m=>m.id===previousScope.material)?.name ?? previousScope.material}`;
  const readonly = kind==='receiptDetails';
  const unitOptions = [...new Set([chosen?.unit || '',conversion?.unit || '',sameMovementScope ? movement.unit : ''].filter(Boolean))];
  const updateAllocation = (index:number, update:Partial<typeof allocations[number]>)=>setAllocations(rows=>rows.map((r,i)=>i===index?{...r,...update}:r));
  function changeScope(nextSupplier:string,nextMaterial:string) {
    setSupplier(nextSupplier);
    setMaterial(nextMaterial);
    setUnit('');
    if(kind==='receipt')setAllocations([{entry:'',amount:'',close:false}]);
  }
  function changeSupplier(nextSupplier:string) {
    const keepMaterial = kind==='entryMonth' && (!nextSupplier || allowed(profile,{supplier:nextSupplier,material}));
    changeScope(nextSupplier,keepMaterial ? material : '');
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError('');
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const input:Record<string,unknown> = {...form,action:deleting && catalog ? catalog.deleteAction : kind,id,month,requestId:requestId.current};
    if (scoped) Object.assign(input,{supplier,material});
    if (kind==='entry') input.quantity = parseQuantity(String(form.quantity));
    if (kind==='entryMonth') {
      planningDays.forEach(({iso})=>delete input[iso]);
      const invalid = plannedEntries.find(({quantity})=>!validPlannedQuantity(quantity));
      if (invalid || !plannedEntries.length) {
        setError(invalid ? 'Informe uma quantidade válida para '+dateLabel(invalid.date)+'.' : 'Informe a quantidade de pelo menos um dia.');
        return;
      }
      input.days = plannedEntries;
    }
    if (kind==='conversion' && !deleting) {
      input.factor = parseQuantity(String(form.factor));
      if (previousScope) Object.assign(input,{previousSupplier:previousScope.supplier,previousMaterial:previousScope.material});
    }
    if (kind==='conversion' && deleting) Object.assign(input,previousScope);
    if (kind==='shipment'||kind==='receipt') input.quantity = amount;
    if (kind==='receipt') input.unit = actualUnit;
    if (kind==='receipt') {
      if (editingReceipt) input.receiptId = editingReceipt.id;
      input.allocations = allocations.map(a=>({entry:a.entry,quantity:parseQuantity(a.amount),close:a.close}));
      if (form.invoicedQuantity && String(form.invoicedQuantity).trim()) input.invoicedQuantity = parseQuantity(String(form.invoicedQuantity));
      else delete input.invoicedQuantity;
    }
    if (kind==='revoke') input.email = id;
    if (kind==='clearHistory') input.historyIds = operation.historyIds;
    if (kind==='setProfileActive'||kind==='setHolidayActive') input.active = operation.active;
    if (kind==='profile') Object.assign(input,{role,scopes:needsScopes?scopes:[]});
    setSaving(true);
    try {await onSave(input);onClose();}
    catch(error){setError(error instanceof Error ? error.message:'Não foi possível salvar.');}
    finally{setSaving(false);}
  }
  return <dialog ref={dialog} className={kind==='entryMonth'?'dialog planning-dialog':'dialog'} aria-labelledby="operation-title" onCancel={e=>{e.preventDefault();if(!saving)onClose();}} onClick={e=>{if(e.target===dialog.current&&!saving)onClose();}}>
    <form className="dialog-content" onSubmit={submit}>
      <div className="dialog-head"><h2 id="operation-title">{title}</h2><button type="button" className="icon-button" aria-label="Fechar" disabled={saving} onClick={onClose}><X size={20}/></button></div>
      <div className="form-content">
        {scoped && <div className="form-grid">
          <Field label="Fornecedor"><select value={supplier} required onChange={e=>changeSupplier(e.target.value)}><option value="">Selecione um fornecedor</option>{data.suppliers.filter(s=>hasOperationalAccess(profile)||profile.scopes.some(p=>p.supplier===s)).map(s=><option key={s}>{s}</option>)}</select></Field>
          <Field label="Material"><select value={material} required onChange={e=>changeScope(supplier,e.target.value)}><option value="">Selecione um material</option>{data.materials.filter(m=>allowed(profile,{supplier,material:m.id})).map(m=><option key={m.id} value={m.id}>{m.name} · {m.id}{kind==='entryMonth' ? ' · '+m.unit : ''}</option>)}</select></Field>
        </div>}
        {kind==='entryMonth'&&<fieldset className="planning-calendar" disabled={!canSchedule || saving}>
          <legend>{monthLabel(month)}</legend>
          <div className="planning-scroll">
            <div className="planning-grid" inert={!canSchedule}>
              {['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'].map(day=><span key={day} className="planning-weekday" aria-hidden="true">{day}</span>)}
              {planningDays.map(({iso,day,weekday})=>{
                const holiday = calendar.holidays.includes(iso);
                return <label key={iso} className={holiday?'planning-day planning-holiday':'planning-day'}
                  style={day===1 ? {gridColumnStart:weekday+1} : undefined}>
                  <span>Dia {String(day).padStart(2,'0')}</span>
                  <input name={iso} inputMode="decimal" maxLength={18} placeholder="0,000" disabled={!canSchedule || holiday || saving} value={dailyQuantities[iso] ?? ''}
                    onChange={event=>setDailyQuantities({...dailyQuantities,[iso]:event.target.value})}
                    aria-label={`Quantidade em ${dateLabel(iso)}${chosen ? ' ('+chosen.unit+')' : ''}${holiday?' — feriado':''}`}/>
                </label>;
              })}
            </div>
          </div>
        </fieldset>}
        {kind==='entry'&&<div className="form-grid"><Field label="Data prevista"><Input name="date" type="date" initial={initial?.date || month+'-01'}/></Field><Field label={chosen?'Quantidade programada ('+chosen.unit+')':'Quantidade programada'}><Quantity initial={initial?.quantity}/></Field></div>}
        {(kind==='receipt'||kind==='shipment')&&<>
          <div className="form-grid">
            {kind==='receipt'&&<Field label="Data real do recebimento"><Input name="date" type="date" initial={receipt?.date ?? today()}/></Field>}
            <Field label={kind==='receipt'?'Quantidade recebida':'Quantidade na nota fiscal'}><input value={quantity} onChange={e=>setQuantity(e.target.value)} inputMode="decimal" placeholder="0,000" required/></Field>
            {kind==='shipment' ? <Field label="Unidade na nota fiscal"><Input name="unit" initial={shipment?.unit} placeholder="Informe a unidade"/></Field> :
              <Field label="Unidade"><select value={actualUnit} onChange={e=>setUnit(e.target.value)} required><option value="">Selecione</option>{unitOptions.map(u=><option key={u}>{u}</option>)}</select></Field>}
            <Field label={kind==='shipment'?'Número da nota fiscal':'Nota fiscal'}><input name="nf" value={nf} onChange={e=>setNf(e.target.value)} maxLength={180} placeholder="Opcional"/></Field>
            <Field label="Número do frete"><Input name="freight" initial={movement?.freight} optional placeholder="Opcional"/></Field>
            {kind==='shipment'&&<>
              <Field label="Observações" wide><textarea name="notes" rows={3} maxLength={1000} defaultValue={shipment?.notes} placeholder="Opcional"/></Field>
              <Field label="Data de entrega"><Input name="date" type="date" initial={shipment ? deliveryDate(shipment) : today()}/></Field>
              <Field label="Registrado por"><input value={shipment?.author ?? profile.name} readOnly/></Field>
            </>}
            {kind==='receipt'&&<>
              {nf.trim()&&<Field label={actualUnit?'Quantidade na NF ('+actualUnit+')':'Quantidade na NF'}><input name="invoicedQuantity" defaultValue={editingReceipt?.invoicedQuantity===undefined ? undefined : quantityInputValue(editingReceipt.invoicedQuantity)} inputMode="decimal" placeholder="Opcional"/></Field>}
              <Field label="Entrega correspondente" wide><select name="shipment" defaultValue={editingReceipt?.shipment ?? ''}><option value="">Sem vínculo com uma entrega</option>{shipmentOptions.map(s=><option key={s.id} value={s.id}>{dateLabel(deliveryDate(s))} · {fmt(s.quantity)} {s.unit} · {s.nf?'NF '+s.nf:s.author}</option>)}</select></Field></>}
          </div>
          {kind==='receipt'&& <div className="allocation">
            <div className="allocation-title"><div><h3>Baixas na programação</h3><p>Selecione as linhas e distribua a quantidade recebida.</p></div></div>
            <div className="conversion-summary"><span>Total para baixar <strong>{convert>0?fmt(convert):'0'} {chosen?.unit}</strong></span>{factor&&<span>Fator aplicado <strong>{factor.operation==='divide'?'÷':'×'} {fmt(factor.factor,8)}</strong></span>}<span>Distribuído <strong>{fmt(distributed)} {chosen?.unit}</strong></span></div>
            {allocations.map((a,i)=>{
              const entry=available.find(e=>e.id===a.entry);
              const balance=entry?balanceFor(entry):0;
              const difference=round(balance-parseQuantity(a.amount));
              return <div className="allocation-row" key={i}><div className="form-grid allocation-grid">
                <Field label="Linha da programação"><select required value={a.entry} onChange={e=>updateAllocation(i,{entry:e.target.value,close:false})}><option value="">Selecione</option>{available.filter(e=>e.id===a.entry||!allocations.some(other=>other.entry===e.id)).map(e=><option key={e.id} value={e.id}>{dateLabel(e.date)} · Saldo {fmt(balanceFor(e))} {chosen?.unit}</option>)}</select></Field>
                <Field label="Quantidade a abater"><input required value={a.amount} onChange={e=>updateAllocation(i,{amount:e.target.value,close:parseQuantity(e.target.value)<balance && a.close})} inputMode="decimal" placeholder="0,000"/></Field>
                {allocations.length>1&&<button type="button" className="icon-button danger" aria-label="Remover baixa" onClick={()=>setAllocations(allocations.filter((_,index)=>index!==i))}><Trash2 size={17}/></button>}
              </div>
              {entry&&difference>0&&a.amount&&<label className="check"><input type="checkbox" checked={a.close} onChange={e=>updateAllocation(i,{close:e.target.checked})}/> Encerrar saldo restante de {fmt(difference)} {chosen?.unit}</label>}
              {entry&&difference<0&&<p className="info">Entrega a mais de {fmt(-difference)} {chosen?.unit}. A linha será encerrada.</p>}
              </div>;
            })}
            <button type="button" className="text-button" disabled={available.length<=allocations.length} onClick={()=>setAllocations([...allocations,{entry:'',amount:'',close:false}])}><Plus size={15}/> Adicionar outra linha</button>
          </div>}
        </>}
        {kind==='material'&&!deleting&&<div className="form-grid">
          <Field label="Código"><Input name="code" placeholder="Informe o código" initial={existingMaterial?.id}/></Field>
          <Field label="Unidade"><CatalogUnitSelect initial={existingMaterial?.unit}/></Field>
          <Field label="Nome do material"><Input name="name" placeholder="Informe o material" initial={existingMaterial?.name}/></Field>
          <Field label="Tipo de material"><select name="type" defaultValue={existingMaterial?.type ?? ''} required={!existingMaterial || Boolean(existingMaterial.type)}>
            <option value="" disabled={!existingMaterial || Boolean(existingMaterial.type)}>{existingMaterial && !existingMaterial.type ? 'Sem tipo definido' : 'Selecione um tipo'}</option>
            {MATERIAL_TYPES.map(type=><option key={type}>{type}</option>)}
          </select></Field>
        </div>}
        {kind==='supplier'&&!deleting&&<div className="form-grid">
          <Field label="Código"><Input name="code" placeholder="Informe o código" initial={existingSupplier?.code} optional/></Field>
          <Field label="Nome do fornecedor"><Input name="name" placeholder="Informe o fornecedor" initial={id}/></Field>
          <Field label="Nome do responsável" wide><Input name="responsible" placeholder="Informe o responsável" initial={existingSupplier?.responsible} optional/></Field>
          <Field label="E-mail"><Input name="email" type="email" placeholder="ana@email.com.br" initial={existingSupplier?.email} optional/></Field>
          <Field label="Contato"><Input name="contact" type="tel" placeholder="11 98765-4321" initial={existingSupplier?.contact} optional/></Field>
        </div>}
        {kind==='conversion'&&!deleting&&<div className="form-grid">
          <Field label="Unidade do fornecedor"><CatalogUnitSelect initial={existingConversion?.unit}/></Field>
          <Field label="Fator"><Quantity name="factor" placeholder="Informe o valor" initial={existingConversion?.factor}/></Field>
          <Field label="Operação aplicada à quantidade" wide><select name="operation" defaultValue={existingConversion?.operation}><option value="divide">Divisão</option><option value="multiply">Multiplicação</option></select></Field>
        </div>}
        {deleting&&catalog&&<p>Excluir {catalog.subject} <strong>{catalogName}</strong>?</p>}
        {kind==='profile'&&<>
          <div className="form-grid">
            <Field label="Tipo de acesso"><select value={role==='operator'?'partner':role} onChange={e=>setRole(e.target.value as Profile['role'])}>{Object.entries(accessOptions).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Nome do perfil"><Input name="name" initial={existingProfile?.name} placeholder="Informe o nome do perfil"/></Field>
            <Field label="E-mail autorizado" wide={!showTemporaryPassword}><Input name="email" type="email" initial={existingProfile?.email} placeholder="contato@empresa.com.br"/></Field>
            {showTemporaryPassword&&<Field label="Senha temporária"><input name="password" type="password" autoComplete="new-password" placeholder="Informe a senha temporária" required/></Field>}
          </div>
          {needsScopes&&<div className="allocation permissions">
            <div className="allocation-title permission-heading">
              <h3>Permissões de acesso</h3>
              <button type="button" className="text-button" onClick={()=>setScopes([...scopes,{supplier:'',material:''}])}><Plus size={15}/> Adicionar permissão</button>
            </div>
            {scopes.map((s,i)=><div key={i} className="form-grid allocation-grid">
              <Field label="Fornecedor"><select required value={s.supplier} onChange={e=>setScopes(scopes.map((other,j)=>j===i?{...other,supplier:e.target.value}:other))}><option value="" disabled>Selecione o fornecedor</option>{data.suppliers.map(s=><option key={s}>{s}</option>)}</select></Field>
              <Field label="Material"><select required value={s.material} onChange={e=>setScopes(scopes.map((other,j)=>j===i?{...other,material:e.target.value}:other))}><option value="" disabled>Selecione o material</option>{data.materials.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
              {scopes.length>1&&<button type="button" className="icon-button danger" aria-label="Remover permissão" onClick={()=>setScopes(scopes.filter((_,j)=>i!==j))}><Trash2 size={17}/></button>}
            </div>)}
          </div>}
        </>}
        {kind==='calendar'&&<div className="form-grid">
          <Field label="Turnos"><Input name="shifts" type="number" initial={calendar.shifts}/></Field>
          <Field label="Dias de segunda a sexta"><Input name="weekdays" type="number" initial={calendar.weekdays} optional placeholder="Calcular automaticamente"/></Field>
          <Field label="Sábados"><Input name="saturdays" type="number" initial={calendar.saturdays} optional placeholder="Calcular automaticamente"/></Field>
        </div>}
        {kind==='holiday'&&!deleting&&<div className="form-grid">
          <Field label="Recorrência"><select name="annual" value={String(annualHoliday)} onChange={e=>setAnnualHoliday(e.target.value==='true')}>
            <option value="false">Data única</option>
            <option value="true">Todos os anos</option>
          </select></Field>
          <Field label="Data"><Input name="date" type="date" initial={existingHoliday?.annual
            ? `${existingHoliday.date==='02-29' ? '2000' : month.slice(0,4)}-${existingHoliday.date}` : existingHoliday?.date}/></Field>
          <Field label="Nome do feriado" wide><Input name="description" placeholder="Descreva o feriado" initial={existingHoliday?.description}/></Field>
        </div>}
        {permanentDeletion&&<>
          {kind==='deleteEntry'&&<p>A programação de <strong>{initial?.supplier}</strong> em {initial && dateLabel(initial.date)} será removida também das versões de PDF disponíveis no portal. Exclua os recebimentos vinculados primeiro.</p>}
          {(kind==='deleteShipment'||kind==='deleteShipmentLogged')&&<p>A entrega de <strong>{shipment?.supplier}</strong> em {shipment && dateLabel(deliveryDate(shipment))} será excluída. Os registros vinculados serão mantidos e ficarão sem o vínculo com essa entrega.</p>}
          {(kind==='deleteReceipt'||kind==='deleteReceiptLogged')&&<p>O recebimento de <strong>{receipt?.supplier}</strong> em {receipt && dateLabel(receipt.date)} será excluído e suas baixas serão estornadas.</p>}
          {kind==='clearHistory'&&<p>{operation.historyIds.length===1
            ? 'O registro selecionado será apagado do histórico.'
            : `Os ${operation.historyIds.length} registros selecionados serão apagados do histórico.`}</p>}
          <p>{kind==='deleteShipmentLogged'||kind==='deleteReceiptLogged'
            ? 'A exclusão será registrada no histórico.'
            : 'Esta exclusão é definitiva e não gera um novo registro no histórico.'}</p>
        </>}
        {kind==='cancel'&&<p>Cancelar a programação de {initial?.supplier} em {initial?dateLabel(initial.date):''}? O registro ficará disponível no histórico.</p>}
        {kind==='publish'&&<p>Salvar uma versão de {monthLabel(month)} para divulgação? Ela preservará as quantidades, os materiais e o calendário atuais.</p>}
        {kind==='resetPassword'&&<>
          <p>Defina uma senha temporária para <b>{existingProfile?.email}</b></p>
          <Field label="Nova senha temporária"><input name="password" type="password" autoComplete="new-password" placeholder="Informe a nova senha temporária" required/></Field>
        </>}
        {kind==='revoke'&&<p>Revogar o acesso de <b>{existingProfile?.name}</b>? O histórico dos lançamentos continuará disponível</p>}
        {kind==='setProfileActive'&&<p>{title} de <strong>{existingProfile?.name}</strong>? {!operation.active&&'As sessões desse perfil serão encerradas.'}</p>}
        {kind==='setHolidayActive'&&<p>{title} <strong>{catalogName}</strong>?</p>}
        {kind==='duplicate'&&<><p>Selecione a entrega principal desta carga. O registro de {shipment?.author} permanecerá no histórico e será contado junto dela.</p>
          <Field label="Entrega principal"><select name="target" required><option value="">Selecione</option>{data.shipments.filter(s=>s.id!==id&&s.supplier===shipment?.supplier&&s.material===shipment?.material&&!s.duplicateOf).map(s=><option key={s.id} value={s.id}>{dateLabel(deliveryDate(s))} · {fmt(s.quantity)} {s.unit} · {s.author}{s.nf?' · NF '+s.nf:''}</option>)}</select></Field></>}
        {kind==='receiptDetails'&&receipt&&<div className="details">
          <p><strong>{data.materials.find(m=>m.id===receipt.material)?.name}</strong> · {receipt.supplier} · {dateLabel(receipt.date)}</p>
          <p>Recebido: {fmt(receipt.quantity)} {receipt.unit} <ArrowRight size={14}/> {fmt(receipt.converted)} {data.materials.find(m=>m.id===receipt.material)?.unit}</p>
          {receipt.operation!=='identity'&&<p>Fator aplicado: {receipt.operation==='divide'?'÷':'×'} {fmt(receipt.factor,8)}</p>}
          <p>Nota fiscal: {receipt.nf||'Sem NF'} · Frete: {receipt.freight||'—'}</p>
          {receipt.invoicedQuantity !== undefined&&<p>Quantidade na NF: {fmt(receipt.invoicedQuantity)} {receipt.unit}</p>}
          <p>Registrado por: {receipt.author}</p>
          <h3>Baixas na programação</h3>
          {receipt.allocations.map(a=>{const entry=data.entries.find(e=>e.id===a.entry);return <p key={a.entry}>{entry?dateLabel(entry.date):'Linha da programação'} · {fmt(a.quantity)} {data.materials.find(m=>m.id===receipt.material)?.unit}{a.close?' · Saldo encerrado':''}</p>;})}
        </div>}
        {error&&<div className="form-error" role="alert">{error}</div>}
      </div>
      <div className="dialog-footer">
        {kind==='entryMonth'&&<output className="planning-total">{canSchedule
          ? <>Total informado<strong>{fmt(plannedTotal)}{chosen ? ' '+chosen.unit : ''}</strong></>
          : 'Selecione o fornecedor e o material para preencher as quantidades'}</output>}
        {kind==='holiday'&&!deleting&&annualHoliday&&<small className="holiday-note">O ano escolhido não afeta a recorrência.</small>}
        <button type="button" className="button" disabled={saving} onClick={onClose}>{readonly?'Fechar':'Cancelar'}</button>
        {!readonly&&<button type="submit" className="button primary" disabled={saving}>{saving ? deleting||permanentDeletion?'Excluindo…':'Salvando…' : submitLabel}</button>}</div>
    </form>
  </dialog>;
}
