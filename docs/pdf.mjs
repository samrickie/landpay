const encoder = new TextEncoder();
function literal(value) {
  return String(value).replace(/[^ -~\xA0-\xFF]/gu, '?').replace(/[()\\\xA0-\xFF]/g, char => {
    return '\\' + char.charCodeAt(0).toString(8).padStart(3,'0');
  });
}
function lines(value) {
  const characters = Array.from(String(value));
  const result = [];
  for (let i=0; i<characters.length; i+=80) result.push(characters.slice(i,i+80).join(''));
  return result;
}
export function paymentPdf(records, filter) {
  const report = records.flatMap(item => [
    ...lines(item.date + ' | Installment ' + item.month + ' | TZS ' + item.amount.toLocaleString('en-TZ')),
    ...lines('Reference: ' + item.reference.replace(/\s+/g,' ')),
    ...lines('Remarks: ' + (item.remarks.replace(/\s+/g,' ') || '-')),
    ...lines('Receipt: ' + (item.receipt?.name.replace(/\s+/g,' ') || '-')), ''
  ]);
  if (!report.length) report.push('No payment records match these filters.');
  const objects = ['', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'];
  const pages = [];
  for (let offset=0; offset<report.length; offset+=44) {
    const body = [`BT /F1 17 Tf 42 795 Td (LandPay - Payment history) Tj ET`,
      `BT /F1 10 Tf 42 770 Td (${literal(filter || 'All installments')}) Tj ET`,
      'BT /F1 10 Tf 42 742 Td 15 TL',
      ...report.slice(offset,offset+44).map(line => `(${literal(line)}) Tj T*`),
      'ET', `BT /F1 9 Tf 42 42 Td (Page ${pages.length+1}) Tj ET`].join('\n');
    const pageId = objects.length+1;
    pages.push(pageId + ' 0 R');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId+1} 0 R >>`,
      `<< /Length ${encoder.encode(body).length} >>\nstream\n${body}\nendstream`);
  }
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pages.join(' ')}] /Count ${pages.length} >>`;
  const chunks = ['%PDF-1.4\n'];
  const offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object,index) => {
    const chunk = `${index+1} 0 obj\n${object}\nendobj\n`;
    offsets.push(length);
    chunks.push(chunk);
    length += encoder.encode(chunk).length;
  });
  chunks.push(`xref\n0 ${offsets.length}\n0000000000 65535 f \n` +
    offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('') +
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`);
  return new Blob(chunks,{type:'application/pdf'});
}

