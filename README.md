# LandPay – Land Installment Tracker

LandPay tracks a Tanzanian shilling land purchase plan. It stores the plan, payment records and receipts in IndexedDB in your browser profile. The hosted site serves only app files. LandPay has no backend, analytics, account, cloud sync or third-party runtime dependencies.

## Use LandPay

1. Open [LandPay](https://samrickie.github.io/landpay/) and choose **Create payment plan**. Enter the whole-TZS purchase price, number of months and start month.
2. Choose **Record payment**. Pick the installment month and enter the actual payment date, amount and reference. You can record multiple payments for an installment and attach a PDF, JPG or PNG receipt up to 15 MB to each payment.
3. Open **History** to filter by installment month and year, view receipts, edit or delete payments, or export matching records as a CSV or PDF. The PDF uses a standard Latin-character font and substitutes characters outside its supported range. CSV and backups preserve Unicode.
4. Under **Settings**, download backups periodically. A backup includes all receipts. Restoring it replaces existing data in the current browser. Switching devices, browsers or profiles requires a backup and restore. Clearing site data removes local records. Treat exported reports and backups as private.

On Android, open the HTTPS site in Chrome, then choose **Install app** or **Add to Home screen** in Chrome’s menu. Open LandPay once while online so the app files can be cached. You can then use it offline. Browser storage remains subject to device capacity and browser storage policies.

## How totals work

Installments begin in the selected month and are due by the end of each calendar month, using Tanzania time. Whole-shilling rounding is distributed across the earliest installments. The first month is included in the term. The active month counts as remaining until it ends.

Each installment's status uses the payments assigned to that month. An overpayment lowers the overall balance without automatically reallocating money to another month. The catch-up average divides the outstanding balance by the scheduled months still open, including the current month when it is in the plan, and rounds up to the next shilling. The expected completion date is the scheduled final installment month.

## Development and hosting

Run `node scripts/serve.mjs` with Node.js 18 or newer and open [the local preview](http://127.0.0.1:4173/landpay/). Run `node --test tests/model.test.mjs` for the calculation and export tests.

GitHub Pages serves `/docs` from the `main` branch. The app uses relative paths so its service worker and manifest work under the repository path. Update the service worker cache version when changing shipped resources.

Keep personal records, receipt files, reports and backups outside the repository.

