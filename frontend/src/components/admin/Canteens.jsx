import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Coffee, Plus } from 'lucide-react';
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
  Loading,
  Modal,
  PageHeader,
  SelectField,
  StatusBadge,
  TextAreaField,
} from '../../ui.jsx';
import { ActionForm, typeName } from './shared.jsx';
import { CanteenOperations } from './CanteenOperations.jsx';

export function AdminCanteens({ token }) {
  const [selectedId, setSelectedId] = useState('');
  const [modal, setModal] = useState('');
  const [form, setForm] = useState({ nama: '', lokasi: '', status: 'active' });
  const [cashierId, setCashierId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [approvalId, setApprovalId] = useState('');
  const [cashierApprovalId, setCashierApprovalId] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const payoutOperationKey = useRef(null);
  const { data: canteenData, loading, error, refresh } = useApiData('/admin/kantin', token);
  const { data: userData } = useApiData('/users', token);
  const canteens = canteenData?.data || [];
  const selected = canteens.find((item) => String(item.id) === String(selectedId)) || canteens[0];
  const { data: cashierData, refresh: refreshCashiers } = useApiData(
    selected ? `/admin/kantin/${selected.id}/kasir` : '/admin/kantin',
    token,
  );
  const { data: historyData, refresh: refreshHistory } = useApiData(
    selected ? `/admin/kantin/${selected.id}/transaksi?limit=5` : '/admin/kantin',
    token,
  );
  const { data: payoutApprovalData, refresh: refreshPayoutApprovals } = useApiData(
    selected ? `/admin/kantin/${selected.id}/pencairan/persetujuan-kasir` : '/admin/kantin',
    token,
  );
  const cashiers = cashierData?.data || [];
  const payoutApprovals = payoutApprovalData?.data || [];
  const availableCashiers = (userData?.users || []).filter(
    (item) => item.role === 'kasir' && item.is_active,
  );

  const submitCanteen = async (event) => {
    event.preventDefault();
    setBusy(true);
    setActionError('');
    try {
      await api.post('/admin/kantin', form, token);
      setModal('');
      setForm({ nama: '', lokasi: '', status: 'active' });
      refresh();
      setNotice('Kantin berhasil dibuat.');
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const editCanteen = async (event) => {
    event.preventDefault();
    setBusy(true);
    setActionError('');
    try {
      await api.patch(`/admin/kantin/${selected.id}`, form, token);
      setModal('');
      setNotice('Data kantin berhasil diperbarui.');
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const assignCashier = async (event) => {
    event.preventDefault();
    setBusy(true);
    setActionError('');
    try {
      await api.post(`/admin/kantin/${selected.id}/kasir`, { user_id: Number(cashierId) }, token);
      setCashierId('');
      refreshCashiers();
      setNotice('Kasir berhasil ditugaskan.');
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeCashier = async (id) => {
    if (!window.confirm('Cabut penugasan kasir ini?')) return;
    try {
      await api.delete(`/admin/kantin/${selected.id}/kasir/${id}`, token);
      refreshCashiers();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const payout = async (event) => {
    event.preventDefault();
    if (!cashierApprovalId) {
      setActionError('Pencairan wajib dikonfirmasi kasir yang ditugaskan terlebih dahulu.');
      return;
    }
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      if (!payoutOperationKey.current) payoutOperationKey.current = idempotencyKey();
      const result = await api.post(
        `/admin/kantin/${selected.id}/pencairan`,
        {
          jumlah: Number(amount),
          keterangan: description || null,
          cashier_approval_id: Number(cashierApprovalId),
          ...(approvalId ? { approval_id: Number(approvalId) } : {}),
        },
        token,
        { idempotencyKey: payoutOperationKey.current },
      );
      payoutOperationKey.current = null;
      setNotice(result.message);
      setModal('');
      setAmount('');
      setDescription('');
      setApprovalId('');
      setCashierApprovalId('');
      refresh();
      refreshHistory();
      refreshPayoutApprovals();
    } catch (err) {
      if (err.status === 403 && err.body?.approval_required)
        setActionError(
          'Pencairan ini memerlukan persetujuan admin kedua. Buat permintaan persetujuan dahulu.',
        );
      else setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const askCashierApproval = async () => {
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      const result = await api.post(
        `/admin/kantin/${selected.id}/pencairan/persetujuan-kasir`,
        { jumlah: Number(amount), keterangan: description || null },
        token,
      );
      setNotice(`Permintaan konfirmasi kasir #${result.data.id} berhasil dibuat.`);
      refreshPayoutApprovals();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const askPayoutApproval = async () => {
    setBusy(true);
    setActionError('');
    try {
      const result = await api.post(
        '/admin/financial-approvals',
        {
          action: 'canteen_withdrawal',
          resource_id: selected.id,
          jumlah: Number(amount),
          keterangan: description || null,
        },
        token,
      );
      setApprovalId(String(result.data.id));
      setNotice(
        `Approval #${result.data.id} dibuat. Admin lain perlu menyetujuinya sebelum pencairan.`,
      );
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (!window.confirm('Nonaktifkan kantin? Saldo dan riwayat tetap disimpan.')) return;
    try {
      await api.delete(`/admin/kantin/${selected.id}`, token);
      refresh();
    } catch (err) {
      setActionError(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Kantin & kasir"
        subtitle="Atur kantin, penugasan kasir, dan pencairan dana secara terpusat."
        action={
          <button
            className="btn-primary"
            onClick={() => {
              setForm({ nama: '', lokasi: '', status: 'active' });
              setActionError('');
              setModal('create');
            }}
          >
            <Plus size={17} />
            Tambah kantin
          </button>
        }
      />
      {notice && (
        <Alert type="success" className="mb-4">
          {notice}
        </Alert>
      )}
      {actionError && (
        <Alert type="error" className="mb-4">
          {actionError}
        </Alert>
      )}
      <ErrorNotice error={error} onRetry={refresh} />
      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="mb-4 flex justify-between text-sm text-muted">
            <span>{canteens.length} kantin terdaftar</span>
            <span className="badge-green">
              Saldo {formatMoney(canteens.reduce((sum, row) => sum + Number(row.saldo || 0), 0))}
            </span>
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.25fr_0.8fr]">
            <div className="space-y-3">
              {canteens.length ? (
                canteens.map((canteen) => (
                  <button
                    key={canteen.id}
                    onClick={() => setSelectedId(String(canteen.id))}
                    className={`card w-full p-5 text-left transition hover:border-pondok-500 ${String(selected?.id) === String(canteen.id) ? 'border-2 border-pondok-600' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-pondok-50 text-pondok-600">
                        <Coffee size={21} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold">{canteen.nama}</p>
                          <StatusBadge tone={canteen.status === 'active' ? 'green' : 'gray'}>
                            {canteen.status === 'active' ? 'Aktif' : 'Nonaktif'}
                          </StatusBadge>
                        </div>
                        <p className="mt-1 text-sm text-muted">
                          {canteen.lokasi || 'Lokasi belum diatur'}
                        </p>
                        <p className="mt-3 text-xs text-muted">Saldo kantin</p>
                        <p className="mt-1 text-2xl font-semibold">{formatMoney(canteen.saldo)}</p>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <Empty
                  title="Belum ada kantin"
                  description="Tambahkan kantin pertama untuk mulai mengatur kasir."
                />
              )}
            </div>
            {selected && (
              <aside className="space-y-4">
                <section className="card p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-medium">{selected.nama}</h2>
                    <StatusBadge tone={selected.status === 'active' ? 'green' : 'gray'}>
                      {selected.status}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {selected.lokasi || 'Lokasi belum diatur'}
                  </p>
                  <div className="mt-5 flex items-center justify-between">
                    <span className="text-sm text-muted">Saldo tersedia</span>
                    <span className="text-xl font-semibold">{formatMoney(selected.saldo)}</span>
                  </div>
                  <button
                    className="btn-secondary mt-4 w-full"
                    onClick={() => {
                      setForm({
                        nama: selected.nama,
                        lokasi: selected.lokasi || '',
                        status: selected.status,
                      });
                      setActionError('');
                      setModal('edit');
                    }}
                  >
                    Ubah data kantin
                  </button>
                  <button
                    className="btn-primary mt-2 w-full"
                    onClick={() => {
                      setActionError('');
                      setAmount('');
                      setDescription('');
                      setApprovalId('');
                      setCashierApprovalId('');
                      setNotice('');
                      refreshPayoutApprovals();
                      setModal('payout');
                    }}
                  >
                    <ArrowUpRight size={17} />
                    Cairkan saldo
                  </button>
                  <p className="mt-3 text-xs text-muted">
                    Pencairan hanya oleh admin pondok. Kasir tidak dapat mencairkan saldo kantin.
                  </p>
                  <button className="mt-3 text-sm text-red-600" onClick={deactivate}>
                    Nonaktifkan kantin
                  </button>
                  <hr className="my-5 border-line" />
                  <h3 className="font-semibold">Kasir ditugaskan</h3>
                  {cashiers.map((cashier) => (
                    <div key={cashier.id} className="flex items-center gap-3 py-3">
                      <Avatar name={cashier.username} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{cashier.username}</p>
                        <p className="text-xs text-muted">Kasir</p>
                      </div>
                      <button
                        className="text-xs font-semibold text-red-600"
                        onClick={() => removeCashier(cashier.id)}
                      >
                        Lepas
                      </button>
                    </div>
                  ))}
                  {!cashiers.length && (
                    <p className="py-3 text-sm text-muted">Belum ada kasir ditugaskan.</p>
                  )}
                  <form className="mt-2 space-y-3" onSubmit={assignCashier}>
                    <SelectField
                      label="Tambahkan kasir"
                      value={cashierId}
                      onChange={(e) => setCashierId(e.target.value)}
                      required
                    >
                      <option value="">Pilih akun kasir</option>
                      {availableCashiers.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.username}
                        </option>
                      ))}
                    </SelectField>
                    <button className="btn-secondary w-full" disabled={busy || !cashierId}>
                      Tugaskan kasir
                    </button>
                  </form>
                </section>
                <section className="card p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Riwayat kantin</h3>
                    <Link to="/admin/transaksi" className="text-sm font-semibold text-pondok-600">
                      Semua
                    </Link>
                  </div>
                  {(historyData?.data || []).slice(0, 4).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 border-b border-line py-3 last:border-0"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-pondok-50 text-pondok-600">
                        <ArrowDownLeft size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {typeName(item.tipe_transaksi)}{' '}
                          {item.santri_id ? `· ${item.nama_lengkap || 'Santri'}` : 'oleh admin'}
                        </p>
                        <p className="text-xs text-muted">{formatDate(item.created_at, true)}</p>
                      </div>
                      <span className="text-sm font-semibold">
                        {item.tipe_transaksi === 'penjualan' ? '+' : '−'}
                        {formatMoney(item.jumlah)}
                      </span>
                    </div>
                  ))}
                </section>
              </aside>
            )}
          </div>
          {selected && <CanteenOperations token={token} canteenId={selected.id} cashiers={cashiers} />}
        </>
      )}
      {(modal === 'create' || modal === 'edit') && (
        <Modal
          title={modal === 'create' ? 'Tambah kantin' : 'Ubah data kantin'}
          onClose={() => setModal('')}
        >
          <ActionForm
            onSubmit={modal === 'create' ? submitCanteen : editCanteen}
            busy={busy}
            error={actionError}
            submitLabel={modal === 'create' ? 'Buat kantin' : 'Simpan perubahan'}
          >
            <Field
              label="Nama kantin"
              value={form.nama}
              onChange={(e) => setForm({ ...form, nama: e.target.value })}
              required
            />
            <Field
              label="Lokasi"
              value={form.lokasi}
              onChange={(e) => setForm({ ...form, lokasi: e.target.value })}
            />
            <SelectField
              label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </SelectField>
          </ActionForm>
        </Modal>
      )}
      {modal === 'payout' && selected && (
        <Modal title="Cairkan saldo kantin" onClose={() => setModal('')}>
          <p className="mb-4 text-sm text-muted">
            {selected.nama} · Saldo {formatMoney(selected.saldo)}
          </p>
          <Alert type="warning" className="mb-4">
            Setiap pencairan harus dikonfirmasi oleh kasir yang ditugaskan melalui akun kasirnya
            sendiri setelah login dengan MFA.
          </Alert>
          {notice && (
            <Alert type="success" className="mb-4">
              {notice}
            </Alert>
          )}
          <ActionForm
            onSubmit={payout}
            busy={busy}
            error={actionError}
            submitLabel="Jalankan pencairan"
          >
            <Field
              label="Nominal"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setCashierApprovalId('');
              }}
              required
            />
            <TextAreaField
              label="Keterangan"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setCashierApprovalId('');
              }}
              maxLength={1000}
            />
            <Field
              label="ID persetujuan admin kedua (untuk jumlah besar)"
              value={approvalId}
              onChange={(e) => setApprovalId(e.target.value)}
            />
            <div className="space-y-3 rounded-xl border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Konfirmasi kasir</p>
                <button
                  type="button"
                  className="text-xs font-semibold text-pondok-600"
                  onClick={refreshPayoutApprovals}
                >
                  Muat ulang
                </button>
              </div>
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={askCashierApproval}
                disabled={busy || !amount}
              >
                Minta konfirmasi kasir
              </button>
              {payoutApprovals
                .filter(
                  (item) =>
                    Number(item.amount).toFixed(2) === Number(amount || 0).toFixed(2) &&
                    (item.keterangan ?? '') === (description || ''),
                )
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-lg bg-canvas p-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">Permintaan #{item.id}</p>
                      <p className="text-xs text-muted">
                        {item.cashier_username
                          ? `Dikonfirmasi oleh ${item.cashier_username}`
                          : 'Menunggu kasir'}
                      </p>
                    </div>
                    <StatusBadge
                      tone={
                        item.status === 'approved'
                          ? 'green'
                          : item.status === 'pending'
                            ? 'amber'
                            : 'gray'
                      }
                    >
                      {{
                        pending: 'Menunggu',
                        approved: 'Disetujui',
                        rejected: 'Ditolak',
                        consumed: 'Digunakan',
                        expired: 'Kedaluwarsa',
                      }[item.status] || item.status}
                    </StatusBadge>
                    {item.status === 'approved' && (
                      <button
                        type="button"
                        className="text-xs font-semibold text-pondok-600"
                        onClick={() => setCashierApprovalId(String(item.id))}
                      >
                        {cashierApprovalId === String(item.id) ? 'Dipilih' : 'Pilih'}
                      </button>
                    )}
                  </div>
                ))}
              {cashierApprovalId && (
                <p className="text-xs font-medium text-pondok-700">
                  Persetujuan kasir #{cashierApprovalId} dipilih.
                </p>
              )}
            </div>
          </ActionForm>
          {actionError.includes('memerlukan persetujuan') && (
            <button
              className="btn-secondary mt-3 w-full"
              onClick={askPayoutApproval}
              disabled={busy}
            >
              Ajukan persetujuan admin kedua
            </button>
          )}
        </Modal>
      )}
    </>
  );
}
