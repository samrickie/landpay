import test from 'node:test';
import assert from 'node:assert/strict';
import { month, shift, summarize, validate, csvCell } from '../docs/model.mjs';
import { paymentPdf } from '../docs/pdf.mjs';

const plan = {price:1000,months:3,start:'2026-11'};
const paid = (key, amount, id='one') => ({id,month:key,amount,date:'2026-11-25',reference:'QA',remarks:''});

test('Tanzania month boundaries and year rollover', () => {
  assert.equal(month(new Date('2026-12-31T21:00:00Z')), '2027-01');
  assert.equal(shift('2026-11',2), '2027-01');
});
test('installment rounding, statuses and current-month catch-up', () => {
  const data = summarize(plan,[paid('2026-11',120),paid('2026-11',100,'two'),paid('2026-12',200,'three')],'2026-12');
  assert.deepEqual(data.rows.map(row=>row.target),[334,333,333]);
  assert.deepEqual(data.rows.map(row=>row.status),['Overdue','Partially Paid','Unpaid']);
  assert.deepEqual([data.elapsed,data.remaining,data.paid,data.balance,data.average,data.overdue,data.end,data.percentage],[1,2,420,580,290,1,'2027-01',42]);
});
test('before start, after end, full payment and overpayment', () => {
  assert.equal(summarize(plan,[],'2026-10').remaining,3);
  const data = summarize(plan,[paid('2026-11',1200)],'2027-02');
  assert.deepEqual([data.elapsed,data.remaining,data.average,data.balance,data.percentage,data.overdue],[3,0,null,0,100,2]);
  assert.equal(data.rows[0].status,'Paid');
});
test('validates changes before storage', () => {
  assert.doesNotThrow(()=>validate({plan,payments:[paid('2027-01',50)]}));
  assert.throws(()=>validate({plan,payments:[paid('2027-02',50)]}));
  assert.throws(()=>validate({plan,payments:[paid('2027-01',50),paid('2027-01',100)]}));
  assert.throws(()=>validate({plan,payments:[{...paid('2027-01',50),date:'2026-02-30'}]}));
  assert.throws(()=>validate({plan:{...plan,price:2},payments:[]}));
});
test('quotes CSV cells and treats formulas as text', () => {
  assert.equal(csvCell('  =2+2'),'"\'  =2+2"');
  assert.equal(csvCell('hello, "world"'),'"hello, ""world"""');
});
test('PDF pagination and cross-reference offsets', async () => {
  const blob = paymentPdf(Array.from({length:15},()=>({...paid('2026-11',500),reference:'TX (one)'})),'2026');
  const file = await blob.text();
  const start = Number(/startxref\n(\d+)/.exec(file)[1]);
  assert.equal(file.slice(start,start+4),'xref');
  assert.match(file,/\/Count 2/);
  assert.match(file,/TX \\050one\\051/);
  const entries = file.slice(start).split('\n').slice(3).filter(line=>/^\d{10} 00000 n/.test(line));
  for (const [index,entry] of entries.entries()) {
    const offset = Number(entry.slice(0,10));
    const expected = (index+1)+' 0 obj';
    assert.equal(file.slice(offset,offset+expected.length),expected);
  }
});

