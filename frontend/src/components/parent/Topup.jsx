import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, Copy, QrCode, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { api, idempotencyKey } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  Avatar,
  Empty,
  ErrorNotice,
  Field,
  formatDate,
  formatMoney,
  MobileLoading,
  StatusBadge,
} from '../../ui.jsx';
import { selectedChildId } from './shared.jsx';

const quickAmounts = [10000, 25000, 50000, 100000, 200000, 450000];

const statusPresentation = {
  creating: { label: 'Menyiapkan pembayaran', tone: 'amber' },
  pending: { label: 'Menunggu pembayaran', tone: 'amber' },
  paid: { label: 'Berhasil', tone: 'green' },
  expired: { label: 'Kedaluwarsa', tone: 'gray' },
  failed: { label: 'Gagal', tone: 'red' },
};

const loadSnap = (scriptUrl, clientKey) => {
  let script = document.querySelector('script[data-pondokpay-snap]');
  if (script && (script.dataset.url !== scriptUrl || script.dataset.clientKey !== clientKey)) {
    script.remove();
    window.snap = undefined;
    script = null;
  }
  if (window.snap && script?.dataset.url === scriptUrl &&
      script.dataset.clientKey === clientKey) {
    return Promise.resolve(window.snap);
  }
  if (window.snap && !script) window.snap = undefined;
  return new Promise((resolve, reject) => {
    if (!script) {
      script = document.createElement('script');
      script.dataset.pondokpaySnap = 'true';
      script.dataset.url = scriptUrl;
      script.dataset.clientKey = clientKey;
      script.setAttribute('data-client-key', clientKey);
      script.src = scriptUrl;
      script.async = true;
      script.onload = () => window.snap ? resolve(window.snap) : reject(new Error('Widget pembayaran Midtrans tidak tersedia.'));
      script.onerror = () => {
        script.remove();
        reject(new Error('Widget pembayaran Midtrans gagal dimuat. Periksa koneksi internet.'));
      };
      document.head.appendChild(script);
      return;
    }
    script.addEventListener('load', () => window.snap ? resolve(window.snap) : reject(new Error('Widget pembayaran Midtrans tidak tersedia.')), { once: true });
    script.addEventListener('error', () => {
      script.remove();
      reject(new Error('Widget pembayaran Midtrans gagal dimuat. Periksa koneksi internet.'));
    }, { once: true });
  });
};

const rupiahInput = (value) => {
  if (!value) return '';
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? new Intl.NumberFormat('id-ID').format(amount) : value;
};

