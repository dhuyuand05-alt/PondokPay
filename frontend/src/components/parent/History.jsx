import { useState } from 'react';
import { useApiData } from '../../hooks.js';
import {
  Avatar,
  Empty,
  ErrorNotice,
  formatDate,
  formatMoney,
  MobileLoading,
  MobileTop,
  TransactionMark,
} from '../../ui.jsx';
import { typeName } from './shared.jsx';

export function ParentHistory({ token }) {
  const [childId, setChildId] = useState(sessionStorage.getItem('pondokpay.selected_child') || '');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const {
    data: profileData,
    loading: profileLoading,
    error: profileError,
    refresh: refreshProfile,
  } = useApiData('/wali/me', token);
  const children = profileData?.data?.children || [];
  const selectedId = children.some((child) => String(child.id) === String(childId))
    ? childId
    : String(children[0]?.id || '');
  const child = children.find((item) => String(item.id) === String(selectedId));
  const query = new URLSearchParams({ page: String(page), limit: '20' });
  if (type) query.set('tipe_transaksi', type);
  const {
    data: history,
    loading,
    error,
    refresh,
  } = useApiData(child ? `/wali/anak/${child.id}/transaksi?${query}` : '/wali/anak', token);
  const choose = (value) => {
    setChildId(value);
    sessionStorage.setItem('pondokpay.selected_child', value);
    setPage(1);
  };
  if (profileLoading) return <MobileLoading />;
  if (profileError) return <ErrorNotice error={profileError} onRetry={refreshProfile} />;
  if (!child) return <Empty title="Belum ada anak terhubung" />;
  const rows = history?.data || [];
  const totalPages = Math.max(
    1,
    Math.ceil(Number(history?.pagination?.total || 0) / Number(history?.pagination?.limit || 20)),
  );
  return (
    <div className="space-y-4">
      <MobileTop title="Aktivitas" subtitle="Pantau semua transaksi anak dengan mudah." />
      {children.length > 1 && (
        <label className="block">
          <span className="label">Akun anak</span>
          <select className="field" value={selectedId} onChange={(e) => choose(e.target.value)}>
            {children.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nama_lengkap} · {item.nis}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-center gap-2.5 rounded-xl border border-line/70 bg-white p-3">
        <Avatar name={child.nama_lengkap} className="h-9 w-9 bg-pondok-700 text-xs text-white" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{child.nama_lengkap}</p>
          <p className="truncate text-xs text-muted">
            {child.nis} · {child.asrama || 'Santri'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted">Saldo</p>
          <p className="mt-0.5 text-xs font-semibold tabular-nums">{formatMoney(child.saldo)}</p>
        </div>
      </div>
      <div className="flex gap-1.5 rounded-xl bg-white p-1">
        {[
          ['', 'Semua'],
          ['belanja', 'Belanja'],
          ['topup', 'Top up'],
          ['tarik', 'Tarik'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={`min-h-9 min-w-0 flex-1 rounded-lg px-1 text-[11px] font-semibold transition ${type === value ? 'bg-pondok-700 text-white shadow-sm' : 'text-muted'}`}
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
          description="Riwayat transaksi anak akan tampil setelah transaksi tercatat."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line/70 bg-white">
          {rows.map((item, index) => (
            <article
              key={item.id}
              className={`flex items-center gap-2.5 px-3 py-3 ${index < rows.length - 1 ? 'border-b border-line/70' : ''}`}
            >
              <TransactionMark type={item.tipe_transaksi} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">
                  {item.keterangan ||
                    (item.tipe_transaksi === 'belanja'
                      ? 'Belanja santri'
                      : typeName(item.tipe_transaksi))}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-muted">
                  {formatDate(item.created_at, true)} · {item.nama_kantin || 'Admin pondok'}
                </p>
              </div>
              <p
                className={`whitespace-nowrap text-xs font-semibold tabular-nums ${['topup', 'refund_belanja'].includes(item.tipe_transaksi) ? 'text-pondok-600' : 'text-ink'}`}
              >
                {['topup', 'refund_belanja'].includes(item.tipe_transaksi) ? '+' : '−'}
                {formatMoney(item.jumlah)}
              </p>
            </article>
          ))}
        </div>
      )}
      {history?.pagination && (
        <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5 text-xs text-muted">
          <span>
            {history.pagination.total} transaksi · {page}/{totalPages}
          </span>
          <div className="flex gap-2">
            <button
              className="grid h-9 w-9 place-items-center rounded-lg border border-line disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              aria-label="Halaman sebelumnya"
            >
              ‹
            </button>
            <button
              className="grid h-9 w-9 place-items-center rounded-lg border border-line disabled:opacity-40"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              aria-label="Halaman berikutnya"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
