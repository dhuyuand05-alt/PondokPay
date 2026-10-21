import { Children, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  Avatar,
  Empty,
  ErrorNotice,
  Field,
  formatMoney,
  Loading,
  Modal,
  Pagination,
} from '../../ui.jsx';

export function Table({ headers, children, empty, loading, error, onRetry, pagination, onPage }) {
  return (
    <div className="card overflow-hidden">
      {error && (
        <div className="p-4">
          <ErrorNotice error={error} onRetry={onRetry} />
        </div>
      )}
      {loading ? (
        <Loading />
      ) : Children.count(children) > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr>
                  {headers.map((head) => (
                    <th key={head} className="table-head px-4 py-3">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{children}</tbody>
            </table>
          </div>
          <Pagination pagination={pagination} onPage={onPage} />
        </>
      ) : (
        <Empty {...empty} />
      )}
    </div>
  );
}

export function ActionForm({
  children,
  onSubmit,
  busy,
  error,
  submitLabel = 'Simpan',
  secondary,
  className = '',
}) {
  return (
    <form className={`space-y-4 ${className}`} onSubmit={onSubmit}>
      {error && <Alert type="error">{error}</Alert>}
      {children}
      <div className="flex flex-wrap gap-3 pt-2">
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Memproses...' : submitLabel}
        </button>
        {secondary}
      </div>
    </form>
  );
}

export function useMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (callback) => {
    setBusy(true);
    setError('');
    try {
      return await callback();
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

export function StudentSearchPicker({
  token,
  value,
  onChange,
  multiple = false,
  selectedItems = [],
  onSelectedItemsChange,
  excludeIds = [],
  label = 'Cari santri',
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const path = `/admin/santri?page=1&limit=100${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ''}`;
  const { data, loading, error } = useApiData(path, token);
  const students = data?.data || [];
  const selectedIds = multiple ? selectedItems.map((item) => String(item.id)) : [];
  const availableStudents = students.filter(
    (student) =>
      !excludeIds.some((id) => Number(id) === Number(student.id)) &&
      (!multiple || !selectedIds.includes(String(student.id))),
  );

  const choose = (student) => {
    if (multiple) {
      onSelectedItemsChange([...selectedItems, student]);
    } else {
      onChange(String(student.id));
    }
    setSearch('');
  };

  return (
    <div>
      <label
        className="label"
        htmlFor={multiple ? 'student-search-multiple' : 'student-search-single'}
      >
        {label}
      </label>
      {multiple && selectedItems.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {selectedItems.map((student) => (
            <span key={student.id} className="badge-green gap-2">
              {student.nama_lengkap} · {student.nis}
              <button
                type="button"
                aria-label={`Lepas ${student.nama_lengkap}`}
                onClick={() =>
                  onSelectedItemsChange(selectedItems.filter((item) => item.id !== student.id))
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {!multiple && value && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-pondok-50 px-3 py-2 text-sm">
          <span className="font-medium">
            {students.find((student) => String(student.id) === String(value))?.nama_lengkap ||
              `Santri ID ${value}`}
          </span>
          <button
            type="button"
            className="font-semibold text-pondok-600"
            onClick={() => onChange('')}
          >
            Ganti
          </button>
        </div>
      )}
      {(!value || multiple) && (
        <>
          <div className="relative">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id={multiple ? 'student-search-multiple' : 'student-search-single'}
              className="field pl-10"
              placeholder="Cari berdasarkan nama, NIS, asrama, atau username"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-line bg-white">
            {loading ? (
              <p className="p-3 text-sm text-muted">Mencari santri...</p>
            ) : error ? (
              <p className="p-3 text-sm text-red-600">{error}</p>
            ) : availableStudents.length ? (
              availableStudents.map((student) => (
                <button
                  type="button"
                  key={student.id}
                  className="flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-pondok-50"
                  onClick={() => choose(student)}
                >
                  <Avatar name={student.nama_lengkap} className="h-9 w-9 text-xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {student.nama_lengkap}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {student.nis} · {student.asrama || 'Asrama belum diatur'}
                    </span>
                  </span>
                  <span className="text-xs text-muted">{formatMoney(student.saldo)}</span>
                </button>
              ))
            ) : (
              <p className="p-3 text-sm text-muted">
                {search ? 'Santri tidak ditemukan.' : 'Belum ada data santri.'}
              </p>
            )}
          </div>
          {multiple && (
            <input
              className="sr-only"
              required
              value={selectedItems.length ? 'selected' : ''}
              readOnly
              aria-label="Pilih minimal satu santri"
            />
          )}
        </>
      )}
      {!multiple && value && (
        <input className="sr-only" required value={value} readOnly aria-label="Santri terpilih" />
      )}
    </div>
  );
}

export function typeName(type) {
  return (
    {
      belanja: 'Belanja',
      topup: 'Top up',
      tarik: 'Penarikan',
      penjualan: 'Penjualan',
      pencairan: 'Pencairan',
    }[type] ||
    type ||
    '—'
  );
}

export function EditStudentModal({ token, student, onClose, onSaved }) {
  const [form, setForm] = useState({
    nis: student.nis || '',
    nama_lengkap: student.nama_lengkap || '',
    asrama: student.asrama || '',
    limit_harian: student.limit_harian || '',
    username: student.username || '',
  });
  const mutation = useMutation();
  const submit = async (event) => {
    event.preventDefault();
    const body = { ...form, limit_harian: Number(form.limit_harian) };
    if (!body.password) delete body.password;
    const result = await mutation.run(() => api.patch(`/admin/santri/${student.id}`, body, token));
    if (result) onSaved();
  };
  return (
    <Modal title="Ubah data santri" onClose={onClose}>
      <ActionForm
        onSubmit={submit}
        busy={mutation.busy}
        error={mutation.error}
        submitLabel="Simpan perubahan"
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
        <Field
          label="Username"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
        />
        <Field
          label="Limit harian"
          type="number"
          min="0"
          step="0.01"
          value={form.limit_harian}
          onChange={(e) => setForm({ ...form, limit_harian: e.target.value })}
        />
        <Field
          label="Password baru (opsional)"
          type="password"
          value={form.password || ''}
          hint="Isi hanya untuk mengganti password akun."
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
      </ActionForm>
    </Modal>
  );
}
