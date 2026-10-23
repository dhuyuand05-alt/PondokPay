import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useApiData } from '../../hooks.js';
import { Alert, formatDate, PageHeader, StatusBadge } from '../../ui.jsx';
import { Table } from './shared.jsx';

export function AdminAudit({ token }) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ actor_user_id: '', from: '', to: '', method: '' });
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: '30' });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return `/admin/audit-logs?${params.toString()}`;
  }, [page, filters]);
  const { data, loading, error, refresh } = useApiData(query, token);
  const updateFilter = (event) => {
    setFilters((current) => ({ ...current, [event.target.name]: event.target.value }));
    setPage(1);
  };
  const clearFilters = () => {
    setFilters({ actor_user_id: '', from: '', to: '', method: '' });
    setPage(1);
  };
  const roleLabels = { admin: 'Admin', kasir: 'Kasir', wali: 'Wali', santri: 'Santri' };
  const actionLabels = {
    POST: 'Membuat / memproses',
    PUT: 'Memperbarui',
    PATCH: 'Memperbarui',
    DELETE: 'Menghapus',
    LOGIN_OK: 'Login berhasil',
    LOGIN_MFA: 'Login menunggu MFA',
    LOGIN_FAIL: 'Login gagal',
  };
  return (
    <>
      <PageHeader
        title="Log audit"
        subtitle="Telusuri aktivitas berdasarkan pengguna, tanggal, dan jenis aksi."
      />
      <Alert className="mb-4">
        Log audit bersifat append-only. Detail aksi disusun dari metadata aman; payload request,
        password, token, RFID, dan fingerprint tidak disimpan.
      </Alert>
      <section className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_auto] sm:p-4">
        <label className="block">
          <span className="label">Aktor</span>
          <select className="field !min-h-10 !py-2 text-sm" name="actor_user_id" value={filters.actor_user_id} onChange={updateFilter}>
            <option value="">Semua aktor</option>
            {(data?.filters?.actors || []).map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.username} · {roleLabels[actor.role] || actor.role}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Dari tanggal</span>
          <input className="field !min-h-10 !py-2 text-sm" type="date" name="from" value={filters.from} onChange={updateFilter} />
        </label>
        <label className="block">
          <span className="label">Sampai tanggal</span>
          <input className="field !min-h-10 !py-2 text-sm" type="date" name="to" value={filters.to} onChange={updateFilter} />
        </label>
        <label className="block">
          <span className="label">Jenis aksi</span>
          <select className="field !min-h-10 !py-2 text-sm" name="method" value={filters.method} onChange={updateFilter}>
            <option value="">Semua aksi</option>
            <option value="POST">Membuat / memproses</option>
            <option value="PUT">Memperbarui (PUT)</option>
            <option value="PATCH">Memperbarui (PATCH)</option>
            <option value="DELETE">Menghapus</option>
            <option value="LOGIN_OK">Login berhasil</option>
            <option value="LOGIN_MFA">Login menunggu MFA</option>
            <option value="LOGIN_FAIL">Login gagal</option>
          </select>
        </label>
        <div className="flex items-end">
          <button type="button" className="btn-secondary !min-h-10 w-full !py-2 sm:w-auto" onClick={clearFilters}>
            <RotateCcw size={15} />Reset filter
          </button>
        </div>
      </section>
      <Table
        headers={['Waktu', 'Aktor', 'Detail aktivitas', 'Endpoint', 'IP sumber', 'Status']}
        loading={loading}
        error={error}
        onRetry={refresh}
        empty={{
          title: filters.actor_user_id || filters.from || filters.to || filters.method
            ? 'Tidak ada aktivitas yang cocok'
            : 'Belum ada catatan audit',
          description: 'Coba ubah atau reset filter untuk melihat catatan lainnya.',
        }}
        pagination={data?.pagination}
        onPage={setPage}
      >
        {(data?.data || []).map((row) => (
          <tr key={row.id}>
            <td className="table-cell whitespace-nowrap">{formatDate(row.created_at, true)}</td>
            <td className="table-cell">
              <span className="font-semibold">{row.actor_username || (row.actor_user_id ? `Akun #${row.actor_user_id}` : 'Anonim')}</span>
              {row.actor_role && <span className="mt-0.5 block text-xs text-muted">{roleLabels[row.actor_role] || row.actor_role}</span>}
            </td>
            <td className="table-cell">
              <span className="font-semibold">{row.details || actionLabels[row.action] || row.action}</span>
              <span className="mt-0.5 block text-xs text-muted">{actionLabels[row.action] || row.action}</span>
            </td>
            <td className="table-cell max-w-[240px] truncate font-mono text-xs" title={row.resource}>{row.resource}</td>
            <td className="table-cell whitespace-nowrap">{row.source_ip || '—'}</td>
            <td className="table-cell">
              <StatusBadge tone={Number(row.status_code) >= 400 || !row.status_code ? 'amber' : 'green'}>
                {row.status_code || 'Diproses'}
              </StatusBadge>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
