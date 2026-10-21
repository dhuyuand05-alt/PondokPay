import { useState } from 'react';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  Empty,
  ErrorNotice,
  formatDate,
  formatMoney,
  MobileLoading,
  MobileTop,
  TransactionMark,
} from '../../ui.jsx';

export function CashierHistory({ token }) {
  const [canteenId, setCanteenId] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const {
    data: canteenData,
    loading: canteensLoading,
    error: canteenError,
    refresh: refreshCanteens,
  } = useApiData('/kantin', token);
  const canteens = canteenData?.data || [];
  const selected = canteens.find((row) => String(row.id) === String(canteenId)) || canteens[0];
  const query = new URLSearchParams({ page: String(page), limit: '20' });
  if (type) query.set('tipe_transaksi', type);
  const path = selected ? `/kantin/${selected.id}/transaksi?${query}` : '/kantin';
  const { data, loading, error, refresh } = useApiData(path, token);
  if (canteensLoading) return <MobileLoading />;
  if (canteenError) return <ErrorNotice error={canteenError} onRetry={refreshCanteens} />;
  if (!selected) return <Empty title="Belum ada kantin" />;
  const rows = data?.data || [];
  const totalPages = Math.max(
    1,
    Math.ceil(Number(data?.pagination?.total || 0) / Number(data?.pagination?.limit || 20)),
  );
  return (
    <div>
      <MobileTop
        title="Riwayat kantin"
        subtitle={`${selected.nama} · Saldo ${formatMoney(selected.saldo)}`}
      />
      <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-white p-1">
        {[
          ['', 'Semua'],
          ['penjualan', 'Penjualan'],
          ['pencairan', 'Pencairan'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={`rounded-lg px-2 py-3 text-xs font-semibold ${type === value ? 'bg-pondok-600 text-white' : 'text-muted'}`}
            onClick={() => {
              setType(value);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <MobileLoading />
      ) : error ? (
        <ErrorNotice error={error} onRetry={refresh} />
      ) : !rows.length ? (
        <Empty
          title="Belum ada transaksi"
          description="Transaksi kantin yang tercatat akan tampil di sini."
        />
      ) : (
        <div className="space-y-5">
          {rows.map((item) => (
            <article key={item.id} className="flex items-center gap-3 border-b border-line pb-3">
              <TransactionMark type={item.tipe_transaksi} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {item.tipe_transaksi === 'pencairan'
                    ? 'Pencairan oleh admin'
                    : `${item.nama_lengkap || 'Santri'} · #${item.transaksi_id || item.id}`}
                </p>
                <p className="truncate text-xs text-muted">
                  {formatDate(item.created_at, true)} · {item.keterangan || 'Transaksi selesai'}
                </p>
              </div>
              <p
                className={`whitespace-nowrap text-sm font-semibold ${item.tipe_transaksi === 'penjualan' ? 'text-pondok-600' : ''}`}
              >
                {item.tipe_transaksi === 'penjualan' ? '+' : '−'}
                {formatMoney(item.jumlah)}
              </p>
            </article>
          ))}
        </div>
      )}
      {data?.pagination && (
        <div className="mt-5 flex items-center justify-between text-sm text-muted">
          <span>
            {data.pagination.total} transaksi · {page}/{totalPages}
          </span>
          <div className="flex gap-4">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Sebelumnya">
              ‹
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              aria-label="Berikutnya"
            >
              ›
            </button>
          </div>
        </div>
      )}
      <Alert className="mt-6">
        Pencairan ditangani admin pondok. Kasir hanya melihat riwayat kantin yang ditugaskan.
      </Alert>
    </div>
  );
}
