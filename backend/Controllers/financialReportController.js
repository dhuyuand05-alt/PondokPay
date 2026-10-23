import PDFDocument from 'pdfkit';
import pool from '../config/db.js';

const parsePositiveId = (value, label) => {
  if (value === undefined || value === '') return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new FinancialReportValidationError(`${label} tidak valid.`);
  }
  return id;
};

class FinancialReportValidationError extends Error {}

const isValidDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const parseFinancialReportFilters = (query) => {
  const { start_date: startDate, end_date: endDate } = query;
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    throw new FinancialReportValidationError('Tanggal awal dan akhir wajib menggunakan format YYYY-MM-DD yang valid.');
  }
  const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000;
  if (days < 0) throw new FinancialReportValidationError('Tanggal awal tidak boleh melewati tanggal akhir.');
  if (days > 365) throw new FinancialReportValidationError('Rentang laporan maksimal 366 hari.');
  return {
    startDate,
    endDate,
    santriId: parsePositiveId(query.santri_id, 'ID santri'),
    canteenId: parsePositiveId(query.kantin_id, 'ID kantin'),
  };
};

const buildReportConditions = ({ startDate, endDate, santriId, canteenId }) => {
  const conditions = [
    't.created_at >= ?',
    't.created_at < DATE_ADD(?, INTERVAL 1 DAY)',
  ];
  const values = [`${startDate} 00:00:00`, endDate];
  if (santriId) {
    conditions.push('t.santri_id = ?');
    values.push(santriId);
  }
  if (canteenId) {
    conditions.push('t.kantin_id = ?');
    values.push(canteenId);
  }
  return { where: conditions.join(' AND '), values };
};

