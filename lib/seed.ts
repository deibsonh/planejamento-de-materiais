import { type Data, type Entry } from './model';
export const demoMonth = '2026-12';
export function initialData(demo: boolean): Data {
  const data: Data = {
    materials:[{id:'52.301',name:'Cimento granel',type:'Cimento',unit:'kg'},{id:'22.829',name:'Brita 0',type:'Pedra',unit:'kg'},
      {id:'21.275',name:'Brita 1',type:'Pedra',unit:'kg'},{id:'56.157',name:'Areia fina',type:'Areia',unit:'m³'},
      {id:'20.014',name:'Areia média',type:'Areia',unit:'m³'},{id:'99.012',name:'Carvão coque',type:'Coque',unit:'kg'}],
    suppliers:['CSN','Said','Carrascoza','CRS','Itaporanga','Belluno'],
    entries:[], shipments:[], receipts:[], conversions:[], profiles:[], calendars:{}, publications:[], history:[]
  };
  if (!demo) return {...data, materials:[], suppliers:[]};
  const rows: [string, string, number, number][] = [
    ['20.014','Itaporanga',1,30], ['22.829','Said',1,45000], ['56.157','CRS',2,60], ['52.301','CSN',2,50000],
    ['21.275','Carrascoza',7,90000], ['20.014','Itaporanga',7,30], ['99.012','Belluno',8,30000], ['22.829','Said',9,45000],
    ['52.301','CSN',10,50000], ['56.157','CRS',11,90], ['20.014','Itaporanga',14,24], ['21.275','Carrascoza',15,90000],
    ['22.829','Said',16,90000], ['52.301','CSN',17,50000], ['99.012','Belluno',18,30000], ['20.014','Itaporanga',21,24],
    ['56.157','CRS',22,60], ['21.275','Carrascoza',29,135000]
  ];
  data.entries = rows.map(([material,supplier,day,quantity], i): Entry => ({id:'sample-' + i, material,supplier,date:demoMonth+'-'+String(day).padStart(2,'0'),quantity}));
  data.conversions = [{material:'20.014',supplier:'Itaporanga',unit:'t',factor:1.56,operation:'divide'}];
  data.shipments = [
    {id:'sample-shipment',material:'20.014',supplier:'Itaporanga',quantity:45.79,unit:'t',converted:29.353,date:'2026-12-01',arrival:'2026-12-01',nf:'18457',author:'Itaporanga'},
    {id:'sample-shipment-2',material:'56.157',supplier:'CRS',quantity:60,unit:'m³',converted:60,date:'2026-12-02',arrival:'2026-12-02',nf:'18609',author:'CRS'}
  ];
  data.receipts = [
    {id:'sample-receipt',material:'20.014',supplier:'Itaporanga',date:'2026-12-01',quantity:45.79,unit:'t',converted:29.353,factor:1.56,
      operation:'divide',nf:'18457',freight:'FR-1024',shipment:'sample-shipment',author:'Romagnole',allocations:[{entry:'sample-0',quantity:29.353,close:false}]},
    {id:'sample-receipt-2',material:'22.829',supplier:'Said',date:'2026-12-01',quantity:45000,unit:'kg',converted:45000,factor:1,
      operation:'identity',nf:'18321',freight:'',shipment:'',author:'Romagnole',allocations:[{entry:'sample-1',quantity:45000,close:false}]}
  ];
  data.calendars[demoMonth] = {holidays:['2026-12-04','2026-12-05','2026-12-06','2026-12-24','2026-12-25','2026-12-31'],shifts:3,weekdays:19,saturdays:4};
  data.profiles = [
    ...[['Said','22.829'],['Itaporanga','20.014'],['CRS','56.157']].map(([name,material]) => ({email:name.toLowerCase()+'@parceiro.demo',name,role:'supplier' as const,scopes:[{material,supplier:name}]})),
    {email:'baldacim@parceiro.demo',name:'Baldacim',role:'carrier',scopes:[{material:'22.829',supplier:'Said'},{material:'20.014',supplier:'Itaporanga'}]}
  ];
  return data;
}
