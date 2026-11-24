import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, ShieldCheck, Wallet } from 'lucide-react';
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
  StatusBadge,
  TextAreaField,
} from '../../ui.jsx';
import { ActionForm, EditStudentModal, typeName } from './shared.jsx';

export function AdminStudentDetail({ token }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useApiData(`/admin/santri/${id}`, token);
  const student = data?.data;
  const [modal, setModal] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [approvalId, setApprovalId] = useState('');
  const [approvalPending, setApprovalPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [busy, setBusy] = useState(false);
  const [credential, setCredential] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [transactionsError, setTransactionsError] = useState('');
  const operationKey = useRef(null);

  useEffect(() => {
    if (!student) return;
    api
      .get(`/admin/transaksi?santri_id=${id}&limit=5`, token)
      .then((result) => setTransactions(result.data || []))
      .catch((err) => setTransactionsError(err.message));
  }, [student, id, token]);

  const submitMoney = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMutationError('');
    setNotice('');
    const path = `/admin/santri/${id}/${modal}`;
    const body = { jumlah: Number(amount), keterangan: description || null };
    if (approvalId) body.approval_id = Number(approvalId);
    if (!operationKey.current) operationKey.current = idempotencyKey();
    try {
      const result = await api.post(path, body, token, { idempotencyKey: operationKey.current });
      setNotice(result.message || 'Transaksi berhasil.');
      operationKey.current = null;
      setModal('');
      setAmount('');
      setDescription('');
      setApprovalId('');
      setApprovalPending(false);
      refresh();
    } catch (err) {
      if (err.status === 403 && err.body?.approval_required) {
        setApprovalPending(true);
        setMutationError(
          'Transaksi ini memerlukan persetujuan admin kedua. Ajukan approval dengan nominal dan keterangan yang sama.',
        );
      } else setMutationError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const requestApproval = async () => {
    setBusy(true);
    setMutationError('');
    try {
      const action = modal === 'topup' ? 'santri_topup' : 'santri_withdrawal';
      const result = await api.post(
        '/admin/financial-approvals',
        {
          action,
          resource_id: Number(id),
          jumlah: Number(amount),
          keterangan: description || null,
        },
        token,
      );
      setApprovalId(String(result.data.id));
      setNotice(
        `Permintaan persetujuan #${result.data.id} dibuat. Minta admin lain menyetujuinya, lalu lanjutkan transaksi.`,
      );
    } catch (err) {
      setMutationError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const registerCredential = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMutationError('');
    try {
      const body =
        modal === 'kartu' ? { rfid_uid: credential } : { fingerprint_id: Number(credential) };
      await api.post(
        `/admin/santri/${id}/${modal === 'kartu' ? 'kartu' : 'sidik-jari'}`,
        body,
        token,
      );
      setNotice('Kredensial berhasil didaftarkan.');
      setModal('');
      setCredential('');
      refresh();
    } catch (err) {
      setMutationError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (!window.confirm('Nonaktifkan akun santri ini? Saldo dan riwayat akan tetap disimpan.'))
      return;
    setMutationError('');
    try {
      await api.delete(`/admin/santri/${id}`, token);
      refresh();
    } catch (err) {
      setMutationError(err.message);
    }
  };

  if (loading) return <Loading />;
  if (error || !student)
    return (
      <>
        <ErrorNotice error={error || 'Data santri tidak ditemukan.'} onRetry={refresh} />
        <button className="btn-secondary" onClick={() => navigate('/admin/santri')}>
          Kembali ke daftar santri
        </button>
      </>
    );
  return (
    <>
      <PageHeader
        title="Detail santri"
        subtitle={`Data santri / ${student.nama_lengkap}`}
        action={
          <button className="btn-secondary" onClick={() => setModal('edit')}>
            Ubah data santri
          </button>
        }
      />
      {notice && (
        <Alert type="success" className="mb-4">
          {notice}
        </Alert>
      )}
      {mutationError && (
        <Alert type="error" className="mb-4">
          {mutationError}
        </Alert>
      )}
      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.8fr]">
        <div className="space-y-5">
          <section className="card p-5">
            <div className="flex items-center gap-3 border-b border-line pb-4">
              <Avatar name={student.nama_lengkap} className="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{student.nama_lengkap}</p>
                <p className="text-sm text-muted">
                  {student.nis} · {student.asrama || 'Asrama belum diatur'}
                </p>
              </div>
              <StatusBadge tone={student.is_active ? 'green' : 'gray'}>
                {student.is_active ? 'Aktif' : 'Nonaktif'}
              </StatusBadge>
            </div>
            <div className="grid gap-3 py-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted">Saldo tersedia</p>
                <p className="mt-1 text-3xl font-semibold">{formatMoney(student.saldo)}</p>
              </div>
              <div className="space-y-1">
                <p className="flex justify-between text-sm">
                  <span className="text-muted">Username</span>
                  <span>{student.username || '—'}</span>
                </p>
                <p className="flex justify-between text-sm">
                  <span className="text-muted">Limit harian</span>
                  <span>{formatMoney(student.limit_harian)}</span>
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className="btn-primary"
                onClick={() => {
                  setModal('topup');
                  setNotice('');
                  setMutationError('');
                }}
              >
                <ArrowDownLeft size={17} />
                Top up saldo
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setModal('tarik');
                  setNotice('');
                  setMutationError('');
                }}
              >
                <ArrowUpRight size={17} />
                Penarikan
              </button>
            </div>
          </section>
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Akun & kredensial</h2>
              <Link to="/admin/credentials" className="text-sm font-semibold text-pondok-600">
                Kelola
              </Link>
            </div>
            <div className="mt-4 divide-y divide-line text-sm">
              <p className="flex justify-between py-3">
                <span className="text-muted">Username</span>
                <span>{student.username || '—'}</span>
              </p>
              <p className="flex justify-between py-3">
                <span className="text-muted">Password</span>
                <span>Tidak ditampilkan</span>
              </p>
            </div>
            <p className="mt-3 text-xs text-muted">
              Kelola kartu RFID dan ID sidik jari di menu Kredensial.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  setModal('kartu');
                  setCredential('');
                }}
              >
                Daftarkan kartu
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setModal('sidik-jari');
                  setCredential('');
                }}
              >
                Daftarkan sidik jari
              </button>
              <button className="btn-secondary" onClick={deactivate}>
                Nonaktifkan santri
              </button>
            </div>
          </section>
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between p-5">
              <h2 className="font-semibold">Aktivitas terakhir</h2>
              <Link
                to={`/admin/transaksi?santri_id=${id}`}
                className="text-sm font-semibold text-pondok-600"
              >
                Semua riwayat →
              </Link>
            </div>
            {transactionsError && (
              <p className="px-5 pb-3 text-sm text-red-600">{transactionsError}</p>
            )}
            {!transactions.length ? (
              <Empty title="Belum ada transaksi" />
            ) : (
              transactions.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 border-t border-line px-5 py-4"
                >
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-pondok-50 text-pondok-600">
                    <Wallet size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {typeName(item.tipe_transaksi)} · #{item.id}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {item.keterangan || item.nama_kantin || formatDate(item.created_at, true)}
                    </p>
                  </div>
                  <p className="font-semibold">
                    {['topup', 'refund_belanja'].includes(item.tipe_transaksi) ? '+' : '−'}
                    {formatMoney(item.jumlah)}
                  </p>
                </div>
              ))
            )}
          </section>
        </div>
        <Alert className="h-fit">
          Operasi saldo dicatat dalam ledger yang tidak dapat diubah. Transaksi besar membutuhkan
          admin lain untuk menyetujui terlebih dahulu.
        </Alert>
      </div>
      {modal === 'topup' || modal === 'tarik' ? (
        <Modal
          title={modal === 'topup' ? 'Top up saldo' : 'Penarikan saldo'}
          onClose={() => setModal('')}
        >
          <p className="mb-5 text-sm text-muted">
            Untuk {student.nama_lengkap} · {student.nis}
          </p>
          <ActionForm
            onSubmit={submitMoney}
            busy={busy}
            error={mutationError}
            submitLabel={
              approvalId
                ? 'Lanjutkan transaksi'
                : modal === 'topup'
                  ? 'Top up saldo'
                  : 'Tarik saldo'
            }
          >
            <Field
              label="Nominal"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <TextAreaField
              label="Keterangan"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              placeholder="Tujuan transaksi"
            />
            <Field label="Saldo saat ini" value={formatMoney(student.saldo)} readOnly />
            {approvalId && (
              <Field
                label="ID persetujuan"
                value={approvalId}
                onChange={(e) => setApprovalId(e.target.value)}
                hint="Admin kedua harus menyetujui dahulu. Lanjutkan dengan jumlah dan keterangan yang persis sama."
              />
            )}
          </ActionForm>
          {approvalPending && !approvalId && (
            <button
              className="btn-secondary mt-3 w-full"
              disabled={busy || !amount}
              onClick={requestApproval}
            >
              <ShieldCheck size={17} />
              Ajukan persetujuan admin kedua
            </button>
          )}
          {approvalId && (
            <div className="mt-4">
              <Alert type="warning">
                Pastikan approval telah disetujui admin lain sebelum menjalankan transaksi.
              </Alert>
            </div>
          )}
        </Modal>
      ) : null}
      {modal === 'kartu' || modal === 'sidik-jari' ? (
        <Modal
          title={modal === 'kartu' ? 'Daftarkan kartu RFID' : 'Daftarkan sidik jari'}
          onClose={() => setModal('')}
        >
          <ActionForm
            onSubmit={registerCredential}
            busy={busy}
            error={mutationError}
            submitLabel="Daftarkan"
          >
            <Field
              label={modal === 'kartu' ? 'RFID UID' : 'Fingerprint ID'}
              type={modal === 'kartu' ? 'text' : 'number'}
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              required
            />
          </ActionForm>
          <p className="mt-4 text-xs text-muted">
            Simpan identifier saja, bukan gambar atau template biometrik.
          </p>
        </Modal>
      ) : null}
      {modal === 'edit' && (
        <EditStudentModal
          token={token}
          student={student}
          onClose={() => setModal('')}
          onSaved={() => {
            setModal('');
            refresh();
          }}
        />
      )}
    </>
  );
}