export const getFinancialReportData = async (filters) => {
  const { where, values } = buildReportConditions(filters);
  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS transaction_count,
            COALESCE(SUM(CASE WHEN t.tipe_transaksi = 'belanja' THEN t.jumlah ELSE 0 END), 0) AS spending_total,
            COALESCE(SUM(CASE WHEN t.tipe_transaksi = 'topup' THEN t.jumlah ELSE 0 END), 0) AS topup_total,
            COALESCE(SUM(CASE WHEN t.tipe_transaksi = 'tarik' THEN t.jumlah ELSE 0 END), 0) AS withdrawal_total,
            COALESCE(SUM(CASE WHEN t.tipe_transaksi = 'biaya_layanan' THEN t.jumlah ELSE 0 END), 0) AS service_fee_total,
            COUNT(DISTINCT t.santri_id) AS student_count
     FROM transaksi t WHERE ${where}`,
    values,
  );
  const [students] = await pool.query(
    `SELECT s.id AS santri_id, s.nis, s.nama_lengkap,
            COUNT(t.id) AS transaction_count,
            COALESCE(SUM(CASE WHEN t.tipe_transaksi = 'belanja' THEN t.jumlah ELSE 0 END), 0) AS spending_total,
            COALESCE(SUM(CASE WHEN t.tipe_transaksi = 'topup' THEN t.jumlah ELSE 0 END), 0) AS topup_total,
            COALESCE(SUM(CASE WHEN t.tipe_transaksi = 'tarik' THEN t.jumlah ELSE 0 END), 0) AS withdrawal_total,
            COALESCE(SUM(CASE WHEN t.tipe_transaksi = 'biaya_layanan' THEN t.jumlah ELSE 0 END), 0) AS service_fee_total
     FROM transaksi t JOIN santri s ON s.id = t.santri_id
     WHERE ${where}
     GROUP BY s.id, s.nis, s.nama_lengkap
     ORDER BY spending_total DESC, s.nama_lengkap, s.nis`,
    values,
  );
  const [canteens] = await pool.query(
    `SELECT k.id AS kantin_id, k.nama AS nama_kantin, k.lokasi,
            COUNT(t.id) AS transaction_count,
            COALESCE(SUM(t.jumlah), 0) AS spending_total
     FROM transaksi t JOIN kantin k ON k.id = t.kantin_id
     WHERE ${where} AND t.tipe_transaksi = 'belanja'
     GROUP BY k.id, k.nama, k.lokasi
     ORDER BY spending_total DESC, k.nama`,
    values,
  );
  const [spendingTrend] = await pool.query(
    `SELECT DATE_FORMAT(t.created_at, '%Y-%m-%d') AS period,
            COUNT(*) AS transaction_count,
            COALESCE(SUM(t.jumlah), 0) AS spending_total
     FROM transaksi t
     WHERE ${where} AND t.tipe_transaksi = 'belanja'
     GROUP BY DATE_FORMAT(t.created_at, '%Y-%m-%d')
     ORDER BY period`,
    values,
  );
  const trendByDay = new Map(spendingTrend.map((row) => [row.period, row]));
  const completeSpendingTrend = [];
  for (let day = Date.parse(`${filters.startDate}T00:00:00.000Z`);
    day <= Date.parse(`${filters.endDate}T00:00:00.000Z`);
    day += 86400000) {
    const period = new Date(day).toISOString().slice(0, 10);
    completeSpendingTrend.push(trendByDay.get(period) || {
      period,
      transaction_count: 0,
      spending_total: '0.00',
    });
  }
  return {
    period: { start_date: filters.startDate, end_date: filters.endDate },
    filters: { santri_id: filters.santriId, kantin_id: filters.canteenId },
    summary,
    students,
    canteens,
    spending_trend: completeSpendingTrend,
  };
};

const csvCell = (value) => {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

const csvRow = (values) => values.map(csvCell).join(',');

export const buildFinancialReportCsv = (report) => {
  const lines = [
    csvRow(['Bagian', 'Periode awal', report.period.start_date, 'Periode akhir', report.period.end_date]),
    '',
    csvRow(['Ringkasan', 'Jumlah transaksi', 'Jumlah santri', 'Total belanja', 'Total top-up', 'Total penarikan', 'Total biaya layanan']),
    csvRow([
      'Semua transaksi terfilter',
      report.summary.transaction_count,
      report.summary.student_count,
      report.summary.spending_total,
      report.summary.topup_total,
      report.summary.withdrawal_total,
      report.summary.service_fee_total,
    ]),
    '',
    csvRow(['Rekap per santri']),
    csvRow(['ID santri', 'NIS', 'Nama santri', 'Jumlah transaksi', 'Belanja', 'Top-up', 'Penarikan', 'Biaya layanan']),
    ...report.students.map((row) => csvRow([
      row.santri_id, row.nis, row.nama_lengkap, row.transaction_count,
      row.spending_total, row.topup_total, row.withdrawal_total, row.service_fee_total,
    ])),
    '',
    csvRow(['Rekap belanja per kantin']),
    csvRow(['ID kantin', 'Nama kantin', 'Lokasi', 'Jumlah transaksi', 'Total belanja']),
    ...report.canteens.map((row) => csvRow([
      row.kantin_id, row.nama_kantin, row.lokasi, row.transaction_count, row.spending_total,
    ])),
    '',
    csvRow(['Tren belanja harian']),
    csvRow(['Tanggal', 'Jumlah transaksi belanja', 'Total belanja']),
    ...report.spending_trend.map((row) => csvRow([
      row.period, row.transaction_count, row.spending_total,
    ])),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
};

const asciiText = (value) =>
  String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');

const formatRupiah = (value) =>
  `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(value || 0))}`;

const fitCell = (document, value, width, fontSize) => {
  const text = asciiText(value);
  if (document.widthOfString(text, { fontSize }) <= width) return text;
  let shortened = text;
  while (shortened.length > 1 && document.widthOfString(`${shortened}...`, { fontSize }) > width) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}...`;
};

const drawTable = (document, title, columns, rows) => {
  const pageWidth = document.page.width - document.page.margins.left - document.page.margins.right;
  const fontSize = 8;
  const headerHeight = 24;
  const rowHeight = 21;
  const tableSectionReserve = 18 + headerHeight + rowHeight;
  const drawHeader = () => {
    const y = document.y;
    document.rect(document.page.margins.left, y, pageWidth, headerHeight).fill('#e8f1ed');
    document.fillColor('#173a30').font('Helvetica-Bold').fontSize(fontSize);
    let x = document.page.margins.left;
    for (const column of columns) {
      document.text(column.label, x + 4, y + 7, { width: column.width - 8, lineBreak: false });
      x += column.width;
    }
    document.y = y + headerHeight;
  };

  if (document.y + tableSectionReserve > document.page.height - document.page.margins.bottom) {
    document.addPage({ layout: 'landscape', margin: 32 });
  }
  document.moveDown(0.7).font('Helvetica-Bold').fontSize(12).fillColor('#173a30').text(title);
  document.moveDown(0.35);
  drawHeader();
  document.font('Helvetica').fontSize(fontSize).fillColor('#202620');
  for (const [rowIndex, row] of rows.entries()) {
    if (document.y + rowHeight > document.page.height - document.page.margins.bottom) {
      document.addPage({ layout: 'landscape', margin: 32 });
      document.font('Helvetica-Bold').fontSize(10).fillColor('#5d6c65').text(`${title} (lanjutan)`);
      drawHeader();
      document.font('Helvetica').fontSize(fontSize).fillColor('#202620');
    }
    const y = document.y;
    document.rect(document.page.margins.left, y, pageWidth, rowHeight)
      .fill(rowIndex % 2 === 0 ? '#ffffff' : '#f7f9f8');
    let x = document.page.margins.left;
    row.forEach((value, index) => {
      const column = columns[index];
      document.fillColor('#202620').text(
        fitCell(document, value, column.width - 8, fontSize),
        x + 4,
        y + 6,
        { width: column.width - 8, lineBreak: false },
      );
      x += column.width;
    });
    document.y = y + rowHeight;
  }
};

