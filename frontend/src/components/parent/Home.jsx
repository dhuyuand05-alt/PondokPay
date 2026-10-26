import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, SlidersHorizontal, Wallet } from 'lucide-react';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  AmountLine,
  Avatar,
  Empty,
  ErrorNotice,
  formatDate,
  formatMoney,
  MobileLoading,
  StatusBadge,
  TransactionMark,
} from '../../ui.jsx';
import { selectedChildId } from './shared.jsx';

export function ParentHome({ token }) {
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useApiData('/wali/me', token);
  const children = data?.data?.children || [];
  const [activeId, setActiveId] = useState('');
  const childId = children.some((item) => String(item.id) === String(activeId))
    ? activeId
    : selectedChildId(children);
  const child = children.find((item) => String(item.id) === String(childId));
  const {
    data: transactionData,
    loading: transactionsLoading,
    error: transactionError,
    refresh: refreshTransactions,
  } = useApiData(child ? `/wali/anak/${child.id}/transaksi?limit=4` : '/wali/anak', token);

  const selectChild = (id) => {
    setActiveId(String(id));
    sessionStorage.setItem('pondokpay.selected_child', String(id));
  };
  const openLimit = () => {
    if (child) {
      sessionStorage.setItem('pondokpay.selected_child', String(child.id));
      navigate('/wali/limit');
    }
  };
  const openHistory = () => {
    if (child) sessionStorage.setItem('pondokpay.selected_child', String(child.id));
    navigate('/wali/history');
  };
  const openTopup = () => {
    if (child) sessionStorage.setItem('pondokpay.selected_child', String(child.id));
    navigate('/wali/topup');
  };

  if (loading) return <MobileLoading />;
  if (error) return <ErrorNotice error={error} onRetry={refresh} />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1 py-1">
        <div>
          <p className="text-xs text-muted">Assalamu’alaikum,</p>
          <h1 className="mt-0.5 text-lg font-semibold">{data?.data?.username || 'Wali santri'}</h1>
        </div>
        <span className="rounded-full bg-pondok-50 px-2.5 py-1 text-[11px] font-semibold text-pondok-700">
          {children.length} anak
        </span>
      </div>
      {!children.length ? (
        <Empty
          title="Belum ada anak terhubung"
          description="Hubungi admin pondok untuk menghubungkan akun wali dengan santri."
        />
      ) : (
        <>
          {children.length > 1 ? (
            <label className="block">
              <span className="label">Pantau akun anak</span>
              <select
                className="field !py-2.5"
                value={childId}
                onChange={(event) => selectChild(event.target.value)}
              >
                {children.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nama_lengkap} · {item.nis}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            child && (
              <div className="flex items-center gap-2.5 rounded-xl border border-line/70 bg-white px-3 py-2.5">
                <Avatar name={child.nama_lengkap} className="h-9 w-9 bg-pondok-50 text-xs" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{child.nama_lengkap}</p>
                  <p className="truncate text-xs text-muted">
                    {child.nis} · {child.asrama || 'Santri'}
                  </p>
                </div>
                <span className="ml-auto badge-green">Aktif</span>
              </div>
            )
          )}
          {child && (
            <>
              <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-pondok-800 to-pondok-700 p-4 text-white shadow-[0_10px_24px_rgba(7,87,70,0.14)]">
                <div className="absolute -right-7 -top-10 h-28 w-28 rounded-full border-[18px] border-white/5" />
                <div className="relative flex items-start justify-between">
                  <div>
                    <p className="text-xs text-white/70">Saldo tersedia</p>
                    <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
                      {formatMoney(child.saldo)}
                    </p>
                  </div>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10">
                    <Wallet size={18} />
                  </span>
                </div>
                <div className="relative mt-4 flex items-center justify-between border-t border-white/15 pt-2.5 text-[11px] text-white/75">
                  <span className="truncate">
                    {child.nama_lengkap} · {child.asrama || 'Santri'}
                  </span>
                  <span className="shrink-0">{child.nis}</span>
                </div>
              </section>
              <section className="card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Belanja hari ini</p>
                    <p className="text-[11px] text-muted">{formatDate(new Date())}</p>
                  </div>
                  <p className="text-right text-sm font-semibold tabular-nums">
                    {formatMoney(child.belanja_hari_ini)}
                    <span className="block text-[11px] font-normal text-muted">
                      dari {formatMoney(child.limit_harian)}
                    </span>
                  </p>
                </div>
                <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-pondok-100">
                  <div
                    className="h-full rounded-full bg-pondok-600 transition-all"
                    style={{
                      width: `${Math.min(100, Number(child.limit_harian) > 0 ? (Number(child.belanja_hari_ini) / Number(child.limit_harian)) * 100 : 0)}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted">
                    Sisa limit{' '}
                    <span className="font-semibold text-ink">
                      {formatMoney(child.sisa_limit_harian)}
                    </span>
                  </p>
                  <button
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-pondok-700 hover:bg-pondok-50"
                    onClick={openLimit}
                  >
                    <SlidersHorizontal size={14} />
                    Atur limit
                    <ArrowRight size={14} />
                  </button>
                </div>
              </section>
              <section>
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold">Transaksi terbaru</h2>
                  <button
                    className="inline-flex items-center gap-1 text-xs font-semibold text-pondok-600"
                    onClick={openHistory}
                  >
                    Lihat semua
                    <ArrowRight size={14} />
                  </button>
                </div>
                {transactionsLoading ? (
                  <MobileLoading />
                ) : transactionError ? (
                  <ErrorNotice error={transactionError} onRetry={refreshTransactions} />
                ) : (transactionData?.data || []).length === 0 ? (
                  <p className="rounded-xl border border-line/70 bg-white p-3 text-sm text-muted">
                    Belum ada transaksi tercatat.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-line/70 bg-white">
                    {transactionData.data.slice(0, 4).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2.5 border-b border-line/70 px-3 py-2.5 last:border-0"
                      >
                        <TransactionMark type={item.tipe_transaksi} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold">
                            {item.keterangan ||
                              (item.tipe_transaksi === 'belanja'
                                ? 'Belanja santri'
                                : 'Top up saldo')}
                          </p>
                          <p className="mt-0.5 truncate text-[10px] text-muted">
                            {formatDate(item.created_at, true)} ·{' '}
                            {item.nama_kantin || 'Admin pondok'}
                          </p>
                        </div>
                        <p
                          className={`whitespace-nowrap text-xs font-semibold tabular-nums ${['topup', 'refund_belanja'].includes(item.tipe_transaksi) ? 'text-pondok-600' : 'text-ink'}`}
                        >
                          {['topup', 'refund_belanja'].includes(item.tipe_transaksi) ? '+' : '−'}
                          {formatMoney(item.jumlah)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <button className="btn-primary w-full justify-center" type="button" onClick={openTopup}>
                <Wallet size={17} />Top-up saldo via QRIS
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
