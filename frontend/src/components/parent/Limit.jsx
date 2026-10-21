import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Wallet } from 'lucide-react';
import { api } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  AmountLine,
  Avatar,
  Empty,
  ErrorNotice,
  Field,
  formatMoney,
  MobileLoading,
  MobileTop,
} from '../../ui.jsx';

export function ParentLimit({ token }) {
  const navigate = useNavigate();
  const [childId, setChildId] = useState(sessionStorage.getItem('pondokpay.selected_child') || '');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const {
    data: profileData,
    loading,
    error: profileError,
    refresh,
  } = useApiData('/wali/me', token);
  const children = profileData?.data?.children || [];
  const selectedId = children.some((child) => String(child.id) === String(childId))
    ? childId
    : String(children[0]?.id || '');
  const child = children.find((item) => String(item.id) === String(selectedId));
  const newAmount = Number(amount === '' ? child?.limit_harian || 0 : amount);
  const remaining = Math.max(0, newAmount - Number(child?.belanja_hari_ini || 0));

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await api.patch(
        `/wali/anak/${child.id}/limit-harian`,
        { limit_harian: Number(amount === '' ? child.limit_harian : amount) },
        token,
      );
      setMessage(result.message);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <MobileLoading />;
  if (profileError) return <ErrorNotice error={profileError} onRetry={refresh} />;
  if (!child) return <Empty title="Belum ada anak terhubung" />;
  return (
    <div className="space-y-4">
      <MobileTop title="Atur limit harian" />
      {children.length > 1 && (
        <label className="block">
          <span className="label">Akun anak</span>
          <select
            className="field"
            value={selectedId}
            onChange={(e) => {
              setChildId(e.target.value);
              sessionStorage.setItem('pondokpay.selected_child', e.target.value);
              setAmount('');
            }}
          >
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
        <div>
          <p className="text-sm font-semibold">{child.nama_lengkap}</p>
          <p className="text-xs text-muted">
            {child.nis} · {child.asrama || 'Santri'}
          </p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Atur batas belanja harian anak. Perubahan limit tidak mengubah saldo tersimpan.
      </p>
      <section className="card p-3.5">
        <p className="eyebrow mb-1">Ringkasan hari ini</p>
        <AmountLine label="Limit saat ini" amount={formatMoney(child.limit_harian)} />
        <AmountLine label="Sudah dibelanjakan" amount={formatMoney(child.belanja_hari_ini)} />
        <AmountLine label="Saldo tersedia" amount={formatMoney(child.saldo)} />
      </section>
      <form className="space-y-4" onSubmit={save}>
        <section className="card p-3.5">
          <Field
            label="Limit harian baru (Rp)"
            type="number"
            inputMode="decimal"
            min="0"
            max="99999999.99"
            step="0.01"
            value={amount === '' ? child.limit_harian : amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <div className="mt-4">
            <p className="eyebrow mb-2">Nominal cepat</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[0, 20000, 30000, 50000].map((value) => (
                <button
                  type="button"
                  key={value}
                  className={`min-h-11 rounded-xl border px-2 py-2 text-xs font-semibold ${Number(amount || child.limit_harian) === value ? 'border-pondok-600 bg-pondok-50 text-pondok-600' : 'border-line bg-white text-muted'}`}
                  onClick={() => setAmount(String(value))}
                >
                  {value === 0 ? 'Nonaktifkan' : formatMoney(value)}
                </button>
              ))}
            </div>
          </div>
        </section>
        <div className="rounded-2xl border border-pondok-100 bg-gradient-to-br from-pondok-50 to-white p-4">
          <p className="font-semibold">
            <Wallet size={17} className="mr-2 inline text-pondok-600" />
            Pratinjau limit harian
          </p>
          <div className="mt-3">
            <AmountLine label="Limit baru" amount={formatMoney(newAmount)} />
            <AmountLine
              label="Belanja hari ini"
              amount={`−${formatMoney(child.belanja_hari_ini)}`}
            />
            <hr className="my-2 border-pondok-200" />
            <AmountLine
              label="Sisa limit setelah disimpan"
              amount={formatMoney(remaining)}
              strong
            />
          </div>
        </div>
        <Alert type="warning">
          Limit baru lebih kecil dari belanja hari ini? Sisa limit menjadi Rp0. Transaksi sebelumnya
          tidak dibatalkan.
        </Alert>
        {error && <Alert type="error">{error}</Alert>}
        {message && <Alert type="success">{message}</Alert>}
        <button className="btn-primary min-h-12 w-full !py-4" disabled={busy}>
          {busy ? (
            'Menyimpan...'
          ) : (
            <>
              <Check size={17} />
              Simpan limit harian
            </>
          )}
        </button>
        <button
          type="button"
          className="btn-secondary min-h-12 w-full"
          onClick={() => navigate('/wali')}
        >
          Batal
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-muted">
        Limit baru berlaku setelah perubahan berhasil disimpan.
      </p>
    </div>
  );
}
