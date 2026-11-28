export type Scope = { supplier: string; material: string };
export const PROFILE_ROLES = ['admin','manager','internal','operator','partner'] as const;
export type ProfileRole = typeof PROFILE_ROLES[number];
export type Profile = { email: string; name: string; role: ProfileRole; scopes: Scope[]; active?: boolean };
export const MATERIAL_TYPES = [
  'Cimento','Pedra','Areia','Aditivo','Sílica','Coque','CA-50','CA-60',
  'Desmoldante','Combustível','Madeira','Arruela','Outro'
] as const;
export type MaterialType = typeof MATERIAL_TYPES[number];
export type Material = { id: string; name: string; unit: string; type?: MaterialType };
export type SupplierDetails = { code: string; responsible: string; email: string; contact: string };
export type Entry = Scope & { id: string; date: string; quantity: number; canceled?: boolean; closed?: boolean };
export type Shipment = Scope & { id: string; date: string; arrival: string; quantity: number; unit: string; nf: string; freight?: string; author: string; converted?: number; duplicateOf?: string };
export function deliveryDate(shipment:Shipment) {
  return shipment.arrival || shipment.date;
}
export type Allocation = { entry: string; quantity: number; close: boolean };
export type Receipt = Scope & { id: string; date: string; quantity: number; unit: string; converted: number; factor: number; operation: string; invoicedQuantity?: number; nf: string; freight: string; shipment: string; allocations: Allocation[]; author: string };
export type Conversion = Scope & { unit: string; factor: number; operation: 'divide' | 'multiply' };
export type Holiday = {date:string; description:string; active:boolean; annual?:boolean};
export type Calendar = { holidays: string[]; shifts: number; weekdays?: number; saturdays?: number };
export type Publication = { id: string; month: string; date: string; entries: Entry[]; calendar: Calendar; materials: Material[] };
export const HISTORY_CATEGORIES = ['Programação','Entregas','Recebidos','Cadastros','Perfis de acesso','PDF mensal','Outros'] as const;
export type HistoryCategory = typeof HISTORY_CATEGORIES[number];
export type HistoryRecord = {
  id:string; category:HistoryCategory; date:string; author:string; detail:string; requestId?:string; email?:string;
};
export type Data = {
  materials: Material[]; suppliers: string[]; entries: Entry[]; shipments: Shipment[]; receipts: Receipt[];
  conversions: Conversion[]; profiles: Profile[]; calendars: Record<string,Calendar>; publications: Publication[];
  holidays?: Holiday[];
  supplierDetails?: Record<string,SupplierDetails>;
  history: HistoryRecord[];
};

export function getSupplierDetails(data:Data,name:string) {
  const details = data.supplierDetails;
  return details && Object.hasOwn(details,name) ? details[name] : undefined;
}

export const REGISTERED_UNITS = [
  {value:'kg',label:'Quilograma (kg)'},
  {value:'t',label:'Tonelada (t)'},
  {value:'m³',label:'Metro cúbico (m³)'},
  {value:'un',label:'Unidade (un)'},
  {value:'L',label:'Litro (L)'}
] as const;

const unitAliases = new Map<string, typeof REGISTERED_UNITS[number]['value']>([
  ['kg','kg'], ['quilo','kg'], ['quilos','kg'], ['quilograma','kg'], ['quilogramas','kg'],
  ['t','t'], ['ton','t'], ['tonelada','t'], ['toneladas','t'],
  ['m³','m³'], ['m3','m³'], ['m^3','m³'], ['metro cubico','m³'], ['metros cubico','m³'], ['metros cubicos','m³'],
  ['un','un'], ['unidade','un'], ['unidades','un'],
  ['l','L'], ['litro','L'], ['litros','L']
]);

export function catalogUnit(unit: string) {
  return unitAliases.get(unit.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/g,' '));
}

