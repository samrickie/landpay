import { localDate, month, summarize, validate, csvCell } from './model.mjs';
import { read, write, receipt, encode, decode } from './storage.mjs';
import { paymentPdf } from './pdf.mjs';

const main = document.querySelector('main');
const dialog = document.querySelector('dialog');
const notice = document.querySelector('#notice');
const add = document.querySelector('#add');
const currency = new Intl.NumberFormat('en-TZ');
const monthName = new Intl.DateTimeFormat('en-TZ', {month:'long',year:'numeric',timeZone:'UTC'});
const shortMonth = new Intl.DateTimeFormat('en-TZ', {month:'short',timeZone:'UTC'});
const asDate = value => new Date(value + '-01T00:00:00Z');
const label = value => monthName.format(asDate(value));
const tzs = value => 'TZS ' + currency.format(value);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const today = localDate;
const fileTypes = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const forms = {plan:'Edit payment plan',payment:'Record payment'};
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('landpay-updates') : null;
let state, page = 'overview', selectedYear = '', selectedMonth = '', installPrompt, noticeTimer;
const stats = () => summarize(state.plan,state.payments);

function tell(message) {
  notice.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.textContent = ''; }, 5500);
}
async function save(data, revision) {
  validate(data);
  await write(data,revision);
  state = await read();
  channel?.postMessage('updated');
  render();
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url),60000);
}
function heading(kicker, title, caption, controls = '') {
  return `<div class="heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="muted">${caption}</p></div>${controls}</div>`;
}
function stat(label, value, hint, variant = '') {
  return `<article class="card stat ${variant}"><h2>${label}</h2><strong>${value}</strong><p>${hint}</p></article>`;
}
function pill(status) {
  return `<span class="pill ${status.toLowerCase().replaceAll(' ','-')}">${status}</span>`;
}
function overview() {
  if (!state.plan) return heading('INSTALLMENT TRACKER','Payment overview','Track your land purchase from the first installment to the final payment.') +
    '<section class="empty card"><span class="empty-icon" aria-hidden="true">◇</span><h2>Set up your payment plan</h2><p class="muted">Enter the purchase price, installment term and starting month to see your schedule.</p><button class="primary" data-action="plan">Create payment plan</button></section>';
  const {price, start, months} = state.plan;
  const {paid,balance,percentage,elapsed,remaining,average,overdue,end,rows,installment} = stats();
  const current = month();
  const position = Math.max(0,rows.findIndex(row => row.key >= current));
  const maximumStart = Math.max(0,rows.length-12);
  const windowStart = current > end ? maximumStart : Math.min(maximumStart,Math.max(0,position-5));
  const trend = rows.slice(windowStart,windowStart+12);
  const top = Math.max(...trend.map(row => Math.max(row.paid,row.target)),1);
  const upcoming = rows.filter(row => row.status === 'Overdue').slice(0,4);
  const period = `${label(start)} to ${label(end)}`;
  return heading('INSTALLMENT TRACKER','Payment overview',period,'<button class="secondary" data-action="plan">Edit plan</button>') +
    `<section class="metrics" aria-label="Payment totals">
      ${stat('Purchase price',tzs(price),months + ' monthly installments')}
      ${stat('Total paid',tzs(paid),state.payments.length + ' recorded payments','positive')}
      ${stat('Outstanding balance',tzs(balance),balance ? 'Remaining purchase balance' : 'Purchase balance cleared')}
      ${stat('Overdue installments',overdue,overdue ? 'Past months below target' : 'No overdue installments')}
    </section>
    <div class="panels">
      <section class="card progress"><h2>Payment progress</h2><p class="muted">Share of the purchase price paid</p><strong class="percent">${new Intl.NumberFormat('en-TZ',{maximumFractionDigits:1}).format(percentage)}%</strong><progress value="${percentage}" max="100" aria-label="Payment completion"></progress>
      <dl><div><dt>Months elapsed</dt><dd>${elapsed} of ${months}</dd></div><div><dt>Months remaining</dt><dd>${remaining}</dd></div><div><dt>Initial installment</dt><dd>${tzs(installment)}</dd></div><div><dt>Average needed per remaining month</dt><dd>${average === null ? balance ? 'Plan ended' : tzs(0) : tzs(average)}</dd></div><div><dt>Expected completion</dt><dd>${label(end)}</dd></div></dl></section>
      <section class="card trend"><h2>Monthly payment trend</h2><p class="muted">${label(trend[0].key)} to ${label(trend.at(-1).key)}</p><div class="chart-legend"><span>Amount paid</span><span>Installment target</span></div>
      <div class="chart" role="list" aria-label="Monthly payment trend">${trend.map(row => `<div class="chart-col" role="listitem" aria-label="${label(row.key)}: ${tzs(row.paid)} paid, ${tzs(row.target)} target" title="${label(row.key)} · ${tzs(row.paid)} paid · ${tzs(row.target)} target"><div class="track"><span class="target" style="height:${row.target/top*100}%"></span><span class="bar" style="height:${row.paid/top*100}%"></span></div><small>${shortMonth.format(asDate(row.key)).replace(/ \d\d$/,'')}</small></div>`).join('')}</div>
      </section>
    </div>
    <section class="card due"><div class="section-head"><div><h2>Overdue installments</h2><p class="muted">Monthly amounts still below their scheduled target</p></div><button class="secondary" data-action="history">View schedule</button></div>
    ${upcoming.length ? upcoming.map(row => `<div class="due-row"><span>${label(row.key)}</span><strong>${tzs(row.target-row.paid)} short</strong>${pill(row.status)}</div>`).join('') : '<p class="all-clear">You have no overdue installments.</p>'}</section>`;
}
function matches(key) {
  return (!selectedYear || key.slice(0,4) === selectedYear) && (!selectedMonth || key.slice(5) === selectedMonth);
}
function records() {
  return state.payments.filter(item => matches(item.month)).sort((a,b) => a.date.localeCompare(b.date) || a.month.localeCompare(b.month));
}
function history() {
  if (!state.plan) return heading('INSTALLMENTS','Payment history','Set up a plan to view the schedule and payment records.','<button class="primary" data-action="plan">Create payment plan</button>');
  const rows = stats().rows;
  const years = [...new Set(rows.map(row => row.key.slice(0,4)))];
  const filtered = records();
  return heading('INSTALLMENTS','Payment history','Review your monthly schedule and recorded transactions.',
    '<div class="actions"><button class="secondary" data-action="csv">Export CSV</button><button class="secondary" data-action="pdf">Export PDF</button></div>') +
    `<div class="filters"><label>Year<select id="filter-year"><option value="">All years</option>${years.map(year => `<option ${year===selectedYear?'selected':''}>${year}</option>`).join('')}</select></label>
    <label>Month<select id="filter-month"><option value="">All months</option>${Array.from({length:12},(_,index) => {const key=String(index+1).padStart(2,'0');return `<option value="${key}" ${key===selectedMonth?'selected':''}>${label('2026-'+key).replace(' 2026','')}</option>`;}).join('')}</select></label></div>
    <section class="card table-card"><h2>Monthly schedule</h2><div class="table-scroll" tabindex="0" aria-label="Monthly schedule table"><table><thead><tr><th>Installment</th><th>Target</th><th>Paid</th><th>Status</th></tr></thead><tbody>${rows.filter(row => matches(row.key)).map(row => `<tr><th scope="row">${label(row.key)}</th><td>${tzs(row.target)}</td><td>${tzs(row.paid)}</td><td>${pill(row.status)}</td></tr>`).join('') || '<tr><td colspan="4">No scheduled months match these filters.</td></tr>'}</tbody></table></div></section>
    <section class="card table-card"><h2>Payment records</h2><div class="table-scroll" tabindex="0" aria-label="Payment records table"><table><thead><tr><th>Payment date</th><th>Installment</th><th>Amount</th><th>Reference</th><th>Actions</th></tr></thead><tbody>${filtered.map(item => `<tr><th scope="row">${item.date}</th><td>${label(item.month)}</td><td>${tzs(item.amount)}</td><td>${escape(item.reference)}</td><td><div class="actions">${['View','Edit','Delete'].map(action => `<button class="text-btn ${action==='Delete'?'danger':''}" data-action="${action.toLowerCase()}" data-id="${escape(item.id)}">${action}</button>`).join('')}</div></td></tr>`).join('') || '<tr><td colspan="5">No payments match these filters.</td></tr>'}</tbody></table></div></section>`;
}
function settings() {
  return heading('PREFERENCES','Settings','Manage your payment plan, backup and app installation.') +
    `<section class="card setting"><div><h2>Payment plan</h2><p class="muted">Update the price, term and starting month.</p></div><button class="secondary" data-action="plan">${state.plan?'Edit plan':'Create plan'}</button></section>
    <section class="card setting"><div><h2>Backup and restore</h2><p class="muted">Download your plan, payments and receipts as a single file. Keep it somewhere private. Restoring a backup replaces the data on this device.</p></div><div class="actions"><button class="secondary" data-action="backup">Download backup</button><button class="secondary" data-action="restore">Restore backup</button></div></section>
    <section class="card setting"><div><h2>Install LandPay</h2><p class="muted">On Android, open LandPay in Chrome and choose Install app or Add to Home screen from the browser menu. The app works offline after its first successful load.</p></div>${installPrompt?'<button class="primary" data-action="install">Install app</button>':''}</section>`;
}
function render(focus = false) {
  if (!state) return;
  document.querySelectorAll('[data-page]').forEach(button => {
    if (button.dataset.page === page) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  add.hidden = !state.plan;
  main.innerHTML = {overview,history,settings}[page]();
  if (focus) main.focus();
}
function show(title, content, submitLabel, onSubmit) {
  if (dialog.open) dialog.close();
  dialog.innerHTML = `<form><div class="dialog-head"><h2 id="dialog-title">${title}</h2><button type="button" class="icon-btn" aria-label="Close dialog" data-close>×</button></div>${content}<p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary" data-close>${onSubmit?'Cancel':'Close'}</button>${onSubmit?`<button class="primary" type="submit">${submitLabel}</button>`:''}</div></form>`;
  const form = dialog.querySelector('form');
  dialog.querySelectorAll('[data-close]').forEach(button => {button.onclick=()=>dialog.close();});
  form.onsubmit = async event => {
    event.preventDefault();
    if (!onSubmit) return;
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    form.querySelector('.form-error').textContent = '';
    try {
      await onSubmit(new FormData(form));
      dialog.close();
    } catch (error) {
      form.querySelector('.form-error').textContent = error.message || 'The change could not be saved.';
    } finally {
      submit.disabled = false;
    }
  };
  dialog.showModal();
}
function planForm() {
  const {plan, payments, revision} = state;
  show(plan ? forms.plan : 'Create payment plan', `<label>Purchase price (TZS)<input name="price" type="number" inputmode="numeric" min="1" step="1" max="9007199254740991" value="${plan?.price || ''}" required></label>
    <label>Installment months<input name="months" type="number" inputmode="numeric" min="1" max="1200" value="${plan?.months || ''}" required></label>
    <label>Starting month <span class="muted">(YYYY-MM)</span><input name="start" type="text" pattern="[2-9][0-9]{3}-(0[1-9]|1[0-2])" maxlength="7" placeholder="YYYY-MM" value="${plan?.start || month()}" required></label>
    <p class="form-hint" id="plan-preview" aria-live="polite"></p>`, 'Save plan', async data => {
    await save({plan:{price:Number(data.get('price')),months:Number(data.get('months')),start:data.get('start')},payments},revision);
    selectedYear = '';
    selectedMonth = '';
    render();
    tell('Payment plan saved.');
  });
  const form = dialog.querySelector('form');
  function preview() {
    const data = new FormData(form);
    const next = {price:Number(data.get('price')),months:Number(data.get('months')),start:data.get('start')};
    const output = form.querySelector('#plan-preview');
    try {
      validate({plan:next,payments:[]});
      const {installment,end} = summarize(next,[]);
      output.textContent = `${tzs(installment)} initial installment · Completes ${label(end)}`;
    } catch { output.textContent = ''; }
  }
  form.addEventListener('input',preview);
  preview();
}
function paymentForm(item) {
  const {plan,payments,revision} = state;
  const rows = stats().rows;
  const key = item?.month || rows.find(row=>row.key===month())?.key || (month()<plan.start?plan.start:rows.at(-1).key);
  show(item?'Edit payment':forms.payment,`<label>Installment month<select name="month">${rows.map(row=>`<option value="${row.key}" ${row.key===key?'selected':''}>${label(row.key)}</option>`).join('')}</select></label>
    <div class="form-grid"><label>Amount (TZS)<input name="amount" type="number" inputmode="numeric" min="1" max="9007199254740991" step="1" required value="${item?.amount || ''}"></label>
    <label>Payment date<input name="date" type="date" value="${item?.date || today()}" required></label></div>
    <label>Reference number<input name="reference" maxlength="120" value="${escape(item?.reference)}" required></label>
    <label>Remarks <span class="muted">(optional)</span><textarea name="remarks" maxlength="1000" rows="2">${escape(item?.remarks)}</textarea></label>
    <label>Receipt <span class="muted">(PDF, JPG or PNG, up to 15 MB)</span><input name="receipt" type="file" accept="${fileTypes}"></label>
    ${item?.receipt?`<label class="check"><input name="remove" type="checkbox"> Remove ${escape(item.receipt.name)}</label>`:''}`,'Save payment',async data => {
    const file = data.get('receipt');
    const attachment = file?.name ? await receipt(file,file.name) : data.get('remove') ? null : item?.receipt || null;
    const record = {id:item?.id || crypto.randomUUID(),month:data.get('month'),amount:Number(data.get('amount')),date:data.get('date'),reference:data.get('reference').trim(),remarks:data.get('remarks').trim(),receipt:attachment};
    await save({plan,payments:item?payments.map(payment=>payment.id===item.id?record:payment):[...payments,record]},revision);
    tell(item?'Payment updated.':'Payment recorded.');
  });
}
function view(item) {
  if (!item) return;
  show('Payment details',`<dl class="details"><div><dt>Amount</dt><dd>${tzs(item.amount)}</dd></div><div><dt>Installment</dt><dd>${label(item.month)}</dd></div><div><dt>Payment date</dt><dd>${item.date}</dd></div><div><dt>Reference</dt><dd>${escape(item.reference)}</dd></div><div><dt>Remarks</dt><dd>${escape(item.remarks || 'None')}</dd></div></dl>
    ${item.receipt?`<div class="receipt"><strong>Receipt</strong><p>${escape(item.receipt.name)}</p><div class="actions"><a class="secondary" id="receipt-link" target="_blank" rel="noopener noreferrer">Open receipt</a><button type="button" class="secondary" id="receipt-download">Download receipt</button></div></div>`:''}`);
  if (item.receipt) {
    const {blob,name} = item.receipt;
    const url = URL.createObjectURL(blob);
    dialog.querySelector('#receipt-link').href = url;
    dialog.querySelector('#receipt-download').onclick = () => download(blob,name);
    dialog.addEventListener('close',()=>setTimeout(()=>URL.revokeObjectURL(url),60000),{once:true});
  }
}
function remove(item) {
  const { plan, payments, revision } = state;
  show('Delete payment?',`<p>Delete the ${tzs(item.amount)} payment for ${label(item.month)} and its attached receipt, if any?</p>`,'Delete payment',async () => {
    await save({plan,payments:payments.filter(payment=>payment.id!==item.id)},revision);
    tell('Payment deleted.');
  });
}
async function backup() {
  const {plan,payments} = state;
  const records = await Promise.all(payments.map(async ({receipt:attachment,...payment}) => ({
    ...payment, receipt:attachment?{name:attachment.name,type:attachment.blob.type,content:await encode(attachment.blob)}:null
  })));
  download(new Blob([JSON.stringify({version:1,plan,payments:records})],{type:'application/json'}),'landpay-'+today()+'.landpay.json');
}
function restore() {
  const {revision} = state;
  show('Restore backup','<p>This replaces the plan, payment records and receipts currently stored on this device.</p><label>LandPay backup<input type="file" name="backup" accept=".json,application/json" required></label>','Replace with backup',async data => {
    const file = data.get('backup');
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch { throw Error('Choose a valid LandPay backup file.'); }
    if (parsed?.version !== 1 || !('plan' in parsed) || (parsed.plan !== null && typeof parsed.plan !== 'object')) throw Error('Unsupported LandPay backup.');
    validate(parsed);
    const plan = parsed.plan && {price:parsed.plan.price,months:parsed.plan.months,start:parsed.plan.start};
    const payments = await Promise.all(parsed.payments.map(async ({id,month,amount,date,reference,remarks,receipt:attachment}) => ({
      id,month,amount,date,reference,remarks,receipt:attachment?await receipt(decode(attachment.type,attachment.content),attachment.name):null
    })));
    await save({plan,payments},revision);
    selectedYear = '';
    selectedMonth = '';
    render();
    tell('Backup restored.');
  });
}
function exportCsv() {
  const rows = [['Payment date','Installment month','Amount (TZS)','Reference','Remarks','Receipt filename'],
    ...records().map(item=>[item.date,item.month,item.amount,item.reference,item.remarks,item.receipt?.name || ''])];
  download(new Blob(['\uFEFF',rows.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'landpay-payments.csv');
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button || !state) return;
  const {page: destination, action, id} = button.dataset;
  if (destination || action === 'history') {
    page = destination || action;
    render(true);
    return;
  }
  if (button === add) { paymentForm(); return; }
  const item = state.payments.find(payment=>payment.id===id);
  try {
    if (action==='plan') planForm();
    if (action==='view') view(item);
    if (action==='edit' && item) paymentForm(item);
    if (action==='delete' && item) remove(item);
    if (action==='backup') await backup();
    if (action==='restore') restore();
    if (action==='csv') exportCsv();
    if (action==='pdf') download(paymentPdf(records(), [selectedYear,selectedMonth].filter(Boolean).join(' / ')),'landpay-payments.pdf');
    if (action==='install' && installPrompt) {
      await installPrompt.prompt();
      installPrompt = null;
      render();
    }
  } catch (error) { tell(error.message || 'LandPay could not complete that action.'); }
});
main.addEventListener('change',event => {
  if (event.target.id==='filter-year') selectedYear=event.target.value;
  else if (event.target.id==='filter-month') selectedMonth=event.target.value;
  else return;
  const id=event.target.id;
  render();
  document.getElementById(id)?.focus();
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;if(page==='settings')render();});
window.addEventListener('appinstalled',()=>{installPrompt=null;if(page==='settings')render();});
async function refresh() {
  try { state = await read(); render(); }
  catch (error) { tell(error.message || 'Local storage is unavailable.'); }
}
if (channel) channel.onmessage = refresh;
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
let currentMonth = month();
setInterval(() => {
  const next = month();
  if (next !== currentMonth) { currentMonth = next; render(); }
},60000);
add.hidden = true;
read().then(data=>{state=data;render();}).catch(()=>{main.textContent='LandPay could not open local storage. Check browser storage permissions and reload.';});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>tell('Offline setup failed. Reload while online to try again.'));

