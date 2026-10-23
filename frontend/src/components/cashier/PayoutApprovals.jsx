import { useState } from 'react';
import { Check, Clock3, FileText, Landmark, ShieldCheck, X } from 'lucide-react';
import { api } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  Empty,
  ErrorNotice,
  formatDate,
  formatMoney,
  MobileLoading,
  StatusBadge,
} from '../../ui.jsx';

export function CashierPayoutApprovals({ token }) {
  const [selectedId, setSelectedId] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const {
    data: approvalData,
    loading,
    error,
    refresh,
  } = useApiData('/kantin/pencairan/persetujuan', token);
  const approvals = approvalData?.data || [];
  const selected = approvals.find((item) => item.id === selectedId) || approvals[0];

  const decide = async (approval, decision) => {
    setBusyId(String(approval.id));
    setErrorMessage('');
    setNotice('');
    try {
      const result = await api.post(
        `/kantin/pencairan/persetujuan/${approval.id}/${decision}`,
        {},
        token,
      );
      setNotice(result.message);
      setSelectedId(null);
      refresh();
    } catch (requestError) {
      setErrorMessage(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  if (loading) return <MobileLoading text="Memuat persetujuan..." />;

  return (
    <section className="mx-auto max-w-[1180px]">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Persetujuan pencairan</h1>
          <p className="mt-1 text-xs text-muted sm:text-sm">Tinjau permintaan admin untuk kantin yang ditugaskan kepada Anda.</p>
        </div>
        <StatusBadge tone={approvals.length ? 'amber' : 'green'}>
          {approvals.length ? `${approvals.length} menunggu keputusan` : 'Tidak ada pengajuan'}
        </StatusBadge>
      </header>
      <ErrorNotice error={error} onRetry={refresh} />
      {errorMessage && <Alert type="error" className="mb-3">{errorMessage}</Alert>}
      {notice && <Alert type="success" className="mb-3">{notice}</Alert>}
      {!approvals.length ? (
        <div className="card">
          <Empty
            title="Tidak ada permintaan menunggu"
            description="Pengajuan pencairan baru dari admin akan muncul di sini."
          />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[245px_minmax(0,1fr)_230px] lg:items-start">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-visible">
            {approvals.map((approval) => {
              const active = selected?.id === approval.id;
              return (
                <button
                  key={approval.id}
                  type="button"
                  onClick={() => setSelectedId(approval.id)}
                  className={`min-w-[210px] rounded-xl border p-3 text-left transition lg:min-w-0 lg:w-full ${active ? 'border-pondok-500 bg-[#eaf5ef]' : 'border-line bg-white hover:border-pondok-200'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-pondok-700">Pengajuan #{approval.id}</span>
                    <Landmark size={15} className="text-pondok-600" />
                  </div>
                  <p className="mt-2 text-lg font-semibold">{formatMoney(approval.amount)}</p>
                  <p className="mt-1 truncate text-xs">{approval.kantin_nama}</p>
                  <p className="mt-2 truncate text-[10px] text-muted">
                    Dari {approval.requester_username} · {formatDate(approval.created_at, true)}
                  </p>
                  <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">Menunggu</span>
                </button>
              );
            })}
            <p className="hidden pt-2 text-[11px] text-muted lg:block">Hanya permintaan aktif yang belum kedaluwarsa ditampilkan.</p>
          </div>
          {selected && (
            <article className="card p-4 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Pengajuan #{selected.id}</p>
                  <p className="mt-1 text-xs text-muted">Nominal pencairan</p>
                  <p className="mt-1 text-3xl font-semibold sm:text-4xl">{formatMoney(selected.amount)}</p>
                  <p className="mt-1 text-sm text-muted">Dari saldo {selected.kantin_nama}</p>
                </div>
                <StatusBadge tone="amber">Menunggu keputusan</StatusBadge>
              </div>
              <div className="my-4 border-t border-line" />
              <DetailLine label="Diajukan oleh" value={selected.requester_username} />
              <DetailLine label="Tanggal pengajuan" value={formatDate(selected.created_at, true)} />
              <DetailLine label="Kantin" value={selected.kantin_nama} />
              <div className="mt-3 rounded-xl bg-[#f5f5f1] p-3">
                <p className="text-[10px] text-muted">Keterangan</p>
                <p className="mt-1 text-sm">{selected.keterangan || 'Tanpa keterangan'}</p>
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                <Clock3 size={15} className="mt-0.5 shrink-0" />
                <span>Berlaku hingga {formatDate(selected.expires_at, true)}. Putuskan sebelum pengajuan kedaluwarsa.</span>
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#eaf5ef] p-3 text-xs text-[#176b50]">
                <ShieldCheck size={15} className="mt-0.5 shrink-0" />
                <span>MFA wajib aktif. Persetujuan hanya mengonfirmasi permintaan dan tidak mencairkan dana.</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn-secondary min-h-10 border-red-200 !py-2 text-red-600 hover:bg-red-50"
                  disabled={Boolean(busyId)}
                  onClick={() => decide(selected, 'reject')}
                >
                  <X size={15} /> {busyId === String(selected.id) ? 'Memproses...' : 'Tolak'}
                </button>
                <button
                  type="button"
                  className="btn-primary min-h-10 !py-2"
                  disabled={Boolean(busyId)}
                  onClick={() => decide(selected, 'approve')}
                >
                  <Check size={15} /> {busyId === String(selected.id) ? 'Memproses...' : 'Setujui'}
                </button>
              </div>
              <p className="mt-3 text-[10px] text-muted">Setelah disetujui, admin tetap harus menjalankan pencairan.</p>
            </article>
          )}
          <aside className="hidden space-y-3 lg:block">
            <div className="rounded-xl bg-[#104a39] p-4 text-white">
              <Landmark size={17} />
              <p className="mt-3 text-[11px] text-white/70">Saldo {selected?.kantin_nama}</p>
              <p className="mt-1 text-2xl font-semibold">Lihat saldo</p>
              <p className="mt-2 text-[10px] text-white/70">Persetujuan belum mengurangi saldo kantin.</p>
            </div>
            <div className="card p-4">
              <h2 className="text-sm font-semibold">Setujui, bukan cairkan</h2>
              <div className="mt-3 space-y-3 border-t border-line pt-3 text-xs">
                <div className="flex gap-2"><FileText size={15} className="shrink-0 text-pondok-700" /><span>Admin mengajukan nominal dan tujuan pencairan.</span></div>
                <div className="flex gap-2"><ShieldCheck size={15} className="shrink-0 text-pondok-700" /><span>Kasir meninjau lalu menyetujui atau menolak.</span></div>
                <div className="flex gap-2"><Landmark size={15} className="shrink-0 text-pondok-700" /><span>Admin mencairkan dana setelah persetujuan.</span></div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

function DetailLine({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-xs">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