export function received(data: Data, id: string) {
  return round(data.receipts.flatMap(r => r.allocations).filter(a => a.entry === id).reduce((sum, a) => sum + a.quantity, 0));
}
export function round(value: number) { return Math.round((value + Number.EPSILON) * 1000) / 1000; }
export function isProfileActive(profile: Pick<Profile,'active'>) {
  return profile.active !== false;
}
export function normalizeProfileRole(role:unknown): ProfileRole | undefined {
  if (role === 'supplier' || role === 'carrier') return 'partner';
  return PROFILE_ROLES.find(option=>option===role);
}
type ProfileIdentity = Pick<Profile,'role'> | null | undefined;
export function canManageProfiles(profile: ProfileIdentity) {
  return profile?.role === 'admin';
}
export function hasAdministrationAccess(profile: ProfileIdentity) {
  return canManageProfiles(profile) || profile?.role === 'manager';
}
export function hasPdfAccess(profile: ProfileIdentity) {
  return hasAdministrationAccess(profile) || profile?.role === 'internal';
}
export function hasOperationalAccess(profile: ProfileIdentity) {
  return hasPdfAccess(profile) || profile?.role === 'operator';
}
export function allowed(profile: Profile, item: Scope) {
  return hasOperationalAccess(profile) || profile.scopes.some(s => s.material === item.material && s.supplier === item.supplier);
}
export function calendarDays(month: string) {
  const [year, m] = month.split('-').map(Number);
  return Array.from({length:new Date(Date.UTC(year, m, 0)).getUTCDate()}, (_, i) => {
    const day = i + 1;
    const date = new Date(Date.UTC(year, m - 1, day));
    return {iso: month + '-' + String(day).padStart(2,'0'), day, weekday: date.getUTCDay(),
      label: date.toLocaleDateString('pt-BR',{weekday:'long',timeZone:'UTC'})};
  });
}
export function listHolidays(data:Data):Holiday[] {
  if (data.holidays) return data.holidays;
  const legacyDates = new Set(Object.values(data.calendars).flatMap(calendar=>calendar.holidays));
  return Array.from(legacyDates,date=>({date,description:'Feriado',active:true}));
}
export function getCalendar(data:Data,month:string):Calendar {
  const settings = data.calendars[month] ?? defaultCalendar;
  if (!data.holidays) return settings;
  const holidays = new Set<string>();
  for (const holiday of data.holidays) {
    if (!holiday.active) continue;
    const date = holiday.annual ? `${month.slice(0,4)}-${holiday.date}` : holiday.date;
    if (!date.startsWith(month+'-')) continue;
    const timestamp = Date.parse(date);
    if (Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10) === date) holidays.add(date);
  }
  return {...settings,holidays:[...holidays].sort()};
}
export function isHoliday(data:Data,date:string) {
  return getCalendar(data,date.slice(0,7)).holidays.includes(date);
}
export function workdays(month: string, calendar: Calendar) {
  const days = calendarDays(month).filter(d => !calendar.holidays.includes(d.iso));
  const weekdays = calendar.weekdays ?? days.filter(d => d.weekday > 0 && d.weekday < 6).length;
  const saturdays = calendar.saturdays ?? days.filter(d => d.weekday === 6).length;
  return { weekdays, saturdays, total: weekdays + saturdays / (2 * calendar.shifts) };
}
export const defaultCalendar: Calendar = {holidays: [], shifts: 3};
export const demoProfile: Profile = {email:'planejamento@materiais.demo', name:'Administrador', role:'admin', scopes:[]};
export const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export function monthLabel(month: string) { return months[Number(month.slice(5)) - 1] + ' ' + month.slice(0,4); }
export function fmt(value: number, digits = 3) { return value.toLocaleString('pt-BR',{maximumFractionDigits:digits}); }
export function dateLabel(date: string) { return date.split('-').reverse().join('/'); }
export function currentMonth() { return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo', year:'numeric',month:'2-digit'}).format(new Date()); }
