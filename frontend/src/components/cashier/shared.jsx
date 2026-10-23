import { ArrowRight, Delete } from 'lucide-react';
import { Alert, AmountLine, Field } from '../../ui.jsx';

export const METHOD_FIELDS = {
  RFID: {
    key: 'rfid_uid',
    label: 'Kartu RFID',
    placeholder: 'Tempelkan kartu atau masukkan UID',
    inputMode: 'text',
  },
  Fingerprint: {
    key: 'fingerprint_id',
    label: 'Sidik jari',
    placeholder: 'Pindai atau masukkan ID perangkat',
    inputMode: 'numeric',
  },
};

export function PurchaseForm({ amount, setAmount, description, setDescription, error, onSubmit }) {
  const addDigits = (digits) => {
    const next = `${amount || ''}${digits}`.replace(/^0+(?=\d)/, '');
    setAmount(next);
  };
  const removeDigit = () => setAmount((current) => String(current || '').slice(0, -1));

  return (
    <section className="mx-auto mt-4 max-w-[560px]">
      <form className="space-y-3" onSubmit={onSubmit}>
        <div className="py-4 text-center sm:py-6">
          <p className="text-xs text-muted">Nominal belanja</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
            {amount ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(amount)) : 'Rp0'}
          </p>
          <p className="mt-2 text-[11px] text-muted">Transaksi terpisah, bukan tambahan keranjang.</p>
        </div>
        <Field
          label=""
          placeholder="Keterangan (contoh: Belanja kantin)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
        />
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'delete'].map((key) => (
            <button
              key={key}
              type="button"
              className="grid min-h-11 place-items-center rounded-xl border border-line bg-white text-lg font-medium transition hover:bg-pondok-50 active:bg-pondok-100"
              aria-label={key === 'delete' ? 'Hapus satu angka' : key}
              onClick={key === 'delete' ? removeDigit : () => addDigits(key)}
            >
              {key === 'delete' ? <Delete size={18} /> : key}
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-muted">Nominal harus lebih dari Rp0 dan tidak boleh melebihi saldo atau sisa limit harian santri.</p>
        {error && <Alert type="error">{error}</Alert>}
        <button
          className="btn-primary min-h-11 w-full"
          disabled={!Number.isFinite(Number(amount)) || Number(amount) <= 0}
        >
          <ArrowRight size={17} />
          Lanjutkan ke verifikasi
        </button>
      </form>
    </section>
  );
}
