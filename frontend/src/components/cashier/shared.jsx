import { ArrowRight } from 'lucide-react';
import { Alert, AmountLine, Field, StatusBadge } from '../../ui.jsx';

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
  return (
    <section className="card mt-4 p-4 sm:p-6">
      <div className="mb-5">
        <StatusBadge>Langkah 1 dari 3</StatusBadge>
        <h1 className="mt-3 text-xl font-semibold">Masukkan nominal belanja</h1>
        <p className="mt-1 text-sm text-muted">
          Isi total belanja sebelum memindai kredensial santri.
        </p>
      </div>
      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="label">Nominal belanja (Rp)</span>
          <input
            className="field min-h-16 text-2xl font-semibold tabular-nums sm:text-3xl"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <Field
          label="Keterangan"
          placeholder="Contoh: Makan siang"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
        />
        {error && <Alert type="error">{error}</Alert>}
        <button
          className="btn-primary min-h-12 w-full"
          disabled={!Number.isFinite(Number(amount)) || Number(amount) <= 0}
        >
          <ArrowRight size={18} />
          Lanjutkan ke kredensial
        </button>
      </form>
    </section>
  );
}
