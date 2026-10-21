import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  CreditCard,
  Fingerprint,
  ShieldCheck,
} from 'lucide-react';
import { api, idempotencyKey } from '../../api.js';
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
  MobileTop,
  StatusBadge,
  TransactionMark,
} from '../../ui.jsx';
import { METHOD_FIELDS, PurchaseForm } from './shared.jsx';

export function CashierHome({ token }) {
  const navigate = useNavigate();
  const [canteenId, setCanteenId] = useState('');
  const [method, setMethod] = useState('RFID');
  const [lookupValue, setLookupValue] = useState('');
  const [student, setStudent] = useState(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [step, setStep] = useState('amount');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const idempotency = useRef(null);
  const field = METHOD_FIELDS[method];
  const {
    data: canteenData,
    loading,
    error: canteenError,
    refresh: refreshCanteens,
  } = useApiData('/kantin', token);
  const canteens = canteenData?.data || [];
  const selectedCanteen =
    canteens.find((item) => String(item.id) === String(canteenId)) || canteens[0];
  const historyPath = selectedCanteen
    ? `/kantin/${selectedCanteen.id}/transaksi?limit=3`
    : '/kantin';
  const { data: historyData, refresh: refreshHistory } = useApiData(historyPath, token);
  const transactions = historyData?.data || [];

  const lookupStudent = async (event) => {
    event.preventDefault();
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setError('Masukkan nominal belanja yang valid terlebih dahulu.');
      setStep('amount');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setStudent(null);
    try {
      const result = await api.post(
        `/kantin/${selectedCanteen.id}/santri/lookup`,
        { [field.key]: field.key === 'fingerprint_id' ? Number(lookupValue) : lookupValue.trim() },
        token,
      );
      setStudent(result.data);
      setLookupValue('');
      const value = Number(amount);
      if (value > Number(result.data.saldo)) setError('Saldo santri tidak mencukupi.');
      else if (value > Number(result.data.sisa_limit_harian))
        setError('Nominal melebihi sisa limit belanja harian.');
      setStep('confirm');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!idempotency.current) idempotency.current = idempotencyKey();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.post(
        `/kantin/${selectedCanteen.id}/penjualan`,
        {
          santri_id: student.id,
          jumlah: Number(amount),
          keterangan: description || null,
        },
        token,
        { idempotencyKey: idempotency.current },
      );
      setStudent((previous) =>
        previous
          ? {
              ...previous,
              saldo: result.data.santri?.saldo ?? previous.saldo,
              belanja_hari_ini: Number(previous.belanja_hari_ini || 0) + Number(amount),
              sisa_limit_harian: Math.max(
                0,
                Number(previous.sisa_limit_harian || 0) - Number(amount),
              ).toFixed(2),
            }
          : previous,
      );
      setNotice(result.message || 'Pembayaran berhasil.');
      setStep('success');
      idempotency.current = null;
      refreshHistory();
    } catch (err) {
      setError(err.message);
      if (err.status === 409)
        setNotice(
          'Transaksi belum berhasil. Periksa kembali saldo, limit harian, atau status kantin sebelum melanjutkan.',
        );
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStudent(null);
    setAmount('');
    setDescription('');
    setStep('amount');
    setError('');
    setNotice('');
    idempotency.current = null;
    setLookupValue('');
  };
  const changeCanteen = (nextId) => {
    setCanteenId(nextId);
    setStudent(null);
    setAmount('');
    setDescription('');
    setLookupValue('');
    setStep('amount');
    setError('');
    setNotice('');
    idempotency.current = null;
  };

  if (loading) return <MobileLoading />;
  if (canteenError)
    return (
      <>
        <ErrorNotice error={canteenError} onRetry={refreshCanteens} />
        <Empty
          title="Kantin tidak tersedia"
          description="Hubungi admin untuk memastikan akun kasir ditugaskan ke kantin aktif."
        />
      </>
    );
  if (!canteens.length)
    return (
      <Empty
        title="Belum ada kantin aktif"
        description="Akun kasir belum ditugaskan ke kantin aktif."
      />
    );

  return (
    <div className="mx-auto w-full max-w-2xl">
      {step !== 'amount' && step !== 'success' && (
        <button
          className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-pondok-700 transition hover:bg-pondok-50"
          onClick={() => {
            setError('');
            setStep(step === 'confirm' ? 'credential' : 'amount');
          }}
        >
          <ArrowLeft size={18} />
          {step === 'confirm' ? 'Periksa kredensial lagi' : 'Ubah nominal'}
        </button>
      )}
      {step === 'amount' && (
        <>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted">
                Assalamu’alaikum,{' '}
                {JSON.parse(sessionStorage.getItem('pondokpay.user') || '{}').username || 'Kasir'}
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">Transaksi baru</p>
            </div>
            <label className="relative block w-full sm:max-w-xs">
              <span className="label">Kantin aktif</span>
              <select
                className="field appearance-none pr-10"
                value={selectedCanteen?.id || ''}
                onChange={(e) => changeCanteen(e.target.value)}
              >
                {canteens.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nama}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={18}
                className="pointer-events-none absolute right-3 top-10 text-muted"
              />
            </label>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {[
              ['1', 'Nominal'],
              ['2', 'Kredensial'],
              ['3', 'Konfirmasi'],
            ].map(([number, label], index) => (
              <div
                key={number}
                className={`rounded-xl px-2 py-2.5 text-center text-xs font-semibold sm:flex sm:items-center sm:justify-center sm:gap-2 ${index === 0 ? 'bg-pondok-700 text-white' : 'bg-white text-muted'}`}
              >
                <span className="mx-auto mb-1 grid h-5 w-5 place-items-center rounded-full bg-black/10 sm:mx-0 sm:mb-0">
                  {number}
                </span>
                {label}
              </div>
            ))}
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-pondok-700 to-pondok-800 p-4 text-white shadow-sm sm:p-5">
            <div className="flex items-center justify-between text-sm text-white/75">
              <span>Saldo kantin</span>
              <CreditCard size={19} />
            </div>
            <p className="mt-2 text-2xl font-semibold sm:text-3xl">
              {formatMoney(selectedCanteen?.saldo)}
            </p>
            <p className="mt-1 text-xs text-white/65">
              {selectedCanteen?.lokasi || 'Saldo penjualan kantin'}
            </p>
          </div>
          <PurchaseForm
            amount={amount}
            setAmount={setAmount}
            description={description}
            setDescription={setDescription}
            error={error}
            onSubmit={(event) => {
              event.preventDefault();
              const value = Number(amount);
              if (!Number.isFinite(value) || value <= 0) {
                setError('Masukkan nominal belanja yang valid.');
                return;
              }
              setError('');
              setStep('credential');
            }}
          />
          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Penjualan terakhir</h2>
              <button
                className="text-sm font-semibold text-pondok-600"
                onClick={() => navigate('/kasir/history')}
              >
                Riwayat →
              </button>
            </div>
            {!transactions.length ? (
              <p className="rounded-xl bg-white p-4 text-sm text-muted">
                Belum ada transaksi tercatat.
              </p>
            ) : (
              transactions.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border-b border-line bg-white px-3 py-3 last:border-0"
                >
                  <TransactionMark type={item.tipe_transaksi} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {item.nama_lengkap || 'Transaksi kantin'}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {formatDate(item.created_at, true)} · {item.keterangan || `#${item.id}`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-pondok-600">
                    +{formatMoney(item.jumlah)}
                  </span>
                </div>
              ))
            )}
          </section>
        </>
      )}
      {step === 'credential' && (
        <section className="card p-4 sm:p-6">
          <div className="mb-5">
            <StatusBadge>Langkah 2 dari 3</StatusBadge>
            <h1 className="mt-3 text-xl font-semibold">Verifikasi santri</h1>
            <p className="mt-1 text-sm text-muted">
              Nominal belanja <strong className="text-ink">{formatMoney(amount)}</strong>. Pindai
              kartu atau sidik jari.
            </p>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-canvas p-1.5">
            {Object.keys(METHOD_FIELDS).map((item) => (
              <button
                type="button"
                key={item}
                className={`flex min-h-14 items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold transition ${method === item ? 'bg-pondok-700 text-white shadow-sm' : 'text-muted hover:bg-white'}`}
                onClick={() => {
                  setMethod(item);
                  setLookupValue('');
                  setError('');
                }}
              >
                {item === 'RFID' ? <CreditCard size={19} /> : <Fingerprint size={19} />}
                {item === 'RFID' ? 'Kartu RFID' : 'Sidik jari'}
              </button>
            ))}
          </div>
          <form className="space-y-4" onSubmit={lookupStudent}>
            <label className="block">
              <span className="label">{field.label}</span>
              <input
                className="field min-h-14 text-lg tracking-wider"
                type="password"
                inputMode={field.inputMode}
                autoComplete="new-password"
                autoCapitalize="off"
                spellCheck="false"
                maxLength={field.key === 'rfid_uid' ? 50 : undefined}
                pattern={field.key === 'fingerprint_id' ? '[0-9]*' : undefined}
                placeholder={field.placeholder}
                value={lookupValue}
                onChange={(event) =>
                  setLookupValue(
                    field.key === 'fingerprint_id'
                      ? event.target.value.replace(/\D/g, '')
                      : event.target.value,
                  )
                }
                required
              />
            </label>
            <p className="flex items-start gap-2 rounded-xl bg-pondok-50 p-3 text-xs leading-relaxed text-pondok-700">
              <ShieldCheck size={16} className="mt-0.5 shrink-0" />
              Nilai RFID dan ID sidik jari disamarkan di layar dan hanya dikirim untuk verifikasi.
            </p>
            {error && <Alert type="error">{error}</Alert>}
            <button
              className="btn-primary min-h-12 w-full"
              disabled={busy || !selectedCanteen || selectedCanteen.status !== 'active'}
            >
              {busy ? (
                'Memverifikasi...'
              ) : (
                <>
                  <ShieldCheck size={18} />
                  Verifikasi santri
                </>
              )}
            </button>
          </form>
        </section>
      )}
      {step === 'confirm' && student && (
        <div>
          <div className="mb-4">
            <StatusBadge>Langkah 3 dari 3</StatusBadge>
            <h1 className="mt-3 text-xl font-semibold">Konfirmasi pembayaran</h1>
            <p className="mt-1 text-sm text-muted">{selectedCanteen?.nama}</p>
          </div>
          <div className="card p-4 sm:p-6">
            <p className="text-center text-sm text-muted">Total pembayaran</p>
            <p className="mt-1 text-center text-3xl font-semibold sm:text-4xl">
              {formatMoney(amount)}
            </p>
            <div className="mt-3 text-center">
              <StatusBadge tone="amber">Belum dibayar</StatusBadge>
            </div>
            <hr className="my-5 border-line" />
            <div className="flex items-center gap-3">
              <Avatar name={student.nama_lengkap} />
              <div className="min-w-0">
                <p className="font-semibold">{student.nama_lengkap}</p>
                <p className="text-xs text-muted">
                  {student.nis} · {student.asrama || 'Santri'}
                </p>
              </div>
              <StatusBadge>Terverifikasi</StatusBadge>
            </div>
            <hr className="my-5 border-line" />
            <AmountLine label="Keterangan" amount={description || '—'} />
            <AmountLine label="Saldo saat ini" amount={formatMoney(student.saldo)} />
            <AmountLine
              label="Saldo setelah pembayaran"
              amount={formatMoney(Number(student.saldo) - Number(amount))}
              strong
            />
            <AmountLine
              label="Sisa limit setelah transaksi"
              amount={formatMoney(Math.max(0, Number(student.sisa_limit_harian) - Number(amount)))}
            />
          </div>
          {error && (
            <Alert type="error" className="mt-4">
              {error}
            </Alert>
          )}
          {notice && (
            <Alert type="warning" className="mt-4">
              {notice}
            </Alert>
          )}
          <Alert className="mt-4">
            Periksa identitas dan nominal. Saldo dipotong hanya setelah transaksi berhasil
            dikonfirmasi.
          </Alert>
          <button
            className="btn-primary mt-5 min-h-14 w-full !py-4"
            disabled={
              busy ||
              Number(amount) > Number(student.saldo) ||
              Number(amount) > Number(student.sisa_limit_harian)
            }
            onClick={pay}
          >
            <ShieldCheck size={18} />
            {busy ? 'Memproses transaksi...' : 'Konfirmasi pembayaran'}
          </button>
          <button
            className="btn-secondary mt-3 min-h-12 w-full"
            disabled={busy}
            onClick={() => {
              setError('');
              setStep('amount');
            }}
          >
            Ubah nominal
          </button>
          <p className="mt-4 text-center text-xs text-muted">
            Jika respons tidak diterima, transaksi akan diulang dengan aman tanpa debit ganda.
          </p>
        </div>
      )}
      {step === 'success' && student && (
        <div className="pt-7 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-pondok-50 text-pondok-600">
            <CircleCheck size={44} />
          </div>
          <h2 className="mt-5 text-2xl font-medium">Pembayaran berhasil</h2>
          <p className="mt-2 text-sm text-muted">
            Transaksi telah terkonfirmasi dan saldo santri sudah diperbarui.
          </p>
          <div className="card mt-6 p-5 text-left">
            <div className="text-center">
              <StatusBadge>Terkonfirmasi</StatusBadge>
              <p className="mt-2 text-3xl font-medium">{formatMoney(amount)}</p>
              <p className="mt-1 text-xs text-muted">
                Transaksi tercatat · {formatDate(new Date(), true)}
              </p>
            </div>
            <hr className="my-5 border-line" />
            <div className="flex items-center gap-3">
              <Avatar name={student.nama_lengkap} />
              <div>
                <p className="font-semibold">{student.nama_lengkap}</p>
                <p className="text-xs text-muted">
                  {student.nis} · {student.asrama || 'Santri'}
                </p>
              </div>
            </div>
            <hr className="my-4 border-line" />
            <AmountLine label="Kantin" amount={selectedCanteen?.nama} />
            <AmountLine label="Keterangan" amount={description || '—'} />
            <AmountLine label="Saldo sekarang" amount={formatMoney(student.saldo)} strong />
            <AmountLine label="Belanja hari ini" amount={formatMoney(student.belanja_hari_ini)} />
            <AmountLine
              label="Sisa limit hari ini"
              amount={formatMoney(student.sisa_limit_harian)}
            />
          </div>
          <button className="btn-primary mt-5 w-full !py-4" onClick={reset}>
            <Check size={18} />
            Transaksi berikutnya
          </button>
          <button className="btn-secondary mt-3 w-full" onClick={() => navigate('/kasir/history')}>
            Lihat riwayat kantin
          </button>
          <p className="mt-4 text-xs text-muted">
            <ShieldCheck className="mr-1 inline" size={15} />
            Tercatat aman di riwayat transaksi
          </p>
        </div>
      )}
    </div>
  );
}
