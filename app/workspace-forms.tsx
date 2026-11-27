'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Plus, Trash2, X } from 'lucide-react';
import { allowed, catalogUnit, dateLabel, defaultCalendar, fmt, getSupplierDetails, monthLabel, received, REGISTERED_UNITS, round, type Data, type Profile, type Scope } from '@/lib/model';

const titles = {
  entry:'Nova programação', receipt:'Registrar recebimento', shipment:'Registrar envio', cancel:'Cancelar programação',
  material:'Novo material', supplier:'Novo fornecedor', conversion:'Cadastrar conversão', profile:'Configurar perfil',
  calendar:'Calendário do mês', publish:'Salvar versão da programação', duplicate:'Vincular envios',
  receiptDetails:'Detalhes do recebimento', revoke:'Revogar acesso', resetPassword:'Redefinir senha'
};
const catalogOperations = {
  material:{editTitle:'Editar material',deleteTitle:'Excluir material',deleteAction:'deleteMaterial',subject:'o material'},
  supplier:{editTitle:'Editar fornecedor',deleteTitle:'Excluir fornecedor',deleteAction:'deleteSupplier',subject:'o fornecedor'},
  conversion:{editTitle:'Editar conversão',deleteTitle:'Excluir conversão',deleteAction:'deleteConversion',subject:'a conversão'}
};
export type Operation = {kind:keyof typeof titles;id?:string;scope?:Scope;remove?:boolean};
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
function Field({label,children,wide=false}:{label:string;children:ReactNode;wide?:boolean}) {
  return <label className={wide?'wide':''}>{label}{children}</label>;
}
function Input({name,type='text',placeholder,initial,optional=false}:{name:string;type?:string;placeholder?:string;initial?:string|number;optional?:boolean}) {
  return <input name={name} type={type} placeholder={placeholder} defaultValue={initial} required={!optional} maxLength={180} autoComplete="off"/>;
}
function Quantity({name='quantity',initial,placeholder='0,000'}:{name?:string;initial?:number;placeholder?:string}) {
  return <input name={name} inputMode="decimal" defaultValue={initial?.toLocaleString('pt-BR',{useGrouping:false,maximumSignificantDigits:21}) ?? ''} placeholder={placeholder} required/>;
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
  const catalog = kind==='material'||kind==='supplier'||kind==='conversion' ? catalogOperations[kind] : undefined;
  const deleting = Boolean(catalog && operation.remove);
  const initial = data.entries.find(e=>e.id===id);
  const shipment = data.shipments.find(e=>e.id===id);
  const receipt = data.receipts.find(e=>e.id===id);
  const existingProfile = data.profiles.find(e=>e.email===id);
  const existingMaterial = kind==='material' ? data.materials.find(m=>m.id===id) : undefined;
  const existingSupplier = kind==='supplier' && id ? getSupplierDetails(data,id) : undefined;
  const existingConversion = kind==='conversion' && previousScope ? data.conversions.find(c=>c.supplier===previousScope.supplier&&c.material===previousScope.material) : undefined;
  const initialScope = kind==='conversion' ? previousScope : initial;
  const calendar = data.calendars[month] || defaultCalendar;
  const [supplier,setSupplier] = useState(initialScope?.supplier || '');
  const [material,setMaterial] = useState(initialScope?.material || '');
  const [unit,setUnit] = useState('');
  const [quantity,setQuantity] = useState('');
  const [nf,setNf] = useState('');
  const [role,setRole] = useState(existingProfile?.role || 'supplier');
  const [scopes,setScopes] = useState<Scope[]>(existingProfile?.scopes.length?existingProfile.scopes:[{supplier:'',material:''}]);
  const [allocations,setAllocations] = useState([{entry:initial?.id || '',amount:'',close:false}]);
  const [error,setError] = useState('');
  const [saving,setSaving] = useState(false);
  const requestId = useRef('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  const chosen = data.materials.find(m=>m.id===material);
  const conversion = data.conversions.find(c=>c.supplier===supplier && c.material===material);
  const actualUnit = unit || chosen?.unit || '';
  const factor = actualUnit === chosen?.unit ? undefined : conversion;
  const amount = parseQuantity(quantity);
  const convert = round(!factor ? amount : factor.operation==='divide' ? amount/factor.factor : amount*factor.factor);
  const distributed = round(allocations.reduce((sum,a)=>sum+(parseQuantity(a.amount)||0),0));
  const available = data.entries.filter(e=>e.supplier===supplier && e.material===material && !e.canceled && !e.closed && received(data,e.id)<e.quantity).sort((a,b)=>a.date.localeCompare(b.date));
  const shipmentOptions = data.shipments.filter(s=>s.supplier===supplier&&s.material===material&&!s.duplicateOf);
  const kindsWithScope = ['receipt','entry','shipment','conversion'];
  const scoped = !deleting && kindsWithScope.includes(kind);
  const title = catalog && deleting ? catalog.deleteTitle : catalog && (id || previousScope) ? catalog.editTitle : kind==='entry'&&initial ? 'Editar programação' : kind==='profile'&&existingProfile ? 'Editar perfil' : titles[kind];
  const catalogName = kind==='material' && existingMaterial ? `${existingMaterial.name} (${existingMaterial.id})` :
    kind==='supplier' ? id : previousScope && `${previousScope.supplier} / ${data.materials.find(m=>m.id===previousScope.material)?.name ?? previousScope.material}`;
  const readonly = kind==='receiptDetails';
  const unitOptions = [...new Set([chosen?.unit || '',conversion?.unit || ''].filter(Boolean))];
  const updateAllocation = (index:number, update:Partial<typeof allocations[number]>)=>setAllocations(rows=>rows.map((r,i)=>i===index?{...r,...update}:r));
  function changeScope(nextSupplier:string,nextMaterial:string) {
    setSupplier(nextSupplier);
    setMaterial(nextMaterial);
    setUnit('');
    if(kind==='receipt')setAllocations([{entry:'',amount:'',close:false}]);
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
    if (kind==='conversion' && !deleting) {
      input.factor = parseQuantity(String(form.factor));
      if (previousScope) Object.assign(input,{previousSupplier:previousScope.supplier,previousMaterial:previousScope.material});
    }
    if (kind==='conversion' && deleting) Object.assign(input,previousScope);
    if (kind==='shipment'||kind==='receipt') Object.assign(input,{unit:actualUnit,quantity:amount});
    if (kind==='receipt') {
      input.allocations = allocations.map(a=>({entry:a.entry,quantity:parseQuantity(a.amount),close:a.close}));
      if (form.invoicedQuantity && String(form.invoicedQuantity).trim()) input.invoicedQuantity = parseQuantity(String(form.invoicedQuantity));
      else delete input.invoicedQuantity;
    }
    if (kind==='revoke') input.email = id;
    if (kind==='profile') Object.assign(input,{role,scopes:role==='internal'?[]:scopes});
    setSaving(true);
    try {await onSave(input);onClose();}
    catch(error){setError(error instanceof Error ? error.message:'Não foi possível salvar.');}
    finally{setSaving(false);}
  }
  return <dialog ref={dialog} className="dialog" aria-labelledby="operation-title" onCancel={e=>{e.preventDefault();if(!saving)onClose();}} onClick={e=>{if(e.target===dialog.current&&!saving)onClose();}}>
    <form className="dialog-content" onSubmit={submit}>
      <div className="dialog-head"><h2 id="operation-title">{title}</h2><button type="button" className="icon-button" aria-label="Fechar" disabled={saving} onClick={onClose}><X size={20}/></button></div>
      <div className="form-content">
        {scoped && <div className="form-grid">
          <Field label="Fornecedor"><select value={supplier} required onChange={e=>changeScope(e.target.value,'')}><option value="">Selecione</option>{data.suppliers.filter(s=>profile.role==='internal'||profile.scopes.some(p=>p.supplier===s)).map(s=><option key={s}>{s}</option>)}</select></Field>
          <Field label="Material"><select value={material} required onChange={e=>changeScope(supplier,e.target.value)}><option value="">Selecione</option>{data.materials.filter(m=>allowed(profile,{supplier,material:m.id})).map(m=><option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}</select></Field>
        </div>}
        {kind==='entry'&&<div className="form-grid"><Field label="Data prevista"><Input name="date" type="date" initial={initial?.date || month+'-01'}/></Field><Field label={chosen?'Quantidade programada ('+chosen.unit+')':'Quantidade programada'}><Quantity initial={initial?.quantity}/></Field></div>}
        {(kind==='receipt'||kind==='shipment')&&<>
          <div className="form-grid">
            <Field label={kind==='receipt'?'Data real do recebimento':'Data de expedição'}><Input name="date" type="date" initial={today()}/></Field>
            {kind==='shipment'&&<Field label="Previsão de chegada"><Input name="arrival" type="date" optional/></Field>}
            <Field label={kind==='receipt'?'Quantidade recebida':'Quantidade enviada'}><input value={quantity} onChange={e=>setQuantity(e.target.value)} inputMode="decimal" placeholder="0,000" required/></Field>
            <Field label="Unidade"><select value={actualUnit} onChange={e=>setUnit(e.target.value)} required><option value="">Selecione</option>{unitOptions.map(u=><option key={u}>{u}</option>)}</select></Field>
            <Field label="Nota fiscal"><input name="nf" value={nf} onChange={e=>setNf(e.target.value)} maxLength={180} placeholder="Opcional"/></Field>
            {kind==='receipt'&&<><Field label="Número do frete"><Input name="freight" optional placeholder="Opcional"/></Field>
              {nf.trim()&&<Field label={actualUnit?'Quantidade na NF ('+actualUnit+')':'Quantidade na NF'}><input name="invoicedQuantity" inputMode="decimal" placeholder="Opcional"/></Field>}
              <Field label="Envio correspondente" wide><select name="shipment"><option value="">Sem vínculo com um envio</option>{shipmentOptions.map(s=><option key={s.id} value={s.id}>{dateLabel(s.date)} · {fmt(s.quantity)} {s.unit} · {s.nf?'NF '+s.nf:s.author}</option>)}</select></Field></>}
          </div>
          {kind==='receipt'&& <div className="allocation">
            <div className="allocation-title"><div><h3>Baixas na programação</h3><p>Selecione as linhas e distribua a quantidade recebida.</p></div></div>
            <div className="conversion-summary"><span>Total para baixar <strong>{convert>0?fmt(convert):'0'} {chosen?.unit}</strong></span>{factor&&<span>Fator aplicado <strong>{factor.operation==='divide'?'÷':'×'} {fmt(factor.factor,8)}</strong></span>}<span>Distribuído <strong>{fmt(distributed)} {chosen?.unit}</strong></span></div>
            {allocations.map((a,i)=>{
              const entry=available.find(e=>e.id===a.entry);
              const balance=entry?round(entry.quantity-received(data,entry.id)):0;
              const difference=round(balance-parseQuantity(a.amount));
              return <div className="allocation-row" key={i}><div className="form-grid allocation-grid">
                <Field label="Linha da programação"><select required value={a.entry} onChange={e=>updateAllocation(i,{entry:e.target.value,close:false})}><option value="">Selecione</option>{available.filter(e=>e.id===a.entry||!allocations.some(other=>other.entry===e.id)).map(e=><option key={e.id} value={e.id}>{dateLabel(e.date)} · Saldo {fmt(e.quantity-received(data,e.id))} {chosen?.unit}</option>)}</select></Field>
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
          <Field label="Código"><Input name="code" placeholder="20.014" initial={existingMaterial?.id}/></Field>
          <Field label="Unidade"><CatalogUnitSelect initial={existingMaterial?.unit}/></Field>
          <Field label="Nome do material" wide><Input name="name" placeholder="Areia média" initial={existingMaterial?.name}/></Field>
        </div>}
        {kind==='supplier'&&!deleting&&<div className="form-grid">
          <Field label="Código"><Input name="code" initial={existingSupplier?.code} optional/></Field>
          <Field label="Nome do fornecedor"><Input name="name" initial={id}/></Field>
          <Field label="Nome do responsável" wide><Input name="responsible" initial={existingSupplier?.responsible} optional/></Field>
          <Field label="E-mail"><Input name="email" type="email" initial={existingSupplier?.email} optional/></Field>
          <Field label="Contato"><Input name="contact" type="tel" initial={existingSupplier?.contact} optional/></Field>
        </div>}
        {kind==='conversion'&&!deleting&&<div className="form-grid">
          <Field label="Unidade do fornecedor"><CatalogUnitSelect initial={existingConversion?.unit}/></Field>
          <Field label="Fator"><Quantity name="factor" placeholder="1,56" initial={existingConversion?.factor}/></Field>
          <Field label="Operação aplicada à quantidade" wide><select name="operation" defaultValue={existingConversion?.operation}><option value="divide">Divisão</option><option value="multiply">Multiplicação</option></select></Field>
        </div>}
        {deleting&&catalog&&<p>Excluir {catalog.subject} <strong>{catalogName}</strong>?</p>}
        {kind==='profile'&&<>
          <div className="form-grid">
            <Field label="Nome do perfil"><Input name="name" initial={existingProfile?.name}/></Field>
            <Field label="Tipo de acesso"><select value={role} onChange={e=>setRole(e.target.value as Profile['role'])}><option value="supplier">Fornecedor</option><option value="carrier">Transportadora</option><option value="internal">Equipe interna</option></select></Field>
            <Field label="E-mail autorizado" wide><Input name="email" type="email" initial={existingProfile?.email} placeholder="contato@empresa.com.br"/></Field>
            {!demo&&!existingProfile&&<Field label="Senha temporária" wide><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></Field>}
          </div>
          {role!=='internal'&&<div className="allocation"><div className="allocation-title"><div><h3>Permissões</h3><p>Informe os materiais de cada fornecedor que o perfil pode acessar.</p></div></div>
            {scopes.map((s,i)=><div key={i} className="form-grid allocation-grid">
              <Field label="Fornecedor"><select required value={s.supplier} onChange={e=>setScopes(scopes.map((other,j)=>j===i?{...other,supplier:e.target.value}:other))}><option value="">Selecione</option>{data.suppliers.map(s=><option key={s}>{s}</option>)}</select></Field>
              <Field label="Material"><select required value={s.material} onChange={e=>setScopes(scopes.map((other,j)=>j===i?{...other,material:e.target.value}:other))}><option value="">Selecione</option>{data.materials.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
              {scopes.length>1&&<button type="button" className="icon-button danger" aria-label="Remover permissão" onClick={()=>setScopes(scopes.filter((_,j)=>i!==j))}><Trash2 size={17}/></button>}
            </div>)}
            <button type="button" className="text-button" onClick={()=>setScopes([...scopes,{supplier:role==='supplier'?scopes[0].supplier:'',material:''}])}><Plus size={15}/> Adicionar permissão</button>
          </div>}
        </>}
        {kind==='calendar'&&<div className="form-grid">
          <Field label="Turnos"><Input name="shifts" type="number" initial={calendar.shifts}/></Field>
          <Field label="Dias de segunda a sexta"><Input name="weekdays" type="number" initial={calendar.weekdays} optional placeholder="Calcular automaticamente"/></Field>
          <Field label="Sábados"><Input name="saturdays" type="number" initial={calendar.saturdays} optional placeholder="Calcular automaticamente"/></Field>
          <Field label="Feriados do mês" wide><textarea name="holidays" defaultValue={calendar.holidays.join('\n')} placeholder={month+'-01'} rows={5}/></Field>
          <p className="info wide">Use o formato AAAA-MM-DD, uma data por linha.</p>
        </div>}
        {kind==='cancel'&&<p>Cancelar a programação de {initial?.supplier} em {initial?dateLabel(initial.date):''}? O registro ficará disponível no histórico.</p>}
        {kind==='publish'&&<p>Salvar uma versão de {monthLabel(month)} para divulgação? Ela preservará as quantidades, os materiais e o calendário atuais.</p>}
        {kind==='resetPassword'&&<>
          <p>Defina uma senha temporária para {existingProfile?.email}. A pessoa precisará trocá-la no próximo acesso.</p>
          <Field label="Nova senha temporária"><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></Field>
        </>}
        {kind==='revoke'&&<p>Revogar o acesso de {existingProfile?.name}? O histórico dos lançamentos continuará disponível.</p>}
        {kind==='duplicate'&&<><p>Selecione o envio principal desta carga. O registro de {shipment?.author} permanecerá no histórico e será contado junto dele.</p>
          <Field label="Envio principal"><select name="target" required><option value="">Selecione</option>{data.shipments.filter(s=>s.id!==id&&s.supplier===shipment?.supplier&&s.material===shipment?.material&&!s.duplicateOf).map(s=><option key={s.id} value={s.id}>{dateLabel(s.date)} · {fmt(s.quantity)} {s.unit} · {s.author}{s.nf?' · NF '+s.nf:''}</option>)}</select></Field></>}
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
      <div className="dialog-footer"><button type="button" className="button" disabled={saving} onClick={onClose}>{readonly?'Fechar':'Voltar'}</button>
        {!readonly&&<button type="submit" className="button primary" disabled={saving}>{deleting ? saving?'Excluindo…':'Confirmar exclusão' : saving?'Salvando…':kind==='cancel'?'Cancelar programação':kind==='revoke'?'Revogar acesso':'Salvar registro'}</button>}</div>
    </form>
  </dialog>;
}
