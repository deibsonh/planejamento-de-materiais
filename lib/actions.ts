import { randomUUID } from 'node:crypto';
import { allowed, catalogUnit, defaultCalendar, getSupplierDetails, isHoliday, MATERIAL_TYPES, dateLabel, received, round, type Data, type Profile, type Scope, type Allocation, type Conversion, type SupplierDetails } from './model';
import { demo, isConfiguredAdmin, UserError } from './server';
type Input = Record<string, unknown>;
const value = (input:Input,key:string) => typeof input[key] === 'string' ? String(input[key]).trim() : '';
function need(condition:unknown, message:string): asserts condition { if (!condition) throw new UserError(message); }
function required(input:Input,key:string,label:string) {
  const text = value(input,key);
  need(text.length > 0 && text.length <= 180, 'Informe ' + label + '.');
  return text;
}
function supplierDetail(input:Input,key:keyof SupplierDetails,label:string,previous?:SupplierDetails) {
  if (!Object.hasOwn(input,key)) return previous?.[key] ?? '';
  const text = value(input,key);
  need(typeof input[key] === 'string' && text.length <= 180, 'Informe ' + label + ' com até 180 caracteres.');
  return text;
}
function number(input:Input,key:string) {
  const source = input[key];
  const n = typeof source === 'number' || typeof source === 'string' ? Number(source) : NaN;
  need(Number.isFinite(n) && n > 0 && n <= 1e10,'Informe uma quantidade ou fator válido.');
  return n;
}
function date(input:Input,key:string) {
  const text = value(input,key);
  const timestamp = Date.parse(text);
  need(/^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10) === text,'Informe uma data válida.');
  return text;
}
function month(input:Input) {
  return date({d:value(input,'month')+'-01'},'d').slice(0,7);
}
function same(a:Scope,b:Scope) { return a.supplier === b.supplier && a.material === b.material; }
function scope(data:Data,input:unknown,profile:Profile): Scope {
  need(input && typeof input === 'object' && !Array.isArray(input),'Selecione um fornecedor e material autorizados.');
  const fields = input as Input;
  const item = {supplier:value(fields,'supplier'),material:value(fields,'material')};
  need(data.suppliers.includes(item.supplier) && data.materials.some(m => m.id === item.material) && allowed(profile,item),'Selecione um fornecedor e material autorizados.');
  return item;
}
function sameUnit(first:string,second:string) {
  return (catalogUnit(first) ?? first) === (catalogUnit(second) ?? second);
}
function registeredUnit(input:Input,previous?:string) {
  const unit = required(input,'unit','a unidade');
  const canonical = catalogUnit(unit);
  need(canonical || unit === previous,'Selecione uma unidade da lista.');
  return previous && sameUnit(unit,previous) ? previous : canonical ?? unit;
}
function usedInOperations(data:Data,field:keyof Scope,key:string) {
  return data.entries.some(item=>item[field]===key) || data.shipments.some(item=>item[field]===key) || data.receipts.some(item=>item[field]===key);
}
function hasCatalogLinks(data:Data,field:keyof Scope,key:string) {
  return usedInOperations(data,field,key) || data.conversions.some(item=>item[field]===key) ||
    data.profiles.some(profile=>profile.scopes.some(item=>item[field]===key));
}
function renameReferences(data:Data,field:keyof Scope,previous:string,next:string) {
  if (previous === next) return;
  const rename = <T extends Scope>(items:T[]) => items.map(item=>item[field]===previous ? {...item,[field]:next} : item);
  data.entries = rename(data.entries);
  data.shipments = rename(data.shipments);
  data.receipts = rename(data.receipts);
  data.conversions = rename(data.conversions);
  data.profiles = data.profiles.map(profile=>({...profile,scopes:rename(profile.scopes)}));
}
function describeConversion(conversion:Conversion) {
  const {material,supplier,unit,operation,factor} = conversion;
  return `${material} / ${supplier} · ${unit} ${operation==='divide' ? '÷' : '×'} ${factor}`;
}
export function apply(data:Data,profile:Profile,input:Input) {
  need(input && typeof input === 'object' && !Array.isArray(input),'Dados de registro inválidos.');
  const action = value(input,'action');
  const requestId = value(input,'requestId');
  if (requestId && data.history.some(h=>h.requestId===requestId && h.email===profile.email)) return;
  const id = randomUUID();
  const author = profile.name;
  let log = '';
  need(profile.role === 'internal' || action === 'shipment','Seu perfil não pode realizar essa operação.');
  switch (action) {
    case 'entry': {
      const item = scope(data,input,profile);
      const previous = data.entries.find(e => e.id === value(input,'id'));
      need(!value(input,'id') || previous,'Linha da programação não encontrada.');
      need(!previous?.canceled && !previous?.closed,'Linha encerrada ou cancelada.');
      const quantity = round(number(input,'quantity'));
      need(quantity > 0,'Informe uma quantidade de pelo menos 0,001.');
      const plannedDate = date(input,'date');
      const retainsDelivery = previous?.date===plannedDate && same(previous,item);
      need(retainsDelivery || !isHoliday(data,plannedDate),`Não é possível programar entregas no feriado de ${dateLabel(plannedDate)}.`);
      if (previous) {
        const actual = received(data,previous.id);
        need(!actual || (same(previous,item) && quantity >= actual),'A programação deve preservar as baixas já registradas.');
        log = `Alterou ${previous.material} / ${previous.supplier}: ${previous.date} · ${previous.quantity} → ${item.material} / ${item.supplier}: ${plannedDate} · ${quantity}`;
        Object.assign(previous,{...item,date:plannedDate,quantity});
      } else {
        data.entries.push({...item,id,date:plannedDate,quantity});
        log = `Incluiu ${item.material} / ${item.supplier}: ${plannedDate} · ${quantity}`;
      }
      break;
    }
    case 'entryMonth': {
      const item = scope(data,input,profile);
      const selected = month(input);
      need(Array.isArray(input.days) && input.days.length > 0 && input.days.length <= 31,'Informe as quantidades dos dias do mês.');
      const seen = new Set<string>();
      const entries = input.days.map((day:unknown)=>{
        need(day && typeof day === 'object' && !Array.isArray(day),'Informe um dia válido.');
        const fields = day as Input;
        const plannedDate = date(fields,'date');
        need(plannedDate.startsWith(selected+'-') && !seen.has(plannedDate),'Use dias distintos do mês selecionado.');
        need(!isHoliday(data,plannedDate),`Não é possível programar entregas no feriado de ${dateLabel(plannedDate)}.`);
        seen.add(plannedDate);
        const quantity = round(number(fields,'quantity'));
        need(quantity > 0,'Informe uma quantidade de pelo menos 0,001.');
        return {...item,id:randomUUID(),date:plannedDate,quantity};
      });
      data.entries.push(...entries);
      log = `Incluiu programação de ${item.material} / ${item.supplier} em ${selected} · ${entries.length} dia(s)`;
      break;
    }
    case 'cancel': {
      const entry = data.entries.find(e => e.id === value(input,'id'));
      need(entry && !entry.canceled && !entry.closed && received(data,entry.id) < entry.quantity,'Linha indisponível para cancelamento.');
      entry.canceled = true;
      log = `Cancelou ${entry.material} / ${entry.supplier}: ${entry.date} · ${entry.quantity}`;
      break;
    }
    case 'shipment': {
      const item = scope(data,input,profile);
      const shipment = {...item,id,date:date(input,'date'),arrival:value(input,'arrival') ? date(input,'arrival') : '',
        quantity:number(input,'quantity'),unit:required(input,'unit','a unidade'),nf:value(input,'nf'),author};
      const orderUnit = data.materials.find(m => m.id === item.material)!.unit;
      const conversion = shipment.unit === orderUnit ? undefined : data.conversions.find(c=>same(c,item) && c.unit===shipment.unit);
      need(shipment.unit === orderUnit || conversion,'Unidade sem conversão cadastrada.');
      const converted = round(!conversion ? shipment.quantity : conversion.operation==='divide' ? shipment.quantity/conversion.factor : shipment.quantity*conversion.factor);
      need(Number.isFinite(converted) && converted > 0 && converted <= 1e10,'A quantidade convertida precisa ser válida.');
      need(!shipment.arrival || shipment.arrival >= shipment.date,'A previsão de chegada deve ser igual ou posterior ao envio.');
      data.shipments.push({...shipment,converted});
      log = `Registrou envio de ${shipment.quantity} ${shipment.unit} · ${item.supplier} · ${shipment.date}`;
      break;
    }
    case 'duplicate': {
      const source = data.shipments.find(s => s.id === value(input,'id'));
      const target = data.shipments.find(s => s.id === value(input,'target'));
      need(source && target && source !== target && same(source,target) && !source.duplicateOf && !target.duplicateOf,'Escolha dois registros de envio do mesmo fornecedor e material.');
      need(!data.shipments.some(s => s.duplicateOf === source.id) && !data.receipts.some(r => r.shipment === source.id),'Este envio já possui um vínculo. Selecione-o como o registro principal.');
      source.duplicateOf = target.id;
      log = `Vinculou os envios de ${source.author} e ${target.author} · ${source.supplier}`;
      break;
    }
    case 'receipt': {
      const item = scope(data,input,profile);
      const material = data.materials.find(m => m.id === item.material)!;
      const unit = required(input,'unit','a unidade');
      const conversion = unit === material.unit ? undefined : data.conversions.find(c => same(c,item) && c.unit === unit);
      need(unit === material.unit || conversion,'Cadastre a conversão para esta unidade antes de lançar a baixa.');
      const quantity = number(input,'quantity');
      const converted = round(!conversion ? quantity : conversion.operation === 'divide' ? quantity / conversion.factor : quantity * conversion.factor);
      need(Number.isFinite(converted) && converted > 0 && converted <= 1e10,'A quantidade convertida precisa ser válida.');
      const shipment = value(input,'shipment');
      need(!shipment || data.shipments.some(s => s.id === shipment && same(s,item) && !s.duplicateOf),'Envio inválido para esse recebimento.');
      need(Array.isArray(input.allocations) && input.allocations.length > 0,'Escolha pelo menos uma linha para baixar.');
      const seen = new Set<string>();
      const allocations:Allocation[] = input.allocations.map((allocation:Input) => {
        need(allocation && typeof allocation === 'object','Informe uma baixa válida.');
        const entry = data.entries.find(e => e.id === value(allocation,'entry'));
        need(entry && same(entry,item) && !entry.canceled && !entry.closed && received(data,entry.id) < entry.quantity && !seen.has(entry.id),'Selecione linhas distintas com saldo pendente para este fornecedor e material.');
        seen.add(entry.id);
        const amount = round(number(allocation,'quantity'));
        need(amount > 0,'Informe uma baixa de pelo menos 0,001.');
        const close = allocation.close === true;
        if (close) entry.closed = true;
        return {entry:entry.id,quantity:amount,close};
      });
      const allocated = round(allocations.reduce((sum,a)=>sum+a.quantity,0));
      need(allocated === converted,'Distribua toda a quantidade recebida entre as linhas selecionadas.');
      const invoicedQuantity = input.invoicedQuantity === undefined ? undefined : number(input,'invoicedQuantity');
      need(invoicedQuantity === undefined || value(input,'nf'),'Informe a nota fiscal para registrar a quantidade faturada.');
      const receipt = {...item,id,date:date(input,'date'),quantity,invoicedQuantity,unit,converted,factor:conversion?.factor || 1,
        operation:conversion?.operation || 'identity',nf:value(input,'nf'),freight:value(input,'freight'),shipment,allocations,author};
      data.receipts.push(receipt);
      log = `Registrou recebimento de ${converted} ${material.unit} · ${item.supplier} · ${receipt.date}`;
      break;
    }
    case 'material': {
      const key = value(input,'id');
      const previous = data.materials.find(m=>m.id===key);
      need(!key || previous,'Material não encontrado.');
      const code = required(input,'code','o código');
      need(!data.materials.some(m=>m.id===code && m!==previous),'Já existe um material com esse código.');
      const name = required(input,'name','o material');
      const unit = registeredUnit(input,previous?.unit);
      const requestedType = value(input,'type');
      const selectedType = MATERIAL_TYPES.find(type=>type===requestedType);
      need(input.type === undefined || input.type === '' || selectedType,'Selecione um tipo de material válido.');
      const type = selectedType ?? previous?.type;
      const material = {id:code,name,unit,type};
      const description = `${code} · ${name} (${unit})${type ? ' · '+type : ''}`;
      if (previous) {
        if (!sameUnit(previous.unit,unit)) {
          need(!usedInOperations(data,'material',key),'A unidade deste material está vinculada a quantidades registradas na programação, em envios ou em recebimentos.');
          need(!data.conversions.some(c=>c.material===key),'Exclua as conversões vinculadas antes de alterar a unidade do material.');
        }
        renameReferences(data,'material',key,code);
        data.materials = data.materials.map(m=>m===previous ? material : m);
        log = `Alterou material ${previous.id} · ${previous.name} (${previous.unit})${previous.type ? ' · '+previous.type : ''} → ${description}`;
      } else {
        data.materials = [...data.materials,material];
        log = `Cadastrou material ${description}`;
      }
      break;
    }
    case 'deleteMaterial': {
      const key = value(input,'id');
      const material = data.materials.find(m=>m.id===key);
      need(material,'Material não encontrado.');
      need(!hasCatalogLinks(data,'material',key),'Este material está vinculado à programação, a envios, recebimentos, conversões ou perfis de acesso.');
      data.materials = data.materials.filter(m=>m!==material);
      log = `Excluiu material ${material.id} · ${material.name}`;
      break;
    }
    case 'supplier': {
      const key = value(input,'id');
      need(!key || data.suppliers.includes(key),'Fornecedor não encontrado.');
      const name = required(input,'name','o fornecedor');
      need(!data.suppliers.some(s=>s!==key && s.toLowerCase()===name.toLowerCase()),'Fornecedor já cadastrado.');
      const previous = getSupplierDetails(data,key);
      const details:SupplierDetails = {
        code:supplierDetail(input,'code','o código',previous),
        responsible:supplierDetail(input,'responsible','o nome do responsável',previous),
        email:supplierDetail(input,'email','o e-mail',previous),
        contact:supplierDetail(input,'contact','o contato',previous)
      };
      const code = details.code.toLowerCase();
      need(!code || !data.suppliers.some(s=>s!==key && getSupplierDetails(data,s)?.code.toLowerCase()===code),'Já existe um fornecedor com esse código.');
      need(!details.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email),'Informe um e-mail válido.');
      if (key) {
        renameReferences(data,'supplier',key,name);
        data.suppliers = data.suppliers.map(s=>s===key ? name : s);
        log = `Alterou fornecedor ${key} → ${name}`;
      } else {
        data.suppliers.push(name);
        log = 'Cadastrou fornecedor ' + name;
      }
      data.supplierDetails = {...data.supplierDetails,[name]:details};
      if (key && key!==name) delete data.supplierDetails[key];
      break;
    }
    case 'deleteSupplier': {
      const key = value(input,'id');
      need(data.suppliers.includes(key),'Fornecedor não encontrado.');
      need(!hasCatalogLinks(data,'supplier',key),'Este fornecedor está vinculado à programação, a envios, recebimentos, conversões ou perfis de acesso.');
      data.suppliers = data.suppliers.filter(s=>s!==key);
      if (data.supplierDetails) delete data.supplierDetails[key];
      log = 'Excluiu fornecedor ' + key;
      break;
    }
    case 'conversion': {
      const item = scope(data,input,profile);
      const original = {supplier:value(input,'previousSupplier'),material:value(input,'previousMaterial')};
      const previous = data.conversions.find(c=>same(c,original));
      need(!(original.supplier || original.material) || previous,'Conversão não encontrada.');
      need(!data.conversions.some(c=>c!==previous && same(c,item)),'Já existe uma conversão para este fornecedor e material.');
      const operation = value(input,'operation');
      need(operation === 'divide' || operation === 'multiply','Selecione a operação.');
      const unit = registeredUnit(input,previous?.unit);
      const orderUnit = data.materials.find(m=>m.id===item.material)!.unit;
      const keepingLegacyUnit = previous && same(previous,item) && previous.unit===unit && unit!==orderUnit;
      need(!sameUnit(unit,orderUnit) || keepingLegacyUnit,'Escolha uma unidade diferente da unidade programada.');
      const conversion:Conversion = {...item,unit,operation,factor:number(input,'factor')};
      if (previous) {
        data.conversions = data.conversions.map(c=>c===previous ? conversion : c);
        log = `Alterou conversão de ${describeConversion(previous)} → ${describeConversion(conversion)}`;
      } else {
        data.conversions.push(conversion);
        log = `Cadastrou conversão de ${describeConversion(conversion)}`;
      }
      break;
    }
    case 'deleteConversion': {
      const item = {supplier:value(input,'supplier'),material:value(input,'material')};
      const conversion = data.conversions.find(c=>same(c,item));
      need(conversion,'Conversão não encontrada.');
      data.conversions = data.conversions.filter(c=>c!==conversion);
      log = `Excluiu conversão de ${describeConversion(conversion)}`;
      break;
    }
    case 'profile': {
      const key = value(input,'id').toLowerCase();
      const previous = key ? data.profiles.find(p=>p.email.toLowerCase()===key) : undefined;
      need(!key || previous,'Perfil de acesso não encontrado.');
      const email = required(input,'email','o e-mail').toLowerCase();
      need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Informe um e-mail válido.');
      need(!data.profiles.some(p=>p!==previous && p.email.toLowerCase()===email),'Já existe um perfil com esse e-mail.');
      need(demo || email===key || !isConfiguredAdmin(email),'Este e-mail pertence a um administrador configurado no ambiente. Informe outro e-mail.');
      const role = value(input,'role');
      need(role === 'supplier' || role === 'carrier' || role === 'internal','Selecione um tipo de acesso.');
      const scopes = role !== 'internal' && Array.isArray(input.scopes) ? input.scopes.map(item=>scope(data,item,profile)) : [];
      need(role === 'internal' || scopes.length,'Selecione pelo menos uma combinação de fornecedor e material.');
      const name = required(input,'name','o nome do perfil');
      const updated:Profile = {email,name,role,scopes};
      if (previous) {
        data.profiles = data.profiles.map(p=>p===previous ? updated : p);
        log = key === email ? `Alterou acesso de ${email}` : `Alterou acesso de ${previous.email} para ${email}`;
      } else {
        data.profiles.push(updated);
        log = `Cadastrou acesso de ${email}`;
      }
      break;
    }
    case 'resetPassword': {
      const email = value(input,'id').toLowerCase();
      need(!isConfiguredAdmin(email) && data.profiles.some(p=>p.email===email),'Perfil indisponível para redefinição.');
      log = 'Redefiniu a senha de ' + email;
      break;
    }
    case 'revoke': {
      const email = value(input,'email');
      need(email !== profile.email && (demo || !isConfiguredAdmin(email)) && data.profiles.some(p=>p.email===email),'Perfil indisponível para revogação.');
      data.profiles = data.profiles.filter(p=>p.email!==email);
      log = 'Revogou acesso de ' + email;
      break;
    }
    case 'calendar': {
      const selected = month(input);
      const shifts = number(input,'shifts');
      need(Number.isInteger(shifts) && shifts <= 24,'Informe um número inteiro de turnos entre 1 e 24.');
      const holidays = [...new Set(value(input,'holidays').split(/[\s,;]+/).filter(Boolean).map(d=>date({d},'d')))].sort();
      need(holidays.every(h=>h.startsWith(selected+'-')),'Informe apenas feriados do mês selecionado.');
      const count = (key:string,max:number) => {
        const raw = value(input,key);
        if (!raw) return undefined;
        const n = Number(raw);
        need(Number.isInteger(n) && n>=0 && n<=max,'Informe uma quantidade válida de dias do mês.');
        return n;
      };
      data.calendars[selected] = {holidays,shifts,weekdays:count('weekdays',23),saturdays:count('saturdays',5)};
      log = 'Atualizou calendário de ' + selected;
      break;
    }
    case 'publish': {
      const selected = month(input);
      data.publications.push({id,month:selected,date:new Date().toISOString(),
        entries:data.entries.filter(e=>!e.canceled && e.date.startsWith(selected+'-')),
        calendar:data.calendars[selected] || defaultCalendar,materials:data.materials});
      log = 'Publicou programação de ' + selected;
      break;
    }
    default: throw new UserError('Operação inválida.');
  }
  data.history.unshift({date:new Date().toISOString(),author,detail:log,requestId,email:profile.email});
}