export function ParentTopup({ token }) {
  const navigate = useNavigate();
  const {
    data: profileResponse,
    loading: profileLoading,
    error: profileError,
    refresh: refreshProfile,
  } = useApiData('/wali/me', token);
  const {
    data: configResponse,
    loading: configLoading,
    error: configError,
  } = useApiData('/wali/topup/config', token);
  const {
    data: historyResponse,
    loading: historyLoading,
    error: historyError,
    refresh: refreshHistory,
  } = useApiData('/wali/topup/history', token);
  const children = profileResponse?.data?.children || [];
  const [childId, setChildId] = useState('');
  const selectedId = children.some((child) => String(child.id) === String(childId))
    ? String(childId)
    : selectedChildId(children);
  const selectedChild = children.find((child) => String(child.id) === selectedId);
  const config = configResponse?.data;
  const [amount, setAmount] = useState('50000');
  const [activePayment, setActivePayment] = useState(null);
  const [formError, setFormError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [qrCopyNotice, setQrCopyNotice] = useState('');
  const history = historyResponse?.data || [];
  const pendingFromHistory = history.find((payment) => payment.status === 'pending' || payment.status === 'creating');
  const displayedPayment = activePayment || pendingFromHistory;

  useEffect(() => {
    if (!activePayment?.order_id || activePayment.status === 'paid' ||
        activePayment.status === 'expired' || activePayment.status === 'failed') return undefined;
    let active = true;
    const checkStatus = async () => {
      try {
        const result = await api.get(`/wali/topup/${encodeURIComponent(activePayment.order_id)}`, token);
        if (!active) return;
        setActivePayment(result.data);
        setStatusError('');
        if (result.data.status === 'paid') {
          refreshHistory();
          refreshProfile();
          setNotice('Pembayaran diterima dan saldo santri berhasil ditambahkan.');
        }
      } catch (error) {
        if (active) setStatusError(error.message);
      }
    };
    checkStatus();
    const timer = window.setInterval(checkStatus, 12000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [activePayment?.order_id, activePayment?.status, token, refreshHistory, refreshProfile]);

  const openPayment = async (payment) => {
    const clientKey = payment?.client_key || config?.client_key;
    const scriptUrl = payment?.snap_script_url || config?.snap_script_url;
    if (!payment?.snap_token || !clientKey || !scriptUrl) {
      setPaymentError('Token pembayaran tidak tersedia. Muat ulang status pembayaran atau hubungi admin.');
      return;
    }
    setPaymentError('');
    setNotice('');
    try {
      const snap = await loadSnap(scriptUrl, clientKey);
      snap.pay(payment.snap_token, {
        onSuccess: () => {
          setNotice('Pembayaran sedang dikonfirmasi. Saldo akan diperbarui otomatis.');
          setActivePayment((current) => ({ ...current, status: 'pending' }));
          window.setTimeout(refreshHistory, 1500);
        },
        onPending: () => {
          setNotice('Silakan selesaikan pembayaran QRIS. Status akan diperbarui otomatis.');
          setActivePayment((current) => ({ ...current, status: 'pending' }));
        },
        onError: () => {
          setPaymentError('Pembayaran belum berhasil. Periksa status transaksi atau coba kembali sebelum QRIS kedaluwarsa.');
          window.setTimeout(refreshHistory, 1000);
        },
        onClose: () => {
          setNotice('Jendela pembayaran ditutup. Anda masih dapat membuka kembali QRIS selama belum kedaluwarsa.');
          setActivePayment((current) => current?.status === 'paid' ? current : { ...current, status: 'pending' });
        },
      });
    } catch (error) {
      setPaymentError(error.message);
    }
  };

  const createPayment = async (event) => {
    event.preventDefault();
    setFormError('');
    setPaymentError('');
    setNotice('');
    if (!selectedChild) {
      setFormError('Pilih santri yang akan menerima saldo.');
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isSafeInteger(numericAmount) ||
        numericAmount < (config?.minimum_amount || 10000) ||
        numericAmount > (config?.maximum_amount || 450000)) {
      setFormError('Masukkan nominal bulat antara Rp10.000 dan Rp450.000.');
      return;
    }

    setBusy(true);
    try {
      const result = await api.post(
        '/wali/topup',
        { santri_id: Number(selectedChild.id), amount: numericAmount },
        token,
        { idempotencyKey: idempotencyKey() },
      );
      const payment = result.data;
      setActivePayment(payment);
      refreshHistory();
      if (payment.qr_data_url) {
        setNotice('QRIS siap dipindai. Selesaikan pembayaran sebelum kode kedaluwarsa.');
      } else {
        await openPayment(payment);
      }
    } catch (error) {
      setPaymentError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const resumePayment = async (payment) => {
    setStatusBusy(true);
    setStatusError('');
    setPaymentError('');
    try {
      const result = await api.get(`/wali/topup/${encodeURIComponent(payment.order_id)}`, token);
      setActivePayment(result.data);
      if (result.data.status === 'pending' && !result.data.qr_data_url && result.data.snap_token) {
        await openPayment(result.data);
      }
      else if (result.data.status === 'paid') {
        refreshHistory();
        refreshProfile();
        setNotice('Pembayaran sudah berhasil dan saldo telah ditambahkan.');
      }
    } catch (error) {
      setStatusError(error.message);
    } finally {
      setStatusBusy(false);
    }
  };

  const copyQrisSimulatorUrl = async (payment) => {
    if (!payment?.qr_code_url) return;
    try {
      await navigator.clipboard.writeText(payment.qr_code_url);
      setQrCopyNotice('URL gambar QRIS berhasil disalin. Tempelkan pada kolom “QR Code Image Url” di simulator.');
    } catch (error) {
      console.error('Copy QRIS simulator URL failed:', error);
      setQrCopyNotice('URL QRIS tidak dapat disalin otomatis. Buka halaman melalui HTTPS atau localhost, lalu coba lagi.');
    }
  };

  if (profileLoading || configLoading) return <MobileLoading text="Menyiapkan pembayaran..." />;
  if (profileError) return <ErrorNotice error={profileError} onRetry={refreshProfile} />;
  if (!children.length) {
    return <Empty title="Belum ada anak terhubung" description="Hubungi admin pondok untuk menghubungkan akun wali dengan santri." />;
  }

  const presentation = statusPresentation[displayedPayment?.status] || statusPresentation.pending;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-pondok-50 text-pondok-700"><Wallet size={21} /></span>
        <div>
          <h2 className="text-xl font-semibold">Top-up saldo</h2>
          <p className="text-sm text-muted">Bayar praktis menggunakan QRIS.</p>
        </div>
      </div>

      {configError && <ErrorNotice error={configError} />}
      {paymentError && <Alert type="error">{paymentError}</Alert>}
      {statusError && <Alert type="warning">{statusError}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      {!config?.enabled ? (
        <Alert type="warning">
          Pembayaran QRIS belum tersedia. Silakan hubungi admin pondok untuk menyiapkan koneksi pembayaran.
        </Alert>
      ) : (
        <form className="card space-y-5 p-4" onSubmit={createPayment}>
          <div>
            <label className="label" htmlFor="topup-child">Saldo untuk santri</label>
            {children.length > 1 ? (
              <select
                id="topup-child"
                className="field"
                value={selectedId}
                onChange={(event) => {
                  setChildId(event.target.value);
                  sessionStorage.setItem('pondokpay.selected_child', event.target.value);
                }}
              >
                {children.map((child) => (
                  <option key={child.id} value={child.id}>{child.nama_lengkap} · {child.nis}</option>
                ))}
              </select>
            ) : selectedChild ? (
              <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas p-3">
                <Avatar name={selectedChild.nama_lengkap} className="h-10 w-10" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{selectedChild.nama_lengkap}</p>
                  <p className="text-xs text-muted">{selectedChild.nis} · Saldo {formatMoney(selectedChild.saldo)}</p>
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="label !mb-0" htmlFor="topup-amount">Nominal top-up</label>
              <span className="text-xs text-muted">Rp10.000–Rp450.000</span>
            </div>
            <Field
              id="topup-amount"
              type="number"
              inputMode="numeric"
              min={config.minimum_amount}
              max={config.maximum_amount}
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="50000"
              required
            />
            <div className="mt-3 grid grid-cols-3 gap-2">
              {quickAmounts.map((value) => (
                <button
                  key={value}
                  className={`min-h-10 rounded-xl border px-2 text-xs font-semibold transition ${Number(amount) === value ? 'border-pondok-600 bg-pondok-50 text-pondok-700' : 'border-line bg-white text-muted hover:border-pondok-200'}`}
                  type="button"
                  onClick={() => setAmount(String(value))}
                >
                  {rupiahInput(value)}
                </button>
              ))}
            </div>
          </div>

          {formError && <Alert type="error">{formError}</Alert>}
          <div className="rounded-xl border border-pondok-100 bg-pondok-50 p-3 text-sm text-pondok-800">
            <div className="flex items-start gap-2">
              <ShieldCheck size={17} className="mt-0.5 shrink-0" />
              <p>Biaya QRIS ditanggung pondok. Jika ada tunggakan biaya layanan bulan berjalan dan saldo mencukupi, sistem dapat melunasinya otomatis sesuai aturan pondok.</p>
            </div>
          </div>
          <button className="btn-primary w-full justify-center" type="submit" disabled={busy || !config?.enabled}>
            <QrCode size={18} />{busy ? 'Menyiapkan QRIS...' : `Bayar ${formatMoney(Number(amount) || 0)} dengan QRIS`}
          </button>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
            <Clock3 size={14} />QRIS berlaku {config.expiry_minutes} menit. Saldo bertambah setelah pembayaran terkonfirmasi.
          </p>
        </form>
      )}

      {displayedPayment && (
        <section className="card space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Pembayaran terakhir</p>
              <p className="mt-1 text-xs text-muted">{displayedPayment.nama_santri} · {formatDate(displayedPayment.created_at, true)}</p>
            </div>
            <StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="text-sm text-muted">Nominal</span>
            <span className="font-semibold tabular-nums">{formatMoney(displayedPayment.amount)}</span>
          </div>
          {displayedPayment.status === 'paid' ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 size={18} />Saldo sudah ditambahkan ke akun santri.
            </div>
          ) : ['pending', 'creating'].includes(displayedPayment.status) ? (
            <>
              {displayedPayment.qr_data_url && (
                <div className="rounded-xl border border-line bg-white p-4 text-center">
                  <p className="text-sm font-semibold">Pindai QRIS untuk membayar</p>
                  <img
                    className="mx-auto mt-3 h-64 w-64 max-w-full rounded-lg"
                    src={displayedPayment.qr_data_url}
                    alt={`QRIS top-up ${formatMoney(displayedPayment.amount)} untuk ${displayedPayment.nama_santri}`}
                  />
                  <p className="mt-2 text-xs text-muted">Gunakan aplikasi mobile banking atau dompet digital yang mendukung QRIS.</p>
                  {displayedPayment.environment === 'sandbox' && displayedPayment.qr_code_url && (
                    <>
                      <button
                        className="btn-secondary mt-3 w-full justify-center"
                        type="button"
                        onClick={() => copyQrisSimulatorUrl(displayedPayment)}
                      >
                        <Copy size={15} />Salin URL QRIS untuk simulator
                      </button>
                      <a
                        className="mt-2 inline-block text-xs font-semibold text-pondok-700 underline"
                        href="https://simulator.sandbox.midtrans.com/v2/qris/index"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Buka QRIS Sandbox Simulator
                      </a>
                      <p className="mt-1 text-xs text-muted">Di simulator, tempel URL ini pada kolom “QR Code Image Url”, bukan pada kolom teks QR.</p>
                    </>
                  )}
                  {qrCopyNotice && <p className="mt-2 text-xs text-muted">{qrCopyNotice}</p>}
                </div>
              )}
              <p className="text-xs leading-relaxed text-muted">
                {displayedPayment.expires_at
                  ? `Selesaikan pembayaran sebelum ${formatDate(displayedPayment.expires_at, true)}.`
                  : 'Menyiapkan kode pembayaran. Status diperbarui otomatis.'}
              </p>
              <button className="btn-secondary w-full justify-center" type="button" disabled={statusBusy} onClick={() => resumePayment(displayedPayment)}>
                <RefreshCw size={16} />{statusBusy ? 'Memeriksa...' : displayedPayment.qr_data_url ? 'Periksa status pembayaran' : 'Tampilkan / periksa QRIS'}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-canvas p-3 text-sm text-muted">
              <AlertCircle size={17} />Pembayaran ini tidak aktif. Buat top-up baru untuk mendapatkan QRIS baru.
            </div>
          )}
          <p className="break-all text-[10px] text-muted">ID pembayaran: {displayedPayment.order_id}</p>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold">Riwayat pembayaran</h3>
          <button className="inline-flex items-center gap-1 text-xs font-semibold text-pondok-700" type="button" onClick={refreshHistory}>
            <RefreshCw size={13} />Muat ulang
          </button>
        </div>
        {historyError ? (
          <ErrorNotice error={historyError} onRetry={refreshHistory} />
        ) : historyLoading ? (
          <MobileLoading />
        ) : !history.length ? (
          <div className="rounded-xl border border-line bg-white p-4 text-center text-sm text-muted">Belum ada pembayaran QRIS.</div>
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
            {history.map((payment) => {
              const state = statusPresentation[payment.status] || statusPresentation.pending;
              return (
                <div key={payment.order_id} className="flex items-center gap-3 p-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${payment.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-pondok-50 text-pondok-700'}`}>
                    {payment.status === 'paid' ? <CheckCircle2 size={17} /> : <QrCode size={17} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{payment.nama_santri}</p>
                    <p className="text-xs text-muted">{formatDate(payment.created_at, true)} · {formatMoney(payment.amount)}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                    {payment.status === 'pending' && (
                      <button className="mt-1 block w-full text-xs font-semibold text-pondok-700" type="button" onClick={() => resumePayment(payment)}>
                        Lanjutkan
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <button
        className="inline-flex min-h-10 items-center gap-2 px-1 text-sm font-semibold text-muted"
        type="button"
        onClick={() => navigate('/wali')}
      >
        <ArrowLeft size={16} />Kembali
      </button>
    </div>
  );
}
