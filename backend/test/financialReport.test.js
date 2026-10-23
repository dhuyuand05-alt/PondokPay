import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import {
  buildFinancialReportCsv,
  parseFinancialReportFilters,
  streamFinancialReportPdf,
} from '../Controllers/financialReportController.js';

const reportFixture = {
  period: { start_date: '2026-01-01', end_date: '2026-01-02' },
  filters: { santri_id: null, kantin_id: null },
  summary: {
    transaction_count: 1,
    student_count: 1,
    spending_total: '12500.00',
    topup_total: '0.00',
    withdrawal_total: '0.00',
    service_fee_total: '0.00',
  },
  students: [{
    santri_id: 7,
    nis: 'S-007',
    nama_lengkap: '=HYPERLINK("https://example.test")',
    transaction_count: 1,
    spending_total: '12500.00',
    topup_total: '0.00',
    withdrawal_total: '0.00',
    service_fee_total: '0.00',
  }],
  canteens: [{
    kantin_id: 3,
    nama_kantin: 'Kantin Utama',
    lokasi: 'Gedung A',
    transaction_count: 1,
    spending_total: '12500.00',
  }],
  spending_trend: [
    { period: '2026-01-01', transaction_count: 1, spending_total: '12500.00' },
    { period: '2026-01-02', transaction_count: 0, spending_total: '0.00' },
  ],
};

test('financial report filters validate dates, range, and optional IDs', () => {
  assert.deepEqual(
    parseFinancialReportFilters({
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      santri_id: '12',
      kantin_id: '4',
    }),
    {
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      santriId: 12,
      canteenId: 4,
    },
  );
  assert.throws(
    () => parseFinancialReportFilters({ start_date: '2026-02-30', end_date: '2026-03-01' }),
    /format YYYY-MM-DD/,
  );
  assert.throws(
    () => parseFinancialReportFilters({ start_date: '2026-02-02', end_date: '2026-02-01' }),
    /tidak boleh melewati/,
  );
  assert.throws(
    () => parseFinancialReportFilters({ start_date: '2025-01-01', end_date: '2026-01-02' }),
    /maksimal 366 hari/,
  );
  assert.throws(
    () => parseFinancialReportFilters({
      start_date: '2026-01-01',
      end_date: '2026-01-01',
      santri_id: '1.5',
    }),
    /ID santri tidak valid/,
  );
});

test('CSV exports use UTF-8 BOM, quote fields, and neutralize spreadsheet formulas', () => {
  const csv = buildFinancialReportCsv(reportFixture);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
  assert.match(csv, /"Kantin Utama"/);
  assert.match(csv, /"2026-01-02","0","0\.00"/);
});

test('PDF export produces a complete PDF document', async () => {
  const chunks = [];
  const output = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  const finished = new Promise((resolve, reject) => {
    output.once('finish', resolve);
    output.once('error', reject);
  });

  const largeReport = {
    ...reportFixture,
    students: Array.from({ length: 60 }, (_, index) => ({
      ...reportFixture.students[0],
      santri_id: index + 1,
      nis: `S-${String(index + 1).padStart(3, '0')}`,
      nama_lengkap: `Santri ${index + 1}`,
    })),
  };
  streamFinancialReportPdf(largeReport, output);
  await finished;
  const pdf = Buffer.concat(chunks).toString('latin1');
  assert.match(pdf, /^%PDF-/);
  assert.ok(pdf.includes('%%EOF'));
  assert.ok(pdf.length > 1000);
  assert.ok((pdf.match(/\/Type \/Page\b/g) || []).length > 1);
});
