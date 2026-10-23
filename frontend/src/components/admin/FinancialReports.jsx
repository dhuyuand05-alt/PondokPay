import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { api } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  Empty,
  ErrorNotice,
  Field,
  formatMoney,
  Loading,
  PageHeader,
  SelectField,
} from '../../ui.jsx';
import { StudentSearchPicker, Table } from './shared.jsx';

const localDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const today = new Date();
const initialFilters = {
  start_date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`,
  end_date: localDate(today),
  santri_id: '',
  kantin_id: '',
};

const makeQuery = (filters) => {
  const params = new URLSearchParams({
    start_date: filters.start_date,
    end_date: filters.end_date,
  });
  if (filters.santri_id) params.set('santri_id', filters.santri_id);
  if (filters.kantin_id) params.set('kantin_id', filters.kantin_id);
  return params.toString();
};

const ReportStat = ({ label, value, detail }) => (
  <div className="card p-4">
    <p className="text-sm text-muted">{label}</p>
    <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
    {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
  </div>
);

function SpendingChart({ values }) {
  if (!values?.length) return <Empty title="Belum ada tren belanja" />;
  const width = 740;
  const height = 180;
  const padding = 16;
  const max = Math.max(...values.map((row) => Number(row.spending_total)), 1);
  const points = values.map((row, index) => {
    const x = values.length === 1
      ? width / 2
      : padding + (index * (width - padding * 2)) / (values.length - 1);
    const y = height - padding - (Number(row.spending_total) / max) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');
  const markerIndexes = [0, Math.floor((values.length - 1) / 2), values.length - 1];

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Tren belanja harian</h2>
          <p className="mt-1 text-sm text-muted">Total nominal belanja per hari dalam periode terpilih.</p>
        </div>
        <p className="text-sm font-semibold">{formatMoney(values.reduce((sum, row) => sum + Number(row.spending_total), 0))}</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <svg
          className="h-48 min-w-[640px] w-full"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Grafik tren belanja ${values.length} hari`}
        >
          {[0, 0.5, 1].map((fraction) => {
            const y = padding + fraction * (height - padding * 2);
            return <line key={fraction} x1={padding} x2={width - padding} y1={y} y2={y} stroke="#e5ece8" strokeWidth="1" />;
          })}
          {values.some((row) => Number(row.spending_total) > 0) && (
            <polyline points={points} fill="none" stroke="#16714e" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          )}
          {values.length <= 45 && values.map((row, index) => {
            const [cx, cy] = points.split(' ')[index].split(',');
            return Number(row.spending_total) > 0
              ? <circle key={row.period} cx={cx} cy={cy} r="3" fill="#16714e" />
              : null;
          })}
        </svg>
        <div className="flex justify-between px-1 text-xs text-muted">
          {markerIndexes.filter((value, index, list) => list.indexOf(value) === index).map((index) => (
            <span key={values[index].period}>{values[index].period}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminFinancialReports({ token }) {
  const [filters, setFilters] = useState({ ...initialFilters });
  const [applied, setApplied] = useState({ ...initialFilters });
  const [filterError, setFilterError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState('');
  const query = useMemo(() => makeQuery(applied), [applied]);
  const {
    data: reportResponse,
    loading,
    error,
    refresh,
  } = useApiData(`/admin/reports/financial?${query}`, token);
  const { data: canteenResponse, error: canteenError } = useApiData('/admin/kantin', token);
  const report = reportResponse?.data;
  const canteens = canteenResponse?.data || [];

  const applyFilters = (event) => {
    event.preventDefault();
    setFilterError('');
    if (!filters.start_date || !filters.end_date) {
      setFilterError('Pilih tanggal awal dan akhir laporan.');
      return;
    }
    if (filters.start_date > filters.end_date) {
      setFilterError('Tanggal awal tidak boleh melewati tanggal akhir.');
      return;
    }
    const start = new Date(`${filters.start_date}T00:00:00`);
    const end = new Date(`${filters.end_date}T00:00:00`);
    if ((end - start) / 86400000 > 365) {
      setFilterError('Rentang laporan maksimal 366 hari.');
      return;
    }
    setApplied({ ...filters });
  };

  const downloadReport = async (format) => {
    setDownloading(format);
    setDownloadError('');
    try {
      await api.download(
        `/admin/reports/financial/export.${format}?${makeQuery(applied)}`,
        token,
        `laporan-finansial.${format}`,
      );
    } catch (downloadRequestError) {
      setDownloadError(downloadRequestError.message);
    } finally {
      setDownloading('');
    }
  };

  return (
    <>
      <PageHeader
        title="Laporan finansial"
        subtitle="Rekap transaksi santri dan kantin, pantau tren belanja, lalu unduh laporan administrasi."
        action={(
          <button className="btn-secondary" type="button" disabled={loading} onClick={refresh}>
            <RefreshCw size={17} />Muat ulang
          </button>
        )}
      />
      <form className="card mb-5 grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr_1fr_auto]" onSubmit={applyFilters}>
        <Field
          label="Tanggal awal"
          type="date"
          value={filters.start_date}
          onChange={(event) => setFilters((current) => ({ ...current, start_date: event.target.value }))}
          required
        />
        <Field
          label="Tanggal akhir"
          type="date"
          value={filters.end_date}
          onChange={(event) => setFilters((current) => ({ ...current, end_date: event.target.value }))}
          required
        />
        <StudentSearchPicker
          token={token}
          value={filters.santri_id}
          onChange={(santri_id) => setFilters((current) => ({ ...current, santri_id }))}
          label="Santri (opsional)"
        />
        <SelectField
          label="Kantin (opsional)"
          value={filters.kantin_id}
          onChange={(event) => setFilters((current) => ({ ...current, kantin_id: event.target.value }))}
        >
          <option value="">Semua kantin</option>
          {canteens.map((canteen) => <option key={canteen.id} value={canteen.id}>{canteen.nama}</option>)}
        </SelectField>
        <button className="btn-primary self-end" type="submit">Terapkan</button>
        {canteenError && <p className="text-sm text-red-700 md:col-span-2 xl:col-span-5">{canteenError}</p>}
        {filterError && <div className="md:col-span-2 xl:col-span-5"><Alert type="error">{filterError}</Alert></div>}
      </form>

      {downloadError && <Alert type="error" className="mb-4">{downloadError}</Alert>}
      {report && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Periode {report.period.start_date} – {report.period.end_date}
            {report.filters.santri_id ? ` · Santri ID ${report.filters.santri_id}` : ''}
            {report.filters.kantin_id ? ` · Kantin ID ${report.filters.kantin_id}` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" type="button" disabled={Boolean(downloading)} onClick={() => downloadReport('csv')}>
              <FileSpreadsheet size={17} />{downloading === 'csv' ? 'Menyiapkan CSV...' : 'Unduh CSV'}
            </button>
            <button className="btn-primary" type="button" disabled={Boolean(downloading)} onClick={() => downloadReport('pdf')}>
              <FileText size={17} />{downloading === 'pdf' ? 'Menyiapkan PDF...' : 'Unduh PDF'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <Loading label="Menyiapkan laporan finansial..." />
      ) : error ? (
        <ErrorNotice error={error} onRetry={refresh} />
      ) : report ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <ReportStat label="Jumlah transaksi" value={Number(report.summary.transaction_count).toLocaleString('id-ID')} detail={`${Number(report.summary.student_count).toLocaleString('id-ID')} santri tercatat`} />
            <ReportStat label="Total belanja" value={formatMoney(report.summary.spending_total)} />
            <ReportStat label="Total top-up" value={formatMoney(report.summary.topup_total)} />
            <ReportStat label="Total penarikan" value={formatMoney(report.summary.withdrawal_total)} />
            <ReportStat label="Biaya layanan" value={formatMoney(report.summary.service_fee_total)} />
          </div>

          <SpendingChart values={report.spending_trend} />

          <section>
            <h2 className="mb-3 text-lg font-semibold">Rekap transaksi per santri</h2>
            <Table
              headers={['Santri', 'Transaksi', 'Belanja', 'Top-up', 'Penarikan', 'Biaya layanan']}
              loading={false}
              empty={{ title: 'Tidak ada transaksi santri pada periode ini' }}
            >
              {report.students.map((student) => (
                <tr key={student.santri_id}>
                  <td className="table-cell"><p className="font-semibold">{student.nama_lengkap}</p><p className="text-xs text-muted">{student.nis}</p></td>
                  <td className="table-cell">{Number(student.transaction_count).toLocaleString('id-ID')}</td>
                  <td className="table-cell whitespace-nowrap">{formatMoney(student.spending_total)}</td>
                  <td className="table-cell whitespace-nowrap">{formatMoney(student.topup_total)}</td>
                  <td className="table-cell whitespace-nowrap">{formatMoney(student.withdrawal_total)}</td>
                  <td className="table-cell whitespace-nowrap">{formatMoney(student.service_fee_total)}</td>
                </tr>
              ))}
            </Table>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Rekap belanja per kantin</h2>
            <Table
              headers={['Kantin', 'Lokasi', 'Transaksi belanja', 'Total belanja']}
              loading={false}
              empty={{ title: 'Tidak ada transaksi kantin pada periode ini' }}
            >
              {report.canteens.map((canteen) => (
                <tr key={canteen.kantin_id}>
                  <td className="table-cell font-semibold">{canteen.nama_kantin}</td>
                  <td className="table-cell">{canteen.lokasi || '—'}</td>
                  <td className="table-cell">{Number(canteen.transaction_count).toLocaleString('id-ID')}</td>
                  <td className="table-cell whitespace-nowrap font-semibold">{formatMoney(canteen.spending_total)}</td>
                </tr>
              ))}
            </Table>
          </section>

          <Alert>
            Laporan hanya menampilkan transaksi tercatat pada periode dan filter terpilih. Ekspor CSV berisi ringkasan, rekap per santri, rekap per kantin, dan tren harian.
          </Alert>
        </div>
      ) : null}
    </>
  );
}
