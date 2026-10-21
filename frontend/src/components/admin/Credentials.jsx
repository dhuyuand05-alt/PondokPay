import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api } from '../../api.js';
import { useApiData } from '../../hooks.js';
import { Alert, Avatar, Field, Modal, PageHeader, SelectField, StatusBadge } from '../../ui.jsx';
import { ActionForm, StudentSearchPicker, Table, useMutation } from './shared.jsx';

export function AdminCredentials({ token }) {
  const { data, loading, error, refresh } = useApiData('/admin/credentials', token);
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    santri_id: '',
    rfid_uid: '',
    fingerprint_id: '',
    status: 'active',
  });
  const mutation = useMutation();
  const credentials = (data?.data || []).filter((item) =>
    [item.nama_lengkap, item.nis, item.rfid_uid, item.fingerprint_id].some((value) =>
      String(value ?? '')
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
    ),
  );
  const create = async (event) => {
    event.preventDefault();
    const body = { santri_id: Number(form.santri_id), status: form.status };
    if (form.rfid_uid) body.rfid_uid = form.rfid_uid;
    if (form.fingerprint_id) body.fingerprint_id = Number(form.fingerprint_id);
    const result = await mutation.run(() => api.post('/admin/credentials', body, token));
    if (result) {
      setModal(false);
      setForm({ santri_id: '', rfid_uid: '', fingerprint_id: '', status: 'active' });
      refresh();
    }
  };
  const block = async (item) => {
    if (!window.confirm('Blokir kredensial ini? Catatan tetap disimpan untuk audit.')) return;
    try {
      await api.delete(`/admin/credentials/${item.id}`, token);
      refresh();
    } catch (err) {
      window.alert(err.message);
    }
  };
  return (
    <>
      <PageHeader
        title="Kredensial santri"
        subtitle="Kelola identifier RFID dan fingerprint yang dapat diblokir tanpa menghapus riwayat."
        action={
          <button className="btn-primary" onClick={() => setModal(true)}>
            <Plus size={17} />
            Tambah kredensial
          </button>
        }
      />
      <Alert className="mb-4">
        Sistem hanya menyimpan identifier credential, bukan citra kartu atau template biometrik.
      </Alert>
      <div className="card mb-4 flex items-center gap-3 p-3">
        <Search size={19} className="ml-2 text-muted" />
        <input
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
          aria-label="Cari kredensial santri"
          placeholder="Cari nama, NIS, kartu RFID, atau sidik jari"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <Table
        headers={['Santri', 'Kartu RFID', 'ID sidik jari', 'Status', 'Tindakan']}
        loading={loading}
        error={error}
        onRetry={refresh}
        empty={{ title: 'Belum ada kredensial' }}
      >
        {credentials.map((item) => (
          <tr key={item.id}>
            <td className="table-cell">
              <div className="flex items-center gap-3">
                <Avatar name={item.nama_lengkap} />
                <div>
                  <p className="font-semibold">{item.nama_lengkap || 'Santri'}</p>
                  <p className="text-xs text-muted">
                    {item.nis} · ID {item.santri_id}
                  </p>
                </div>
              </div>
            </td>
            <td className="table-cell">{item.rfid_uid || '—'}</td>
            <td className="table-cell">{item.fingerprint_id ?? '—'}</td>
            <td className="table-cell">
              <StatusBadge tone={item.status === 'active' ? 'green' : 'gray'}>
                {item.status === 'active' ? 'Aktif' : 'Diblokir'}
              </StatusBadge>
            </td>
            <td className="table-cell">
              {item.status === 'active' && (
                <button className="text-sm font-semibold text-red-600" onClick={() => block(item)}>
                  Blokir
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {modal && (
        <Modal title="Tambah kredensial" onClose={() => setModal(false)}>
          <ActionForm
            onSubmit={create}
            busy={mutation.busy}
            error={mutation.error}
            submitLabel="Simpan kredensial"
          >
            <StudentSearchPicker
              token={token}
              value={form.santri_id}
              onChange={(santri_id) => setForm({ ...form, santri_id })}
              label="Santri"
            />
            <Field
              label="RFID UID (opsional)"
              value={form.rfid_uid}
              onChange={(e) => setForm({ ...form, rfid_uid: e.target.value })}
            />
            <Field
              label="Fingerprint ID (opsional)"
              type="number"
              min="0"
              value={form.fingerprint_id}
              onChange={(e) => setForm({ ...form, fingerprint_id: e.target.value })}
            />
            <SelectField
              label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Aktif</option>
              <option value="blocked">Diblokir</option>
            </SelectField>
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
