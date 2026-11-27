import { jsPDF } from 'jspdf';
import { calendarDays, dateLabel, fmt, monthLabel, workdays, type Publication } from './model';

export function createPdf(publication: Publication) {
  const {month, calendar, entries, materials} = publication;
  const doc = new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
  const days = calendarDays(month);
  const work = workdays(month,calendar);
  const holidayLabels = calendar.holidays.map(date=>{
    const day = days.find(row=>row.iso===date);
    return dateLabel(date) + ' - ' + (day?.label.slice(0,3) || '');
  });
  const columns = materials.length ? materials : [{id:'',name:'',unit:''}];
  for (let offset = 0; offset < columns.length; offset += 6) {
    if (offset) doc.addPage();
    const group = columns.slice(offset,offset+6);
    const width = 281, left = 8, dateWidth = 30, colWidth = (width-dateWidth)/group.length;
    const positions = group.map((_,index)=>left+dateWidth+index*colWidth);
    const values = days.map(day=>group.map(material=>{
      const bySupplier = new Map<string,number>();
      entries.filter(e=>e.material===material.id && e.date===day.iso).forEach(e=>bySupplier.set(e.supplier,(bySupplier.get(e.supplier)||0)+e.quantity));
      return [...bySupplier].map(([supplier,quantity])=>fmt(quantity)+'  '+supplier);
    }));
    const footerHeight = 29 + Math.ceil(holidayLabels.length/6)*4;
    const rowWeights = values.map(row=>Math.max(1,...row.map(group=>group.length)));
    const rowHeight = Math.min(4.6,(210-27-footerHeight)/rowWeights.reduce((sum,n)=>sum+n,0));
    doc.setFont('helvetica','bold').setFontSize(12).setTextColor('#464645');
    doc.text('PROGRAMAÇÃO DE ENTREGA DOS AGREGADOS - '+monthLabel(month).toUpperCase(),left,11.3);
    doc.setFillColor('#AB0D19').rect(left,16,width,11,'F');
    doc.setDrawColor('#ffffff').setLineWidth(0.35);
    positions.forEach(x=>doc.line(x,16,x,27));
    doc.setFontSize(8).setTextColor('#ffffff').text('DATA',left+dateWidth/2,22.5,{align:'center'});
    group.forEach((material,i)=>{
      const center = positions[i]+colWidth/2;
      if (material.id) {
        doc.text(`${material.name.toUpperCase()} (${material.unit.toUpperCase()})`,center,20.5,{align:'center',maxWidth:colWidth-2});
        doc.text('CÓDIGO '+material.id,center,24.5,{align:'center'});
      }
    });
    doc.setLineWidth(0.17).setDrawColor('#dddddd').setTextColor('#464645');
    let y = 27;
    days.forEach((day,i)=>{
      const height = rowHeight*rowWeights[i];
      const nonWorkingDay = day.weekday === 0 || day.weekday === 6 || calendar.holidays.includes(day.iso);
      if (nonWorkingDay || i%2 === 0) doc.setFillColor(nonWorkingDay?'#e6e6e6':'#f2f2f2').rect(left,y,width,height,'F');
      doc.setFont('helvetica','normal').setFontSize(Math.min(7.3,rowHeight*2.15));
      const baseline = y+rowHeight*0.72;
      doc.text(String(day.day).padStart(2,'0'),left+2,baseline);
      doc.text(day.label,left+8,baseline);
      values[i].forEach((lines,j)=>lines.forEach((line,k)=>doc.text(line,positions[j]+2,baseline+k*rowHeight,{maxWidth:colWidth-4})));
      doc.line(left,y,left+width,y);
      y += height;
    });
    doc.line(left,y,left+width,y);
    const totals = group.map(m=>entries.filter(e=>e.material===m.id).reduce((sum,e)=>sum+e.quantity,0));
    for (const [label, quantities] of [['TOTAL', totals], ['MÉDIA DIA', totals.map(n=>work.total ? n/work.total : 0)]] as const) {
      doc.setFillColor('#e6e6e6').rect(left,y,width,6,'F');
      doc.line(left,y,left+width,y);
      doc.setFont('helvetica','bold').setFontSize(8);
      doc.text(label,left+2,y+4);
      group.forEach((m,i)=>{if(m.id) doc.text(fmt(quantities[i],m.unit==='kg'?0:3)+' '+m.unit.toUpperCase(),positions[i]+colWidth/2,y+4,{align:'center'});});
      y+=6;
      doc.line(left,y,left+width,y);
    }
    [left,...positions,left+width].forEach(x=>doc.line(x,27,x,y));
    doc.setFontSize(8).text('FERIADOS',left+2,y+6);
    holidayLabels.forEach((label,i)=>doc.text(label,left+dateWidth+(i%6)*40,y+6+Math.floor(i/6)*4));
    y += Math.max(1,Math.ceil(holidayLabels.length/6))*4+8;
    doc.text('DIAS ÚTEIS',left+2,y);
    doc.text(`TOTAL: ${fmt(work.total,2)}     SEG-SEX: ${work.weekdays}     SAB: ${work.saturdays}     TURNOS: ${calendar.shifts}`,left+dateWidth,y);
  }
  return doc.output('arraybuffer');
}