export const streamFinancialReportPdf = (report, response) => {
  const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32, info: { Title: 'Laporan Finansial PondokPay' } });
  document.pipe(response);
  document.font('Helvetica-Bold').fontSize(20).fillColor('#173a30').text('Laporan Finansial');
  document.moveDown(0.4).font('Helvetica').fontSize(10).fillColor('#53635c')
    .text(`Periode: ${report.period.start_date} sampai ${report.period.end_date}`);
  if (report.filters.santri_id) document.text(`Filter santri ID: ${report.filters.santri_id}`);
  if (report.filters.kantin_id) document.text(`Filter kantin ID: ${report.filters.kantin_id}`);
  document.moveDown(0.8).font('Helvetica-Bold').fontSize(11).fillColor('#173a30')
    .text(`Transaksi: ${report.summary.transaction_count}  |  Santri: ${report.summary.student_count}`);
  document.font('Helvetica').fontSize(10).fillColor('#202620')
    .text(`Belanja ${formatRupiah(report.summary.spending_total)}  |  Top-up ${formatRupiah(report.summary.topup_total)}  |  Penarikan ${formatRupiah(report.summary.withdrawal_total)}  |  Biaya layanan ${formatRupiah(report.summary.service_fee_total)}`);

  drawTable(document, 'Rekap per santri', [
    { label: 'NIS', width: 75 },
    { label: 'Nama santri', width: 188 },
    { label: 'Transaksi', width: 62 },
    { label: 'Belanja', width: 103 },
    { label: 'Top-up', width: 103 },
    { label: 'Penarikan', width: 103 },
    { label: 'Biaya layanan', width: 143 },
  ], report.students.map((row) => [
    row.nis, row.nama_lengkap, row.transaction_count, formatRupiah(row.spending_total),
    formatRupiah(row.topup_total), formatRupiah(row.withdrawal_total), formatRupiah(row.service_fee_total),
  ]));
  drawTable(document, 'Rekap belanja per kantin', [
    { label: 'Nama kantin', width: 280 },
    { label: 'Lokasi', width: 270 },
    { label: 'Transaksi', width: 110 },
    { label: 'Total belanja', width: 117 },
  ], report.canteens.map((row) => [
    row.nama_kantin, row.lokasi, row.transaction_count, formatRupiah(row.spending_total),
  ]));
  drawTable(document, 'Tren belanja harian', [
    { label: 'Tanggal', width: 240 },
    { label: 'Transaksi belanja', width: 260 },
    { label: 'Total belanja', width: 277 },
  ], report.spending_trend.map((row) => [
    row.period, row.transaction_count, formatRupiah(row.spending_total),
  ]));
  document.end();
};

const loadReport = async (req, res) => {
  try {
    const filters = parseFinancialReportFilters(req.query);
    const report = await getFinancialReportData(filters);
    return { report };
  } catch (error) {
    if (error instanceof FinancialReportValidationError) {
      res.status(400).json({ message: error.message });
      return null;
    }
    console.error('Get financial report error:', error);
    res.status(500).json({ message: 'Gagal mengambil laporan finansial.' });
    return null;
  }
};

export const getFinancialReport = async (req, res) => {
  const result = await loadReport(req, res);
  if (!result) return;
  return res.status(200).json({ data: result.report });
};

export const exportFinancialReportCsv = async (req, res) => {
  const result = await loadReport(req, res);
  if (!result) return;
  const filename = `laporan-finansial-${result.report.period.start_date}-${result.report.period.end_date}.csv`;
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  return res.status(200).send(buildFinancialReportCsv(result.report));
};

export const exportFinancialReportPdf = async (req, res) => {
  const result = await loadReport(req, res);
  if (!result) return;
  const filename = `laporan-finansial-${result.report.period.start_date}-${result.report.period.end_date}.pdf`;
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  return streamFinancialReportPdf(result.report, res);
};
