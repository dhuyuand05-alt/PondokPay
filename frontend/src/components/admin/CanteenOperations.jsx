import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { api } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  Empty,
  ErrorNotice,
  Field,
  formatDate,
  formatMoney,
  Loading,
  StatusBadge,
} from '../../ui.jsx';

const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatDateTime = (value) => value ? formatDate(value, true) : '—';

export function CanteenOperations({ token, canteenId, cashiers = [] }) {
  const today = useMemo(localDate, []);
  const [filters, setFilters] = useState({ from: today, to: today, cashier_id: '', product_id: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const query = new URLSearchParams({
    from: applied.from,
    to: applied.to,
    page: String(page),
    limit: '20',
  });
  if (applied.cashier_id) query.set('cashier_id', applied.cashier_id);
  if (applied.product_id) query.set('product_id', applied.product_id);
  const {
    data: report,
    loading: reportLoading,
    error: reportError,
    refresh: refreshReport,
  } = useApiData(`/admin/kantin/${canteenId}/laporan?${query}`, token);
  const { data: productData, error: productError } = useApiData(
    `/admin/kantin/${canteenId}/produk`,
    token,
  );
  const {
    data: shiftData,
    loading: shiftsLoading,
    error: shiftsError,
    refresh: refreshShifts,
  } = useApiData(`/admin/kantin/${canteenId}/giliran?limit=10`, token);
  const products = productData?.data || [];
  const rows = report?.data || [];
  const totalPages = Math.max(
    1,
    Math.ceil(Number(report?.pagination?.total || 0) / Number(report?.pagination?.limit || 20)),
  );

  const applyFilters = (event) => {
    event.preventDefault();
    setPage(1);
    setApplied({ ...filters });
  };

  const exportCsv = async () => {
    setBusy(true);
    setErrorMessage('');
    try {
      const exportQuery = new URLSearchParams({
        from: applied.from,
        to: applied.to,
        format: 'csv',
      });
      if (applied.cashier_id) exportQuery.set('cashier_id', applied.cashier_id);
      if (applied.product_id) exportQuery.set('product_id', applied.product_id);
      await api.download(
        `/admin/kantin/${canteenId}/laporan?${exportQuery}`,
        token,
        `laporan-kantin-${applied.from}-${applied.to}.csv`,
      );
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 space-y-4">
      <div className="card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Analisis & rekonsiliasi</p>
            <h2 className="mt-1 text-lg font-semibold">Laporan penjualan</h2>
            <p className="mt-1 text-xs text-muted">Penjualan dan refund dihitung bersih; margin memakai snapshot HPP pada saat penjualan.</p>
          </div>
          <button className="btn-secondary !min-h-10 !py-2" type="button" disabled={busy} onClick={exportCsv}>
            <Download size={16} />{busy ? 'Menyiapkan...' : 'Ekspor CSV'}
          </button>
        </div>
        <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" onSubmit={applyFilters}>
          <Field label="Dari tanggal" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} required />
          <Field label="Sampai tanggal" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} required />
          <label className="block">
            <span className="label">Kasir</span>
            <select className="field" value={filters.cashier_id} onChange={(event) => setFilters({ ...filters, cashier_id: event.target.value })}>
              <option value="">Semua kasir</option>
              {cashiers.map((cashier) => <option key={cashier.id} value={cashier.id}>{cashier.username}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Produk</span>
            <select className="field" value={filters.product_id} onChange={(event) => setFilters({ ...filters, product_id: event.target.value })}>
              <option value="">Semua produk</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.nama}</option>)}
            </select>
          </label>
          <button className="btn-primary self-end !min-h-11 !py-2" type="submit">Terapkan filter</button>
        </form>
        {applied.product_id && (
          <p className="mt-2 text-[11px] text-muted">
            Filter produk mencocokkan transaksi terkait; nominal menampilkan nilai transaksi penuh.
          </p>
        )}
        {(errorMessage || productError) && <Alert type="error" className="mt-4">{errorMessage || productError}</Alert>}
        <ErrorNotice error={reportError} onRetry={refreshReport} />
        {reportLoading ? <Loading /> : (
          <>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ['Penjualan kotor', formatMoney(report?.summary?.sales_total || 0)],
                ['Refund', formatMoney(report?.summary?.refunds_total || 0)],
                ['Penjualan bersih', formatMoney(report?.summary?.net_total || 0)],
                ['Transaksi / refund', `${report?.summary?.sales_count || 0} / ${report?.summary?.refunds_count || 0}`],
                ['Laba kotor terukur', formatMoney(report?.summary?.margin?.gross_profit || 0)],
                ['Margin kotor', report?.summary?.margin?.gross_margin_percent === null || report?.summary?.margin?.gross_margin_percent === undefined
                  ? '—'
                  : `${report.summary.margin.gross_margin_percent}%`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-canvas p-3.5">
                  <p className="text-[11px] text-muted">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Margin hanya mencakup item katalog yang memiliki HPP tercatat
              ({report?.summary?.margin?.costed_transactions || 0} transaksi terukur).
              Transaksi lama, transaksi nominal manual, dan stok tanpa biaya yang diketahui tidak dihitung.
              {report?.summary?.margin?.transactions_without_cost
                ? ` ${report.summary.margin.transactions_without_cost} transaksi belum memiliki biaya yang dapat diukur.`
                : ''}
            </p>
            {!rows.length ? <Empty title="Tidak ada transaksi pada periode ini" /> : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[680px] border-collapse text-left">
                  <thead className="table-head">
                    <tr><th className="px-3 py-3">Waktu / ID</th><th className="px-3 py-3">Santri</th><th className="px-3 py-3">Kasir</th><th className="px-3 py-3">Jenis</th><th className="px-3 py-3 text-right">Nominal</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const isRefund = row.tipe_transaksi === 'refund_belanja';
                      return (
                        <tr key={row.id} className="border-t border-line text-xs">
                          <td className="px-3 py-3"><span className="font-semibold">#{row.id}</span><span className="mt-1 block text-[10px] text-muted">{formatDateTime(row.created_at)}</span></td>
                          <td className="px-3 py-3"><span className="font-medium">{row.student_name || '—'}</span><span className="mt-1 block text-[10px] text-muted">{row.nis || ''}</span></td>
                          <td className="px-3 py-3">{row.cashier_username || '—'}</td>
                          <td className="px-3 py-3"><StatusBadge tone={isRefund ? 'amber' : 'green'}>{isRefund ? 'Refund' : 'Penjualan'}</StatusBadge></td>
                          <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold ${isRefund ? 'text-amber-700' : 'text-ink'}`}>{isRefund ? '−' : '+'}{formatMoney(row.jumlah)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {report?.pagination && (
              <div className="mt-3 flex items-center justify-between text-xs text-muted">
                <span>{report.pagination.total} transaksi · halaman {page}/{totalPages}</span>
                <div className="flex gap-2">
                  <button className="btn-secondary !min-h-9 !p-2" disabled={page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</button>
                  <button className="btn-secondary !min-h-9 !p-2" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Berikutnya</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Operasional</p>
            <h2 className="mt-1 text-lg font-semibold">Riwayat giliran kasir</h2>
          </div>
          <button type="button" className="btn-secondary !min-h-9 !p-2" onClick={refreshShifts} aria-label="Muat ulang riwayat giliran"><RefreshCw size={16} /></button>
        </div>
        <ErrorNotice error={shiftsError} onRetry={refreshShifts} />
        {shiftsLoading ? <Loading /> : !shiftData?.data?.length ? <Empty title="Belum ada giliran tercatat" /> : (
          <div className="space-y-2">
            {shiftData.data.map((shift) => (
              <article key={shift.id} className="grid gap-2 rounded-xl bg-canvas p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{shift.cashier_username}</p>
                  <p className="mt-1 text-[10px] text-muted">{formatDateTime(shift.opened_at)} → {formatDateTime(shift.closed_at)}</p>
                  {shift.closing_note && <p className="mt-1 truncate text-[10px] text-muted">{shift.closing_note}</p>}
                </div>
                <div className="text-xs"><span className="text-muted">Transaksi / refund</span><p className="mt-1 font-semibold">{shift.sales_count} / {shift.refunds_count}</p></div>
                <div className="text-left sm:text-right"><StatusBadge tone={shift.status === 'open' ? 'amber' : 'green'}>{shift.status === 'open' ? 'Berlangsung' : 'Ditutup'}</StatusBadge><p className="mt-1 text-xs font-semibold">{formatMoney(shift.net_total)}</p><p className="text-[10px] text-muted">bersih</p></div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
