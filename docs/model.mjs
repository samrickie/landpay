export const localDate = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export const month = (date = new Date()) => localDate(date).slice(0,7);
export function shift(value, offset) {
  const [year, number] = value.split('-').map(Number);
  const index = year * 12 + number - 1 + offset;
  return String(Math.floor(index / 12)).padStart(4,'0') + '-' + String(index % 12 + 1).padStart(2,'0');
}
export const validMonth = value => typeof value === 'string' && /^[2-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
export const validAmount = value => Number.isSafeInteger(value) && value > 0;
export function summarize(plan, payments, now = month()) {
  const base = Math.floor(plan.price / plan.months);
  const extra = plan.price % plan.months;
  const totals = new Map();
  for (const payment of payments) totals.set(payment.month, (totals.get(payment.month) || 0) + payment.amount);
  const rows = Array.from({length: plan.months}, (_, index) => {
    const key = shift(plan.start, index);
    const target = base + Number(index < extra);
    const paid = totals.get(key) || 0;
    return { key, target, paid, status: paid >= target ? 'Paid' : key < now ? 'Overdue' : paid ? 'Partially Paid' : 'Unpaid' };
  });
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = Math.max(0, plan.price - paid);
  const elapsed = rows.filter(row => row.key < now).length;
  const remaining = plan.months - elapsed;
  return { rows, paid, balance, elapsed, remaining, average: remaining ? Math.ceil(balance / remaining) : null,
    percentage: Math.min(100, paid / plan.price * 100), overdue: rows.filter(row => row.status === 'Overdue').length,
    installment: rows[0].target, end: rows.at(-1).key };
}
export function validate(data) {
  const {plan, payments} = data;
  if (!Array.isArray(payments) || (!plan && payments.length)) throw Error('Invalid payment data.');
  if (plan && (!validAmount(plan.price) || !Number.isInteger(plan.months) || plan.months < 1 || plan.months > 1200 || plan.price < plan.months || !validMonth(plan.start) || !validMonth(shift(plan.start,plan.months-1)))) throw Error('Enter a valid plan with 1–1,200 months and at least TZS 1 per month.');
  const ids = new Set();
  let total = 0;
  for (const item of payments) {
    const {id, month: key, amount, date, reference, remarks} = item;
    const parsed = new Date(date);
    total += amount;
    if (typeof id !== 'string' || !id || ids.has(id) || !validMonth(key) || key < plan.start || key > shift(plan.start, plan.months - 1) || !validAmount(amount) ||
      !Number.isSafeInteger(total) || typeof date !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(date) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0,10) !== date ||
      typeof reference !== 'string' || !reference.trim() || reference.length > 120 || typeof remarks !== 'string' || remarks.length > 1000) throw Error('Check the payment details and make sure every assigned month falls inside the plan.');
    ids.add(id);
  }
  return data;
}
export function csvCell(value) {
  const text = String(value);
  const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"','""') + '"';
}

