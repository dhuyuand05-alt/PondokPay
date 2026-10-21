import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  ErrorNotice,
  Field,
  Loading,
  PageHeader,
  SelectField,
  StatusBadge,
  TextAreaField,
} from '../../ui.jsx';
import { ActionForm, useMutation } from './shared.jsx';

export function AdminApprovals({ token }) {
  const [requestForm, setRequestForm] = useState({
    action: 'santri_topup',
    resource_id: '',
    jumlah: '',
    keterangan: '',
  });
  const [approvalId, setApprovalId] = useState('');
  const [result, setResult] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const [debouncedTargetSearch, setDebouncedTargetSearch] = useState('');
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

  const changeAction = (action) => {
    setRequestForm({ ...requestForm, action, resource_id: '' });
    setTargetSearch('');
    setDebouncedTargetSearch('');
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
      setResult(
        `Permintaan #${response.data.id} berstatus ${response.data.status}. Simpan ID ini untuk diproses admin lain.`,
      );
      setApprovalId(String(response.data.id));
    }
  };
  const decide = async (decision) => {
    const response = await mutation.run(() =>
      api.post(`/admin/financial-approvals/${approvalId}/${decision}`, {}, token),
    );
    if (response) setResult(response.message);
  };
  return (
    <>
      <PageHeader
        title="Persetujuan finansial"
        subtitle="Permintaan nominal besar perlu diperiksa admin kedua."
      />
      <Alert type="warning" className="mb-5">
        Admin yang membuat permintaan tidak dapat menyetujui permintaannya sendiri. Approval hanya
        berlaku 24 jam dan dipakai satu kali. API belum menyediakan endpoint daftar permintaan,
        sehingga ID approval perlu dibagikan secara aman kepada admin kedua.
      </Alert>
      {result && (
        <Alert type="success" className="mb-5">
          {result}
        </Alert>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-5 text-lg font-semibold">Ajukan permintaan</h2>
          <ActionForm
            onSubmit={create}
            busy={mutation.busy}
            error={mutation.error}
            submitLabel="Ajukan approval"
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
            <div>
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
              <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-line bg-white">
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
                      {target.status !== 'active' && (
                        <StatusBadge tone="gray">Nonaktif</StatusBadge>
                      )}
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
        <section className="card p-5">
          <h2 className="mb-2 text-lg font-semibold">Keputusan admin kedua</h2>
          <p className="mb-5 text-sm text-muted">
            Masukkan ID permintaan yang dibuat admin lain untuk menyetujui atau menolaknya.
          </p>
          <Field
            label="ID permintaan approval"
            type="number"
            min="1"
            value={approvalId}
            onChange={(e) => setApprovalId(e.target.value)}
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="btn-primary"
              disabled={!approvalId || mutation.busy}
              onClick={() => decide('approve')}
            >
              <Check size={17} />
              Setujui
            </button>
            <button
              className="btn-secondary text-red-600"
              disabled={!approvalId || mutation.busy}
              onClick={() => decide('reject')}
            >
              Tolak
            </button>
          </div>
          <p className="mt-5 text-xs text-muted">
            Untuk mengeksekusi transaksi, peminta tetap harus mengirim ID approval tersebut pada
            operasi finansial yang sesuai.
          </p>
        </section>
      </div>
    </>
  );
}
