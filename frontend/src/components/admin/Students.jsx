import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Plus, Search, Upload, Users, Wallet } from 'lucide-react';
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

const csvColumns = ['nis', 'nama_lengkap', 'asrama', 'limit_harian'];
const maxImportFileSize = 1024 * 1024;
const maxImportRows = 500;
const importBatchSize = 25;

function parseStudentCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let quoteClosed = false;
  const source = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        quoteClosed = true;
      } else {
        cell += character;
      }
    } else if (quoteClosed && character === ',') {
      row.push(cell);
      cell = '';
      quoteClosed = false;
    } else if (quoteClosed && (character === '\n' || character === '\r')) {
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
      quoteClosed = false;
      if (character === '\r' && source[index + 1] === '\n') index += 1;
    } else if (quoteClosed) {
      throw new Error('CSV tidak valid: ada karakter setelah tanda kutip.');
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === '"') {
      throw new Error('CSV tidak valid: tanda kutip harus mengapit seluruh isi kolom.');
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
      if (character === '\r' && source[index + 1] === '\n') index += 1;
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error('CSV tidak valid: ada tanda kutip yang belum ditutup.');
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) throw new Error('CSV harus memiliki header dan minimal satu baris data.');

  const headers = rows[0].map((value) => value.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) {
    throw new Error('CSV tidak valid: nama kolom tidak boleh berulang.');
  }
  for (const required of ['nis', 'nama_lengkap']) {
    if (!headers.includes(required)) {
      throw new Error(`Kolom wajib "${required}" tidak ditemukan. Gunakan template CSV.`);
    }
  }
  const columnIndexes = Object.fromEntries(headers.map((header, index) => [header, index]));
  const unwrapSafeCell = (value) => value.replace(/^'(?=[=+\-@])/, '');

  return rows.slice(1).map((values, index) => ({
    row_number: index + 2,
    nis: unwrapSafeCell(values[columnIndexes.nis] ?? '').trim(),
    nama_lengkap: unwrapSafeCell(values[columnIndexes.nama_lengkap] ?? '').trim(),
    asrama: unwrapSafeCell(values[columnIndexes.asrama] ?? '').trim(),
    limit_harian: (values[columnIndexes.limit_harian] ?? '').trim(),
  }));
}

function createStudentCsv(students) {
  const escapeCell = (value) => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [
    csvColumns.join(','),
    ...students.map((student) => csvColumns.map((column) => escapeCell(student[column])).join(',')),
  ].join('\r\n');
}

function downloadCsv(contents, filename) {
  const blob = new Blob([`\uFEFF${contents}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdminStudents({ token }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [importReport, setImportReport] = useState(null);
  const [exportError, setExportError] = useState('');
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
  const importMutation = useMutation();
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
  const exportStudents = async () => {
    setExportError('');
    try {
      const result = await api.get('/admin/santri/export', token);
      downloadCsv(
        createStudentCsv(result.data),
        `data-santri-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch (error) {
      setExportError(error.message);
    }
  };
  const importStudents = async (event) => {
    event.preventDefault();
    if (!csvFile) {
      importMutation.setError('Pilih file CSV terlebih dahulu.');
      return;
    }
    const report = await importMutation.run(async () => {
      if (csvFile.size > maxImportFileSize) {
        throw new Error('Ukuran file CSV maksimal 1 MB.');
      }
      const rows = parseStudentCsv(await csvFile.text());
      if (rows.length > maxImportRows) {
        throw new Error(`Maksimal ${maxImportRows} baris data per file CSV.`);
      }
      const summary = { total: rows.length, processed: 0, imported: [], skipped: [], invalid: [] };
      setImportReport(summary);
      for (let index = 0; index < rows.length; index += importBatchSize) {
        const result = await api.post(
          '/admin/santri/import',
          { rows: rows.slice(index, index + importBatchSize) },
          token,
        );
        summary.imported.push(...result.data.imported);
        summary.skipped.push(...result.data.skipped);
        summary.invalid.push(...result.data.invalid);
        summary.processed +=
          result.data.imported.length + result.data.skipped.length + result.data.invalid.length;
        setImportReport({ ...summary });
      }
      return summary;
    });
    if (report) refresh();
  };
  return (
    <>
      <PageHeader
        title="Data santri"
        subtitle="Kelola identitas, saldo, dan akses transaksi santri dengan mudah."
        action={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={exportStudents}>
              <Download size={17} />
              Ekspor CSV
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                importMutation.setError('');
                setImportReport(null);
                setCsvFile(null);
                setImportModal(true);
              }}
            >
              <Upload size={17} />
              Impor CSV
            </button>
            <button className="btn-primary" onClick={() => setModal(true)}>
              <Plus size={17} />
              Santri baru
            </button>
          </div>
        }
      />
      {exportError && (
        <Alert type="error" className="mb-4">
          {exportError}
        </Alert>
      )}
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
      {importModal && (
        <Modal
          title="Impor data santri"
          onClose={() => {
            if (!importMutation.busy) setImportModal(false);
          }}
        >
          <div className="space-y-4">
            <Alert>
              Impor membuat profil santri tanpa akun login. NIS yang sudah terdaftar akan dilewati;
              saldo dan riwayat transaksi tidak diubah.
            </Alert>
            <p className="text-sm text-muted">
              Gunakan file CSV UTF-8 dengan kolom <code>nis</code>, <code>nama_lengkap</code>,
              <code> asrama</code>, dan <code> limit_harian</code>. Asrama boleh kosong; limit
              kosong menggunakan 50000. Maksimal 500 baris dan ukuran file 1 MB.
            </p>
            <button
              type="button"
              className="font-semibold text-pondok-600 hover:underline"
              onClick={() => {
                downloadCsv(`${csvColumns.join(',')}\r\n`, 'template-data-santri.csv');
              }}
            >
              Unduh template CSV
            </button>
            <ActionForm
              onSubmit={importStudents}
              busy={importMutation.busy}
              error={importMutation.error}
              submitLabel="Mulai impor"
              secondary={
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={importMutation.busy}
                  onClick={() => setImportModal(false)}
                >
                  Tutup
                </button>
              }
            >
              <Field
                label="File CSV"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  setCsvFile(event.target.files?.[0] ?? null);
                  setImportReport(null);
                  importMutation.setError('');
                }}
                required
              />
            </ActionForm>
            {importReport && (
              <div className="space-y-3 rounded-xl border border-line p-4 text-sm">
                <p className="font-semibold">
                  Diproses: {importReport.processed} dari {importReport.total} baris
                </p>
                <p>Berhasil ditambahkan: {importReport.imported.length}</p>
                <p>Dilewati karena NIS sudah terdaftar: {importReport.skipped.length}</p>
                <p>Baris tidak valid: {importReport.invalid.length}</p>
                {[...importReport.skipped, ...importReport.invalid].length > 0 && (
                  <div className="max-h-40 space-y-1 overflow-y-auto text-muted">
                    {[...importReport.skipped, ...importReport.invalid].map((item, index) => (
                      <p key={`${item.row_number}-${index}`}>
                        Baris {item.row_number}: {item.nis ? `${item.nis} — ` : ''}
                        {item.reason}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
