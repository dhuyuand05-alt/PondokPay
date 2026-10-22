import { useState } from 'react';
import { api, idempotencyKey } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  Field,
  formatDate,
  formatMoney,
  Modal,
  PageHeader,
  SelectField,
  StatCard,
  StatusBadge,
} from '../../ui.jsx';
import { ActionForm, Table, useMutation } from './shared.jsx';

export function AdminCash({ token }) {
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState('');
  const [entryToReverse, setEntryToReverse] = useState(null);
  const [feeAmount, setFeeAmount] = useState('');
  const [expense, setExpense] = useState({
    category: 'Hosting/server',
    amount: '',
    description: '',
  });
  const [correctionReason, setCorrectionReason] = useState('');
  const [cashEntryKey, setCashEntryKey] = useState(() => idempotencyKey());
  const path = `/admin/cash?page=${page}&limit=20`;
  const { data, loading, error, refresh } = useApiData(path, token);
  const mutation = useMutation();
  const entries = data?.data || [];
  const submitFee = async (event) => {
    event.preventDefault();
    const result = await mutation.run(() =>
      api.post('/admin/cash/service-fee', { amount: feeAmount }, token),
    );
    if (result) {
      setModal('');
      refresh();
    }
  };
  const submitExpense = async (event) => {
    event.preventDefault();
    const result = await mutation.run(() =>
      api.post('/admin/cash/expenses', expense, token, { idempotencyKey: cashEntryKey }),
    );
    if (result) {
      setExpense({ category: 'Hosting/server', amount: '', description: '' });
      setModal('');
      refresh();
    }
  };
  const submitCorrection = async (event) => {
    event.preventDefault();
    const result = await mutation.run(() =>
      api.post(
        `/admin/cash/entries/${entryToReverse.id}/reverse`,
        { reason: correctionReason },
        token,
        { idempotencyKey: cashEntryKey },
      ),
    );
    if (result) {
      setEntryToReverse(null);
      setCorrectionReason('');
      refresh();
    }
  };
  const openModal = (name) => {
    mutation.setError('');
    if (name === 'expense') setCashEntryKey(idempotencyKey());
    setModal(name);
  };

  return (
    <>
      <PageHeader
        title="Kas admin"
        subtitle="Pantau pemasukan biaya layanan dan catat pengeluaran operasional."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              onClick={() => {
                setFeeAmount(data?.service_fee?.scheduled?.amount ?? '');
                openModal('fee');
              }}
            >
              Atur biaya layanan
            </button>
            <button className="btn-primary" onClick={() => openModal('expense')}>
              Catat pengeluaran
            </button>
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total pemasukan" value={formatMoney(data?.summary?.income)} />
        <StatCard label="Total pengeluaran" value={formatMoney(data?.summary?.expense)} />
        <StatCard label="Saldo kas admin" value={formatMoney(data?.summary?.balance)} />
        <StatCard
          label="Utang layanan bulan ini"
          value={formatMoney(data?.summary?.outstanding_service_fee)}
          detail="Belum tertagih; hangus saat bulan berganti"
        />
      </div>

      <section className="card mb-5 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm text-muted">Biaya layanan per santri / bulan</p>
          <p className="mt-1 text-xl font-semibold">
            {data?.service_fee?.current
              ? formatMoney(data.service_fee.current.amount)
              : 'Belum ditetapkan'}
          </p>
          <p className="mt-1 text-sm text-muted">
            {data?.service_fee?.scheduled
              ? `Tarif berikutnya ${formatMoney(data.service_fee.scheduled.amount)} mulai ${data.service_fee.scheduled.effective_from}.`
              : `Perubahan tarif berlaku mulai ${data?.service_fee?.next_effective_from || 'bulan depan'}.`}
          </p>
        </div>
        <Alert className="max-w-2xl">
          Tagihan diproses otomatis pada awal bulan untuk santri aktif. Jika saldo tidak cukup,
          tagihan menunggu top-up yang mencukupi dan sisa tagihan hangus saat bulan berganti.
        </Alert>
      </section>

      <Table
        headers={['Waktu', 'Jenis / kategori', 'Keterangan', 'Nominal', 'Pencatat', 'Koreksi']}
        loading={loading}
        error={error}
        onRetry={refresh}
        empty={{ title: 'Belum ada catatan kas' }}
        pagination={data?.pagination}
        onPage={setPage}
      >
        {entries.map((entry) => (
          <tr key={entry.id} className="hover:bg-canvas/70">
            <td className="table-cell whitespace-nowrap">{formatDate(entry.created_at, true)}</td>
            <td className="table-cell">
              <StatusBadge tone={entry.direction === 'income' ? 'green' : 'amber'}>
                {entry.direction === 'income' ? 'Pemasukan' : 'Pengeluaran'}
              </StatusBadge>
              <p className="mt-1 text-xs text-muted">{entry.category}</p>
            </td>
            <td className="table-cell">
              <p>{entry.description}</p>
              {entry.nis && (
                <p className="mt-1 text-xs text-muted">
                  {entry.nama_lengkap} · {entry.nis} · periode{' '}
                  {String(entry.billing_period).slice(0, 7)}
                </p>
              )}
              {entry.reverses_entry_id && (
                <p className="mt-1 text-xs text-muted">
                  Koreksi catatan #{entry.reverses_entry_id}
                </p>
              )}
            </td>
            <td className="table-cell whitespace-nowrap font-semibold">
              {entry.direction === 'income' ? '+' : '−'}
              {formatMoney(entry.amount)}
            </td>
            <td className="table-cell">{entry.created_by_username || 'Sistem'}</td>
            <td className="table-cell">
              {entry.is_reversed ? (
                <StatusBadge tone="gray">Sudah dikoreksi</StatusBadge>
              ) : (
                <button
                  className="font-semibold text-pondok-600 hover:underline"
                  onClick={() => {
                    mutation.setError('');
                    setCashEntryKey(idempotencyKey());
                    setCorrectionReason('');
                    setEntryToReverse(entry);
                  }}
                >
                  Koreksi
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>

      {modal === 'fee' && (
        <Modal title="Atur biaya layanan bulanan" onClose={() => !mutation.busy && setModal('')}>
          <div className="space-y-4">
            <Alert>
              Tarif baru berlaku mulai {data?.service_fee?.next_effective_from || 'bulan depan'}.
              Perubahan tidak mengubah tagihan bulan yang sedang berjalan.
            </Alert>
            <ActionForm
              onSubmit={submitFee}
              busy={mutation.busy}
              error={mutation.error}
              submitLabel="Simpan tarif"
              secondary={
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={mutation.busy}
                  onClick={() => setModal('')}
                >
                  Batal
                </button>
              }
            >
              <Field
                label="Nominal per santri / bulan"
                type="number"
                min="0"
                max="99999999.99"
                step="0.01"
                value={feeAmount}
                onChange={(event) => setFeeAmount(event.target.value)}
                required
              />
              <p className="text-xs text-muted">
                Isi 0 untuk menonaktifkan tagihan mulai bulan depan.
              </p>
            </ActionForm>
          </div>
        </Modal>
      )}

      {modal === 'expense' && (
        <Modal title="Catat pengeluaran kas" onClose={() => !mutation.busy && setModal('')}>
          <ActionForm
            onSubmit={submitExpense}
            busy={mutation.busy}
            error={mutation.error}
            submitLabel="Simpan pengeluaran"
            secondary={
              <button
                type="button"
                className="btn-secondary"
                disabled={mutation.busy}
                onClick={() => setModal('')}
              >
                Batal
              </button>
            }
          >
            <SelectField
              label="Kategori"
              value={expense.category}
              onChange={(event) => setExpense({ ...expense, category: event.target.value })}
            >
              <option>Hosting/server</option>
              <option>Domain/sertifikat</option>
              <option>Pemeliharaan web</option>
              <option>Operasional</option>
              <option>Lainnya</option>
            </SelectField>
            <Field
              label="Nominal"
              type="number"
              min="0.01"
              max="9999999999.99"
              step="0.01"
              value={expense.amount}
              onChange={(event) => setExpense({ ...expense, amount: event.target.value })}
              required
            />
            <Field
              label="Keterangan"
              value={expense.description}
              onChange={(event) => setExpense({ ...expense, description: event.target.value })}
              maxLength={500}
              required
            />
          </ActionForm>
        </Modal>
      )}

      {entryToReverse && (
        <Modal
          title="Koreksi catatan kas"
          onClose={() => !mutation.busy && setEntryToReverse(null)}
        >
          <div className="space-y-4">
            <Alert type="warning">
              Catatan asli tidak dihapus. Sistem akan membuat catatan pembalik sebesar{' '}
              {formatMoney(entryToReverse.amount)}.
            </Alert>
            <ActionForm
              onSubmit={submitCorrection}
              busy={mutation.busy}
              error={mutation.error}
              submitLabel="Buat catatan pembalik"
              secondary={
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={mutation.busy}
                  onClick={() => setEntryToReverse(null)}
                >
                  Batal
                </button>
              }
            >
              <Field
                label="Alasan koreksi"
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
                maxLength={500}
                required
              />
            </ActionForm>
          </div>
        </Modal>
      )}
    </>
  );
}
