import { useEffect, useState } from 'react';
import { Check, Eye, Inbox, RotateCw } from 'lucide-react';
import { api } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  Empty,
  ErrorNotice,
  Field,
  formatDate,
  formatMoney,
  Loading,
  PageHeader,
  Pagination,
  SelectField,
  StatusBadge,
  TextAreaField,
} from '../../ui.jsx';
import { ActionForm, useMutation } from './shared.jsx';

const pageSize = 10;

const actionLabels = {
  santri_topup: 'Top up santri',
  santri_withdrawal: 'Penarikan saldo santri',
  canteen_withdrawal: 'Pencairan kantin',
};

const statusLabels = {
  pending: 'Menunggu',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  consumed: 'Sudah digunakan',
  expired: 'Kedaluwarsa',
};

const statusTones = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
  consumed: 'gray',
  expired: 'gray',
};

const scopeLabels = [
  { value: 'inbox', label: 'Perlu ditinjau' },
  { value: 'mine', label: 'Permintaan saya' },
  { value: 'history', label: 'Riwayat' },
];

export function AdminApprovals({ token }) {
  const [requestForm, setRequestForm] = useState({
    action: 'santri_topup',
    resource_id: '',
    jumlah: '',
    keterangan: '',
  });
  const [result, setResult] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const [debouncedTargetSearch, setDebouncedTargetSearch] = useState('');
  const [scope, setScope] = useState('inbox');
  const [page, setPage] = useState(1);
  const [selectedApprovalId, setSelectedApprovalId] = useState('');
  const [approvalDetail, setApprovalDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailRevision, setDetailRevision] = useState(0);
  const mutation = useMutation();
  const isCanteenAction = requestForm.action === 'canteen_withdrawal';
  const resourcePath = isCanteenAction
    ? '/admin/kantin'
    : `/admin/santri?page=1&limit=100${
        debouncedTargetSearch ? `&search=${encodeURIComponent(debouncedTargetSearch)}` : ''
      }`;
  const {
    data: targetData,
    loading: targetsLoading,
    error: targetsError,
    refresh: refreshTargets,
  } = useApiData(resourcePath, token);
  const approvalPath = `/admin/financial-approvals?scope=${scope}&page=${page}&limit=${pageSize}`;
  const {
    data: approvalData,
    loading: approvalsLoading,
    error: approvalsError,
    refresh: refreshApprovals,
  } = useApiData(approvalPath, token);
  const targets = isCanteenAction
    ? (targetData?.data || []).map((canteen) => ({
        id: canteen.id,
        name: canteen.nama,
        detail: canteen.lokasi || 'Lokasi belum diatur',
        status: canteen.status,
      }))
    : (targetData?.data || [])
        .filter((student) => student.is_active)
        .map((student) => ({
          id: student.id,
          name: student.nama_lengkap,
          detail: `${student.nis} · ${student.asrama || 'Asrama belum diatur'}`,
          status: 'active',
        }));
  const filteredTargets =
    isCanteenAction && debouncedTargetSearch
      ? targets.filter((target) =>
          `${target.name} ${target.detail}`
            .toLocaleLowerCase()
            .includes(debouncedTargetSearch.toLocaleLowerCase()),
        )
      : targets;
  const selectedTarget = targets.find(
    (target) => String(target.id) === String(requestForm.resource_id),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedTargetSearch(targetSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [targetSearch]);

  useEffect(() => {
    if (!selectedApprovalId) {
      setApprovalDetail(null);
      setDetailError('');
      setDetailLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError('');
    api
      .get(`/admin/financial-approvals/${selectedApprovalId}`, token, {
        signal: controller.signal,
      })
      .then((response) => {
        setApprovalDetail(response.data);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setDetailError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [selectedApprovalId, token, detailRevision]);

  const changeAction = (action) => {
    setRequestForm({ ...requestForm, action, resource_id: '' });
    setTargetSearch('');
    setDebouncedTargetSearch('');
  };

  const changeScope = (nextScope) => {
    setScope(nextScope);
    setPage(1);
    setSelectedApprovalId('');
    setResult('');
  };

  const create = async (event) => {
    event.preventDefault();
    if (!requestForm.resource_id) {
      mutation.setError(
        `Pilih ${isCanteenAction ? 'kantin' : 'santri'} sebelum mengajukan persetujuan.`,
      );
      return;
    }
    const response = await mutation.run(() =>
      api.post(
        '/admin/financial-approvals',
        {
          ...requestForm,
          resource_id: Number(requestForm.resource_id),
          jumlah: Number(requestForm.jumlah),
          keterangan: requestForm.keterangan || null,
        },
        token,
      ),
    );
    if (response) {
      setResult(`Permintaan #${response.data.id} berhasil diajukan.`);
      setScope('mine');
      setPage(1);
      setSelectedApprovalId(String(response.data.id));
      refreshApprovals();
    }
  };

  const decide = async (decision) => {
    if (!approvalDetail) return;
    const response = await mutation.run(() =>
      api.post(`/admin/financial-approvals/${approvalDetail.id}/${decision}`, {}, token),
    );
    if (response) {
      setResult(response.message);
      refreshApprovals();
    }
    setDetailRevision((value) => value + 1);
  };

  const approvals = approvalData?.data || [];

  return (
    <>
      <PageHeader
        title="Persetujuan finansial"
        subtitle="Ajukan transaksi bernilai besar, tinjau permintaan admin lain, dan telusuri riwayat."
      />
      <Alert type="warning" className="mb-5">
        Admin yang membuat permintaan tidak dapat menyetujui permintaannya sendiri. Persetujuan
        berlaku 24 jam dan hanya dapat digunakan satu kali.
      </Alert>
      {result && (
        <Alert type="success" className="mb-5">
          {result}
        </Alert>
      )}
      <section className="card mb-6 p-5">
        <h2 className="mb-5 text-lg font-semibold">Ajukan permintaan</h2>
        <ActionForm
          onSubmit={create}
          busy={mutation.busy}
          error={mutation.error}
          submitLabel="Ajukan approval"
          className="grid gap-4 md:grid-cols-2"
        >
          <SelectField
            label="Jenis transaksi"
            value={requestForm.action}
            onChange={(e) => changeAction(e.target.value)}
          >
            <option value="santri_topup">Top up santri</option>
            <option value="santri_withdrawal">Penarikan saldo santri</option>
            <option value="canteen_withdrawal">Pencairan kantin</option>
          </SelectField>
          <Field
            label={`Cari ${isCanteenAction ? 'kantin' : 'santri'}`}
            type="search"
            placeholder={
              isCanteenAction
                ? 'Ketik nama atau lokasi kantin'
                : 'Ketik nama, NIS, atau asrama santri'
            }
            value={targetSearch}
            onChange={(event) => {
              setTargetSearch(event.target.value);
              setRequestForm({ ...requestForm, resource_id: '' });
            }}
            autoComplete="off"
          />
          <div className="md:col-span-2">
            <div className="max-h-56 overflow-y-auto rounded-xl border border-line bg-white">
              {targetsLoading ? (
                <Loading />
              ) : targetsError ? (
                <div className="p-3">
                  <ErrorNotice error={targetsError} onRetry={refreshTargets} />
                </div>
              ) : filteredTargets.length ? (
                filteredTargets.map((target) => (
                  <button
                    type="button"
                    key={target.id}
                    className={`flex w-full items-center gap-3 border-b border-line px-3 py-3 text-left last:border-0 hover:bg-pondok-50 ${
                      String(requestForm.resource_id) === String(target.id) ? 'bg-pondok-50' : ''
                    }`}
                    onClick={() =>
                      setRequestForm({ ...requestForm, resource_id: String(target.id) })
                    }
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{target.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {target.detail}
                      </span>
                    </span>
                    {target.status !== 'active' && <StatusBadge tone="gray">Nonaktif</StatusBadge>}
                    {String(requestForm.resource_id) === String(target.id) && (
                      <Check size={17} className="shrink-0 text-pondok-600" />
                    )}
                  </button>
                ))
              ) : (
                <p className="p-3 text-sm text-muted">
                  {targetSearch
                    ? `${isCanteenAction ? 'Kantin' : 'Santri'} tidak ditemukan.`
                    : `Belum ada ${isCanteenAction ? 'kantin' : 'santri'} tersedia.`}
                </p>
              )}
            </div>
            {requestForm.resource_id && (
              <p className="mt-2 text-xs text-muted">
                Terpilih: <span className="font-semibold text-ink">{selectedTarget?.name}</span>
              </p>
            )}
          </div>
          <Field
            label="Jumlah"
            type="number"
            min="0.01"
            step="0.01"
            value={requestForm.jumlah}
            onChange={(e) => setRequestForm({ ...requestForm, jumlah: e.target.value })}
            required
          />
          <TextAreaField
            label="Keterangan"
            value={requestForm.keterangan}
            onChange={(e) => setRequestForm({ ...requestForm, keterangan: e.target.value })}
          />
        </ActionForm>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            {scopeLabels.map((item) => (
              <button
                key={item.value}
                type="button"
                className={scope === item.value ? 'btn-primary' : 'btn-secondary'}
                onClick={() => changeScope(item.value)}
              >
                {item.value === 'inbox' && <Inbox size={16} />}
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className="btn-secondary ml-auto"
              onClick={() => refreshApprovals()}
              disabled={approvalsLoading}
            >
              <RotateCw size={16} />
              Muat ulang
            </button>
          </div>
          <div className="card overflow-hidden">
            {approvalsError ? (
              <div className="p-4">
                <ErrorNotice error={approvalsError} onRetry={refreshApprovals} />
              </div>
            ) : approvalsLoading ? (
              <Loading label="Memuat permintaan persetujuan..." />
            ) : approvals.length ? (
              <>
                <div className="divide-y divide-line">
                  {approvals.map((approval) => (
                    <button
                      key={approval.id}
                      type="button"
                      className={`flex w-full flex-wrap items-center gap-3 p-4 text-left hover:bg-pondok-50 ${
                        String(approval.id) === selectedApprovalId ? 'bg-pondok-50' : ''
                      }`}
                      onClick={() => setSelectedApprovalId(String(approval.id))}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">
                            #{approval.id} · {actionLabels[approval.action] || approval.action}
                          </span>
                          <StatusBadge tone={statusTones[approval.status]}>
                            {statusLabels[approval.status] || approval.status}
                          </StatusBadge>
                        </span>
                        <span className="mt-1 block truncate text-sm text-muted">
                          {approval.resource_name || `Data ${approval.resource_id}`} ·{' '}
                          {formatMoney(approval.amount)}
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          Peminta: {approval.requester_username} ·{' '}
                          {formatDate(approval.created_at, true)}
                        </span>
                      </span>
                      <Eye size={18} className="shrink-0 text-pondok-600" />
                    </button>
                  ))}
                </div>
                <Pagination pagination={approvalData?.pagination} onPage={setPage} />
              </>
            ) : (
              <Empty
                title={
                  scope === 'inbox'
                    ? 'Tidak ada permintaan untuk ditinjau'
                    : 'Belum ada riwayat persetujuan'
                }
                description={
                  scope === 'inbox'
                    ? 'Permintaan admin lain yang masih berlaku akan muncul di sini.'
                    : 'Permintaan yang sesuai dengan bagian ini akan ditampilkan di sini.'
                }
              />
            )}
          </div>
        </div>

        <aside className="card min-h-72 p-5">
          <h2 className="mb-4 text-lg font-semibold">Detail permintaan</h2>
          {!selectedApprovalId ? (
            <Empty
              title="Pilih permintaan"
              description="Pilih salah satu permintaan untuk melihat detail dan mengambil keputusan."
            />
          ) : detailLoading ? (
            <Loading label="Memuat detail permintaan..." />
          ) : detailError ? (
            <ErrorNotice
              error={detailError}
              onRetry={() => setDetailRevision((value) => value + 1)}
            />
          ) : approvalDetail ? (
            <div className="space-y-4">
              {mutation.error && <Alert type="error">{mutation.error}</Alert>}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">Permintaan #{approvalDetail.id}</span>
                <StatusBadge tone={statusTones[approvalDetail.status]}>
                  {statusLabels[approvalDetail.status] || approvalDetail.status}
                </StatusBadge>
              </div>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-muted">Jenis transaksi</dt>
                  <dd className="font-medium">
                    {actionLabels[approvalDetail.action] || approvalDetail.action}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Santri/kantin</dt>
                  <dd className="font-medium">
                    {approvalDetail.resource_name || `Data ${approvalDetail.resource_id}`}
                  </dd>
                  {approvalDetail.resource_detail && (
                    <dd className="text-xs text-muted">{approvalDetail.resource_detail}</dd>
                  )}
                </div>
                <div>
                  <dt className="text-muted">Jumlah</dt>
                  <dd className="text-lg font-semibold">{formatMoney(approvalDetail.amount)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Keterangan</dt>
                  <dd className="whitespace-pre-wrap">
                    {approvalDetail.keterangan || 'Tidak ada keterangan.'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Diajukan oleh</dt>
                  <dd className="font-medium">{approvalDetail.requester_username}</dd>
                  <dd className="text-xs text-muted">
                    {formatDate(approvalDetail.created_at, true)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Batas waktu</dt>
                  <dd>{formatDate(approvalDetail.expires_at, true)}</dd>
                </div>
                {approvalDetail.approver_username && (
                  <div>
                    <dt className="text-muted">Diputuskan oleh</dt>
                    <dd className="font-medium">{approvalDetail.approver_username}</dd>
                    <dd className="text-xs text-muted">
                      {formatDate(approvalDetail.decided_at, true)}
                    </dd>
                  </div>
                )}
                {approvalDetail.consumed_at && (
                  <div>
                    <dt className="text-muted">Digunakan pada</dt>
                    <dd>{formatDate(approvalDetail.consumed_at, true)}</dd>
                  </div>
                )}
              </dl>
              {approvalDetail.can_decide && (
                <div className="flex flex-wrap gap-3 border-t border-line pt-4">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={mutation.busy}
                    onClick={() => decide('approve')}
                  >
                    <Check size={17} />
                    {mutation.busy ? 'Memproses...' : 'Setujui'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-red-600"
                    disabled={mutation.busy}
                    onClick={() => decide('reject')}
                  >
                    Tolak
                  </button>
                </div>
              )}
              {approvalDetail.status === 'approved' && (
                <Alert>
                  Persetujuan menunggu peminta untuk menjalankan transaksi yang sesuai sebelum batas
                  waktu.
                </Alert>
              )}
            </div>
          ) : null}
        </aside>
      </section>
    </>
  );
}
