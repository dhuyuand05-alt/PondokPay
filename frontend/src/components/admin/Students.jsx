import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Users, Wallet } from 'lucide-react';
import { api } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  Avatar,
  ErrorNotice,
  Field,
  formatMoney,
  Loading,
  Modal,
  PageHeader,
  StatCard,
  StatusBadge,
} from '../../ui.jsx';
import { ActionForm, Table, useMutation } from './shared.jsx';

export function AdminStudents({ token }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    username: '',
    password: '',
    nis: '',
    nama_lengkap: '',
    asrama: '',
    limit_harian: '50000',
  });
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const path = `/admin/santri?page=${page}&limit=20${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ''}`;
  const { data, loading, error, refresh } = useApiData(path, token);
  const { data: dashboard } = useApiData('/admin/dashboard', token);
  const mutation = useMutation();
  const students = data?.data || [];
  const submit = async (event) => {
    event.preventDefault();
    const result = await mutation.run(() =>
      api.post('/admin/santri', { ...form, limit_harian: Number(form.limit_harian) }, token),
    );
    if (result) {
      setModal(false);
      setForm({
        username: '',
        password: '',
        nis: '',
        nama_lengkap: '',
        asrama: '',
        limit_harian: '50000',
      });
      refresh();
    }
  };
  return (
    <>
      <PageHeader
        title="Data santri"
        subtitle="Kelola identitas, saldo, dan akses transaksi santri dengan mudah."
        action={
          <button className="btn-primary" onClick={() => setModal(true)}>
            <Plus size={17} />
            Santri baru
          </button>
        }
      />
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <StatCard
          label="Total santri"
          value={Number(data?.pagination?.total || 0).toLocaleString('id-ID')}
          icon={Users}
        />
        <StatCard
          label="Total saldo tersimpan"
          value={formatMoney(dashboard?.summary?.total_saldo)}
          detail="Saldo seluruh santri"
          icon={Wallet}
        />
        <div className="card p-5">
          <span className="text-sm text-muted">Pencarian didukung</span>
          <p className="mt-2 font-semibold">NIS · Nama · Asrama · Username</p>
        </div>
      </div>
      <div className="card mb-4 flex items-center gap-3 p-3">
        <Search size={19} className="ml-2 text-muted" />
        <input
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
          placeholder="Cari NIS, nama, asrama, atau username"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <StatusBadge>{data?.pagination?.total || 0} santri</StatusBadge>
      </div>
      <Table
        headers={['Santri / akun', 'Asrama', 'Saldo', 'Limit harian', 'Status', 'Tindakan']}
        loading={loading}
        error={error}
        onRetry={refresh}
        empty={{ title: 'Santri tidak ditemukan' }}
        pagination={data?.pagination}
        onPage={setPage}
      >
        {students.map((item) => (
          <tr key={item.id} className="hover:bg-canvas/70">
            <td className="table-cell">
              <div className="flex items-center gap-3">
                <Avatar name={item.nama_lengkap} />
                <div>
                  <p className="font-semibold">{item.nama_lengkap}</p>
                  <p className="text-xs text-muted">
                    {item.nis} · {item.username || 'Akun belum terhubung'}
                  </p>
                </div>
              </div>
            </td>
            <td className="table-cell">{item.asrama || '—'}</td>
            <td className="table-cell font-semibold">{formatMoney(item.saldo)}</td>
            <td className="table-cell">{formatMoney(item.limit_harian)}</td>
            <td className="table-cell">
              <StatusBadge tone={item.is_active ? 'green' : 'gray'}>
                {item.is_active ? 'Aktif' : 'Nonaktif'}
              </StatusBadge>
            </td>
            <td className="table-cell">
              <button
                className="font-semibold text-pondok-600 hover:underline"
                onClick={() => navigate(`/admin/santri/${item.id}`)}
              >
                Lihat detail →
              </button>
            </td>
          </tr>
        ))}
      </Table>
      <Alert className="mt-4">
        <strong>Riwayat tetap terjaga.</strong> Menonaktifkan santri menghentikan akses akun, bukan
        menghapus data, saldo, atau transaksi.
      </Alert>
      {modal && (
        <Modal title="Tambah santri baru" onClose={() => setModal(false)}>
          <ActionForm
            onSubmit={submit}
            busy={mutation.busy}
            error={mutation.error}
            submitLabel="Buat data santri"
          >
            <Field
              label="Nama lengkap"
              value={form.nama_lengkap}
              onChange={(e) => setForm({ ...form, nama_lengkap: e.target.value })}
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="NIS"
                value={form.nis}
                onChange={(e) => setForm({ ...form, nis: e.target.value })}
                required
              />
              <Field
                label="Asrama"
                value={form.asrama}
                onChange={(e) => setForm({ ...form, asrama: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
            <Field
              label="Limit belanja harian"
              type="number"
              min="0"
              step="0.01"
              value={form.limit_harian}
              onChange={(e) => setForm({ ...form, limit_harian: e.target.value })}
            />
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
