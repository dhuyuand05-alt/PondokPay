import { useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api, idempotencyKey } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  Empty,
  ErrorNotice,
  formatDate,
  formatMoney,
  Modal,
  MobileLoading,
  StatusBadge,
} from '../../ui.jsx';

export function CashierHistory({ token }) {
  const [canteenId, setCanteenId] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [refundTarget, setRefundTarget] = useState(null);
  const [refundReason, setRefundReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState('');
  const [refundNotice, setRefundNotice] = useState('');
  const refundRequest = useRef(null);
  const refundDraftTransactionId = useRef(null);
  const currentUser = JSON.parse(sessionStorage.getItem('pondokpay.user') || '{}');
  const {
    data: canteenData,
    loading: canteensLoading,
    error: canteenError,
    refresh: refreshCanteens,
  } = useApiData('/kantin', token);
  const canteens = canteenData?.data || [];
  const selectedCanteen = canteens.find((row) => String(row.id) === String(canteenId)) || canteens[0];
  const query = new URLSearchParams({ page: String(page), limit: '20' });
  if (type) query.set('tipe_transaksi', type);
  const path = selectedCanteen ? `/kantin/${selectedCanteen.id}/transaksi?${query}` : '/kantin';
  const { data, loading, error, refresh } = useApiData(path, token);
  const rows = data?.data || [];
  const filteredRows = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return rows;
    return rows.filter((row) => [
      row.transaksi_id,
      row.nama_lengkap,
      row.nis,
      row.keterangan,
      row.tipe_transaksi,
      ...(row.items || []).map((item) => item.nama_produk),
    ].some((field) => String(field || '').toLowerCase().includes(value)));
  }, [rows, search]);
  const totalPages = Math.max(
    1,
    Math.ceil(Number(data?.pagination?.total || 0) / Number(data?.pagination?.limit || 20)),
  );
  const selected = filteredRows.find((row) => row.id === expandedId) || filteredRows[0];

  const openRefund = (row) => {
    if (refundDraftTransactionId.current !== row.transaksi_id) {
      refundDraftTransactionId.current = row.transaksi_id;
      refundRequest.current = null;
      setRefundReason('');
      setRestock(true);
      setRefundError('');
    }
    setRefundTarget(row);
  };

  const submitRefund = async (event) => {
    event.preventDefault();
    if (!refundTarget || !selectedCanteen) return;
    setRefundBusy(true);
    setRefundError('');
    try {
      const payload = {
        reason: refundReason,
        restock: refundTarget.items?.length ? restock : false,
      };
      const signature = JSON.stringify({
        canteenId: selectedCanteen.id,
        transactionId: refundTarget.transaksi_id,
        ...payload,
      });
      if (refundRequest.current?.signature !== signature) {
        refundRequest.current = { signature, key: idempotencyKey() };
      }
      const result = await api.post(
        `/kantin/${selectedCanteen.id}/transaksi/${refundTarget.transaksi_id}/refund`,
        payload,
        token,
        { idempotencyKey: refundRequest.current.key },
      );
      setRefundNotice(result.message);
      setRefundTarget(null);
      setRefundReason('');
      setRestock(true);
      refundRequest.current = null;
      refundDraftTransactionId.current = null;
      refresh();
    } catch (error) {
      setRefundError(error.message);
    } finally {
      setRefundBusy(false);
    }
  };

  if (canteensLoading) return <MobileLoading />;
  if (canteenError) return <ErrorNotice error={canteenError} onRetry={refreshCanteens} />;
  if (!selectedCanteen) return <Empty title="Belum ada kantin" />;

  return (
    <section className="mx-auto max-w-[1360px]">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Riwayat transaksi</h1>
          <p className="mt-1 text-xs text-muted sm:text-sm">Telusuri penjualan, refund, dan pencairan saldo {selectedCanteen.nama}.</p>
        </div>
        {canteens.length > 1 ? (
          <label className="relative block w-full sm:w-56">
            <select className="field !min-h-10 !py-2 pr-9 text-xs" value={selectedCanteen.id} onChange={(event) => {
              setCanteenId(event.target.value);
              setPage(1);
              setExpandedId(null);
            }}>
              {canteens.map((canteen) => <option key={canteen.id} value={canteen.id}>{canteen.nama}</option>)}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-muted" />
          </label>
        ) : (
          <div className="hidden items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs font-semibold sm:flex">
            <CalendarDays size={15} className="text-pondok-700" />
            {formatDate(new Date())}
          </div>
        )}
      </header>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_365px] xl:items-start">
        <div className="min-w-0">
          <div className="card mb-3 space-y-3 p-3 sm:p-4">
            <label className="relative block">
              <Search size={16} className="absolute left-3.5 top-3.5 text-muted" />
              <input
                className="field !min-h-11 !py-2.5 pl-10"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari ID transaksi, nama, atau NIS santri"
                aria-label="Cari transaksi"
              />
            </label>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
              {[
                ['', 'Semua transaksi'],
                ['penjualan', 'Penjualan'],
                ['refund', 'Refund'],
                ['pencairan', 'Pencairan'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={type === value}
                  className={`min-h-9 shrink-0 rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pondok-200 ${type === value ? 'border-pondok-700 bg-pondok-700 text-white' : 'border-line bg-white text-muted hover:border-pondok-200 hover:text-pondok-700'}`}
                  onClick={() => {
                    setType(value);
                    setPage(1);
                    setExpandedId(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <MobileLoading />
          ) : error ? (
            <ErrorNotice error={error} onRetry={refresh} />
          ) : !filteredRows.length ? (
            <div className="card">
              <Empty
                title={rows.length ? 'Transaksi tidak ditemukan' : 'Belum ada transaksi'}
                description={rows.length ? 'Coba kata kunci lain. Pencarian mencakup halaman yang sedang dibuka.' : 'Transaksi kantin yang tercatat akan tampil di sini.'}
              />
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-xl border border-line bg-white md:block">
                <div className="grid grid-cols-[80px_minmax(0,1fr)_110px_120px] bg-[#f5f5f1] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  <span>ID / waktu</span><span>Santri</span><span>Jenis</span><span className="text-right">Nominal</span>
                </div>
                {filteredRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setExpandedId(row.id)}
                    className={`grid w-full grid-cols-[80px_minmax(0,1fr)_110px_120px] items-center gap-2 border-t border-line px-4 py-3 text-left transition ${selected?.id === row.id ? 'bg-[#eaf5ef]' : 'hover:bg-canvas'}`}
                  >
                    <span><span className="block text-xs font-semibold text-pondok-700">#{row.transaksi_id || row.id}</span><span className="mt-1 block text-[10px] text-muted">{formatDate(row.created_at, true)}</span></span>
                    <span className="min-w-0"><span className="block truncate text-xs font-semibold">{row.nama_lengkap || 'Pencairan saldo'}</span><span className="mt-1 block truncate text-[10px] text-muted">{row.nis || 'Oleh admin'}</span></span>
                    <StatusBadge tone={row.tipe_transaksi === 'penjualan' ? 'green' : row.tipe_transaksi === 'refund' ? 'red' : 'amber'}>{row.tipe_transaksi === 'penjualan' ? 'Penjualan' : row.tipe_transaksi === 'refund' ? 'Refund' : 'Pencairan'}</StatusBadge>
                    <span className={`text-right text-xs font-semibold ${row.tipe_transaksi === 'refund' ? 'text-red-600' : ''}`}>{row.tipe_transaksi === 'refund' ? '−' : ''}{formatMoney(row.jumlah)}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-2.5 md:hidden">
                {filteredRows.map((row) => {
                  const expanded = selected?.id === row.id;
                  return (
                    <article key={row.id} className="overflow-hidden rounded-2xl border border-line bg-white">
                      <button type="button" className="w-full p-3.5 text-left" onClick={() => setExpandedId(expanded ? null : row.id)}>
                        <div className="flex items-center justify-between gap-3">
                          <StatusBadge tone={row.tipe_transaksi === 'penjualan' ? 'green' : row.tipe_transaksi === 'refund' ? 'red' : 'amber'}>{row.tipe_transaksi === 'penjualan' ? 'Penjualan' : row.tipe_transaksi === 'refund' ? 'Refund' : 'Pencairan'}</StatusBadge>
                          <span className="text-[10px] text-muted">#{row.transaksi_id || row.id} · {formatDate(row.created_at, true)}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{row.nama_lengkap || 'Pencairan saldo'}</p>
                            <p className="mt-0.5 text-[10px] text-muted">{row.nis || 'Oleh admin'}</p>
                          </div>
                          <span className={`shrink-0 text-base font-semibold ${row.tipe_transaksi === 'refund' ? 'text-red-600' : ''}`}>{row.tipe_transaksi === 'refund' ? '−' : ''}{formatMoney(row.jumlah)}</span>
                        </div>
                        <p className="mt-2 flex items-center justify-center gap-1 text-[10px] font-medium text-pondok-700">
                          {expanded ? 'Tutup rincian' : 'Lihat rincian'} <ChevronDown size={13} className={expanded ? 'rotate-180' : ''} />
                        </p>
                      </button>
                      {expanded && <TransactionDetails row={row} currentUser={currentUser} onRefund={openRefund} />}
                    </article>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
                <span>Halaman {page} · {data?.pagination?.total || 0} transaksi</span>
                <div className="flex gap-2">
                  <button className="btn-secondary !min-h-8 !rounded-lg !p-1.5" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label="Sebelumnya"><ChevronLeft size={16} /></button>
                  <button className="btn-secondary !min-h-8 !rounded-lg !p-1.5" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} aria-label="Berikutnya"><ChevronRight size={16} /></button>
                </div>
              </div>
            </>
          )}
          <p className="mt-3 hidden rounded-xl bg-[#eaf5ef] p-3 text-[11px] text-[#176b50] lg:block">
            Pencairan dilakukan admin setelah persetujuan kasir dan tidak terkait dengan santri.
          </p>
        </div>
        {selected && (
          <aside className="card sticky top-20 hidden p-4 xl:block">
            <h2 className="text-sm font-semibold">Detail transaksi</h2>
            <TransactionDetails row={selected} currentUser={currentUser} onRefund={openRefund} />
          </aside>
        )}
      </div>
      {refundNotice && <Alert type="success" className="mt-4">{refundNotice}</Alert>}
      {refundTarget && (
        <Modal title={`Refund transaksi #${refundTarget.transaksi_id}`} onClose={() => !refundBusy && setRefundTarget(null)}>
          <form className="space-y-3" onSubmit={submitRefund}>
            <Alert type="warning">
              Refund penuh sebesar {formatMoney(refundTarget.jumlah)} akan dikreditkan kembali ke saldo santri. Proses ini tidak dapat dibatalkan dan tidak mengeluarkan uang tunai.
            </Alert>
            {refundTarget.items?.length > 0 && (
              <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
                <input className="mt-1" type="checkbox" checked={restock} onChange={(event) => setRestock(event.target.checked)} />
                <span><span className="font-semibold">Barang dikembalikan dan layak dijual</span><span className="mt-1 block text-xs text-muted">Stok produk akan ditambah kembali dan dicatat di riwayat stok.</span></span>
              </label>
            )}
            <label className="block">
              <span className="label">Alasan refund</span>
              <textarea className="field min-h-24" minLength={5} maxLength={500} value={refundReason} onChange={(event) => setRefundReason(event.target.value)} required />
            </label>
            {refundError && <Alert type="error">{refundError}</Alert>}
            <button className="btn-primary w-full" disabled={refundBusy || refundReason.trim().length < 5}>
              {refundBusy ? 'Memproses refund...' : 'Konfirmasi refund penuh'}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}

function TransactionDetails({ row, currentUser, onRefund }) {
  const isSale = row.tipe_transaksi === 'penjualan';
  const isRefund = row.tipe_transaksi === 'refund';
  const itemCount = (row.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  return (
    <div className="border-t border-line px-3.5 py-3">
      <div className="flex items-center justify-between">
        <StatusBadge tone={isSale ? 'green' : isRefund ? 'red' : 'amber'}>{isSale ? 'Penjualan berhasil' : isRefund ? 'Refund berhasil' : 'Pencairan saldo'}</StatusBadge>
        <span className="text-[10px] text-muted">#{row.transaksi_id || row.id}</span>
      </div>
      <p className={`mt-2 text-2xl font-semibold ${isRefund ? 'text-red-600' : ''}`}>{isRefund ? '−' : ''}{formatMoney(row.jumlah)}</p>
      <p className="mt-0.5 text-[10px] text-muted">{formatDate(row.created_at, true)}</p>
      <div className="my-3 border-t border-line" />
      <Detail label="Santri" value={row.nama_lengkap || 'Tanpa santri'} />
      {row.nis && <Detail label="NIS" value={row.nis} />}
      <Detail label="Kantin" value={row.kantin_nama || 'Kantin'} />
      {row.items?.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 text-xs font-semibold">Rincian belanja · {itemCount} item</p>
          {row.items.map((item, index) => (
            <div key={`${item.transaksi_id}-${index}`} className="flex justify-between gap-3 py-1.5 text-xs">
              <span className="min-w-0"><span className="block truncate">{item.nama_produk}</span><span className="text-[10px] text-muted">{item.quantity} × {formatMoney(item.harga_satuan)}</span></span>
              <span className="shrink-0 font-medium">{formatMoney(item.subtotal)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="my-3 border-t border-line" />
      <Detail label="Total transaksi" value={formatMoney(row.jumlah)} />
      <Detail label="Saldo akhir kantin" value={formatMoney(row.saldo_akhir)} />
      {row.keterangan && <div className="mt-3 rounded-lg bg-[#f5f5f1] p-2.5"><p className="text-[10px] text-muted">Keterangan</p><p className="mt-1 text-xs">{row.keterangan}</p></div>}
      {isRefund && row.refund_reason && <div className="mt-3 rounded-lg bg-amber-50 p-2.5"><p className="text-[10px] text-amber-800">Alasan refund</p><p className="mt-1 text-xs text-amber-900">{row.refund_reason}</p></div>}
      {isSale && row.refund_id && <Alert type="warning" className="mt-3">Transaksi ini sudah direfund penuh.</Alert>}
      {isSale && !row.refund_id && Number(row.cashier_id) === Number(currentUser.id) && (
        <button type="button" className="btn-secondary mt-3 w-full !min-h-10 !py-2 text-red-700" onClick={() => onRefund(row)}>
          Proses refund penuh
        </button>
      )}
      {!isSale && !isRefund && <p className="mt-3 text-[10px] leading-relaxed text-muted">Pencairan dilakukan admin setelah memperoleh persetujuan kasir.</p>}
    </div>
  );
}

function Detail({ label, value }) {
  return <div className="flex items-center justify-between gap-3 py-1.5 text-xs"><span className="text-muted">{label}</span><span className="text-right font-medium">{value}</span></div>;
}
