import { useState } from 'react';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  Avatar,
  formatDate,
  formatMoney,
  PageHeader,
  SelectField,
  StatusBadge,
} from '../../ui.jsx';
import { StudentSearchPicker, Table, typeName } from './shared.jsx';

export function AdminTransactions({ token }) {
  const [page, setPage] = useState(1);
  const [studentId, setStudentId] = useState(
    new URLSearchParams(window.location.search).get('santri_id') || '',
  );
  const [type, setType] = useState('');
  const [applied, setApplied] = useState({
    studentId: new URLSearchParams(window.location.search).get('santri_id') || '',
    type: '',
  });
  const query = new URLSearchParams({ page: String(page), limit: '20' });
  if (applied.studentId) query.set('santri_id', applied.studentId);
  if (applied.type) query.set('tipe_transaksi', applied.type);
  const { data, loading, error, refresh } = useApiData(`/admin/transaksi?${query}`, token);
  const rows = data?.data || [];
  return (
    <>
      <PageHeader
        title="Riwayat transaksi"
        subtitle="Telusuri transaksi yang telah tercatat beserta saldo akhirnya."
      />
      <section className="card mb-5 grid gap-4 p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <StudentSearchPicker
          token={token}
          value={studentId}
          onChange={setStudentId}
          label="Cari santri"
        />
        <SelectField label="Jenis transaksi" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Semua jenis</option>
          <option value="belanja">Belanja</option>
          <option value="topup">Top up</option>
          <option value="tarik">Penarikan</option>
        </SelectField>
        <button
          className="btn-primary"
          onClick={() => {
            setApplied({ studentId, type });
            setPage(1);
          }}
        >
          Terapkan filter
        </button>
      </section>
      <Table
        headers={['ID / waktu', 'Santri', 'Jenis', 'Keterangan', 'Nominal', 'Saldo akhir']}
        loading={loading}
        error={error}
        onRetry={refresh}
        empty={{ title: 'Belum ada transaksi' }}
        pagination={data?.pagination}
        onPage={setPage}
      >
        {rows.map((item) => (
          <tr key={item.id}>
            <td className="table-cell">
              <p className="font-semibold">#{item.id}</p>
              <p className="text-xs text-muted">{formatDate(item.created_at, true)}</p>
            </td>
            <td className="table-cell">
              <div className="flex items-center gap-3">
                <Avatar name={item.nama_lengkap} />
                <div>
                  <p className="font-semibold">{item.nama_lengkap || 'Santri'}</p>
                  <p className="text-xs text-muted">{item.nis || '—'}</p>
                </div>
              </div>
            </td>
            <td className="table-cell">
              <StatusBadge tone={item.tipe_transaksi === 'tarik' ? 'amber' : 'green'}>
                {typeName(item.tipe_transaksi)}
              </StatusBadge>
            </td>
            <td className="table-cell">
              <p>{item.keterangan || '—'}</p>
              <p className="text-xs text-muted">
                {item.nama_kantin || (item.tipe_transaksi !== 'belanja' ? 'Admin pondok' : '')}
              </p>
            </td>
            <td className="table-cell whitespace-nowrap font-semibold">
              {item.tipe_transaksi === 'topup' ? '+' : '−'}
              {formatMoney(item.jumlah)}
            </td>
            <td className="table-cell whitespace-nowrap">{formatMoney(item.saldo_akhir)}</td>
          </tr>
        ))}
      </Table>
      <Alert className="mt-4">
        Hanya transaksi terkonfirmasi yang tampil. Saldo akhir adalah saldo setelah transaksi
        berhasil dicatat.
      </Alert>
    </>
  );
}
