import PDFDocument from 'pdfkit';

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
