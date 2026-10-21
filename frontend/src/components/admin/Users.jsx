import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  Avatar,
  formatDate,
  Modal,
  PageHeader,
  SelectField,
  StatusBadge,
} from '../../ui.jsx';
import { ActionForm, Table, useMutation } from './shared.jsx';

export function AdminUsers({ token }) {
  const { data, loading, error, refresh } = useApiData('/users', token);
  const [modal, setModal] = useState('');
  const [form, setForm] = useState({ username: '', password: '', role: 'kasir' });
  const [selectedUser, setSelectedUser] = useState(null);
  const [editForm, setEditForm] = useState({
    username: '',
    password: '',
    role: '',
    is_active: true,
  });
  const mutation = useMutation();
  const create = async (event) => {
    event.preventDefault();
    const result = await mutation.run(() => api.post('/users', form, token));
    if (result) {
      setModal('');
      setForm({ username: '', password: '', role: 'kasir' });
      refresh();
    }
  };
  const update = async (event) => {
    event.preventDefault();
    const body = {
      username: editForm.username,
      role: editForm.role,
      is_active: editForm.is_active,
    };
    if (editForm.password) body.password = editForm.password;
    const result = await mutation.run(() => api.patch(`/users/${selectedUser.id}`, body, token));
    if (result) {
      setModal('');
      setSelectedUser(null);
      refresh();
    }
  };
  const rows = data?.users || [];
  return (
    <>
      <PageHeader
        title="Akun pengguna"
        subtitle="Kelola akun admin, kasir, wali, dan santri."
        action={
          <button
            className="btn-primary"
            onClick={() => {
              setForm({ username: '', password: '', role: 'kasir' });
              setModal('create');
            }}
          >
            <Plus size={17} />
            Buat akun
          </button>
        }
      />
      <Table
        headers={['Akun', 'Role', 'MFA', 'Status', 'Dibuat', 'Tindakan']}
        loading={loading}
        error={error}
        onRetry={refresh}
        empty={{ title: 'Belum ada pengguna' }}
      >
        {rows.map((person) => (
          <tr key={person.id}>
            <td className="table-cell">
              <div className="flex items-center gap-3">
                <Avatar name={person.username} />
                <div>
                  <p className="font-semibold">{person.username}</p>
                  <p className="text-xs text-muted">ID {person.id}</p>
                </div>
              </div>
            </td>
            <td className="table-cell capitalize">{person.role}</td>
            <td className="table-cell">
              {['admin', 'kasir'].includes(person.role) ? (
                <StatusBadge tone={person.mfa_enabled ? 'green' : 'amber'}>
                  {person.mfa_enabled ? 'Aktif' : 'Belum aktif'}
                </StatusBadge>
              ) : (
                '—'
              )}
            </td>
            <td className="table-cell">
              <StatusBadge tone={person.is_active ? 'green' : 'gray'}>
                {person.is_active ? 'Aktif' : 'Nonaktif'}
              </StatusBadge>
            </td>
            <td className="table-cell">{formatDate(person.created_at)}</td>
            <td className="table-cell">
              <button
                className="text-sm font-semibold text-pondok-600"
                onClick={() => {
                  setSelectedUser(person);
                  setEditForm({
                    username: person.username,
                    password: '',
                    role: person.role,
                    is_active: Boolean(person.is_active),
                  });
                  setModal('edit');
                }}
              >
                Kelola akun
              </button>
            </td>
          </tr>
        ))}
      </Table>
      <Alert type="warning" className="mt-4">
        Untuk mengaktifkan kembali akun nonaktif, endpoint mensyaratkan password baru. Akun
        admin/kasir juga harus mengulang pendaftaran MFA.
      </Alert>
      {modal === 'create' && (
        <Modal title="Buat akun pengguna" onClose={() => setModal('')}>
          <ActionForm
            onSubmit={create}
            busy={mutation.busy}
            error={mutation.error}
            submitLabel="Buat akun"
          >
            <Field
              label="Username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
            <Field
              label="Password awal"
              type="password"
              hint="Minimal 12 byte, maksimal 72 byte."
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <SelectField
              label="Role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="kasir">Kasir</option>
              <option value="wali">Wali</option>
              <option value="santri">Santri</option>
              <option value="admin">Admin</option>
            </SelectField>
          </ActionForm>
        </Modal>
      )}
      {modal === 'edit' && (
        <Modal title={`Kelola akun ${selectedUser?.username}`} onClose={() => setModal('')}>
          <ActionForm
            onSubmit={update}
            busy={mutation.busy}
            error={mutation.error}
            submitLabel="Simpan perubahan"
          >
            <Field
              label="Username"
              value={editForm.username}
              onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
              required
            />
            <Field
              label="Password baru (opsional)"
              type="password"
              hint="Wajib diisi untuk mengaktifkan kembali akun."
              value={editForm.password}
              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
            />
            <SelectField
              label="Role"
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
            >
              <option value="kasir">Kasir</option>
              <option value="wali">Wali</option>
              <option value="santri">Santri</option>
              <option value="admin">Admin</option>
            </SelectField>
            <label className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm">
              <input
                type="checkbox"
                checked={editForm.is_active}
                onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
              />
              Akun aktif
            </label>
            {!selectedUser?.is_active && editForm.is_active && (
              <Alert type="warning">
                Pengaktifan ulang mencabut sesi lama; admin/kasir perlu mengatur MFA kembali.
              </Alert>
            )}
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
