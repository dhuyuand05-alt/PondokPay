import pool from '../../config/db.js';

const parsePositiveId = (value, label) => {
  if (value === undefined || value === '') return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new FinancialReportValidationError(`${label} tidak valid.`);
  }
  return id;
};

export class FinancialReportValidationError extends Error {}

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
