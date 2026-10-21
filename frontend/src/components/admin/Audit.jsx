import { useState } from 'react';
import { useApiData } from '../../hooks.js';
import { Alert, formatDate, PageHeader } from '../../ui.jsx';
import { Table } from './shared.jsx';

export function AdminAudit({ token }) {
  const [page, setPage] = useState(1);
  const { data, loading, error, refresh } = useApiData(
    `/admin/audit-logs?page=${page}&limit=30`,
    token,
  );
  return (
    <>
      <PageHeader
        title="Log audit"
        subtitle="Jejak permintaan dan aktivitas autentikasi untuk pemantauan keamanan."
      />
      <Alert className="mb-4">
        Log audit bersifat append-only. Payload request, password, token, RFID, dan fingerprint
        tidak disimpan dalam log.
      </Alert>
      <Table
        headers={['Waktu', 'Aktor', 'Aksi', 'Resource', 'IP sumber', 'Status']}
        loading={loading}
        error={error}
        onRetry={refresh}
        empty={{ title: 'Belum ada catatan audit' }}
        pagination={data?.pagination}
        onPage={setPage}
      >
        {(data?.data || []).map((row) => (
          <tr key={row.id}>
            <td className="table-cell whitespace-nowrap">{formatDate(row.created_at, true)}</td>
            <td className="table-cell">{row.actor_user_id || 'Anonim'}</td>
            <td className="table-cell">
              <span className="font-semibold">{row.action}</span>
            </td>
            <td className="table-cell max-w-xs truncate">{row.resource}</td>
            <td className="table-cell">{row.source_ip || '—'}</td>
            <td className="table-cell">
              <StatusBadge tone={Number(row.status_code) >= 400 ? 'amber' : 'green'}>
                {row.status_code}
              </StatusBadge>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
