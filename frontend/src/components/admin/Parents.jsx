import { useState } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import { api } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  Empty,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  PageHeader,
  StatCard,
} from '../../ui.jsx';
import { ActionForm, StudentSearchPicker, useMutation } from './shared.jsx';

export function AdminParents({ token }) {
  const { data, loading, error, refresh } = useApiData('/admin/wali-akun', token);
  const [modal, setModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [targetAccount, setTargetAccount] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [childToLink, setChildToLink] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const mutation = useMutation();
  const accounts = data?.data || [];
  const filteredAccounts = accounts.filter((account) => {
    const term = accountSearch.trim().toLocaleLowerCase();
    return (
      !term ||
      [
        account.username,
        ...(account.children || []).flatMap((child) => [
          child.nama_lengkap,
          child.nis,
          child.no_whatsapp,
        ]),
      ].some((value) =>
        String(value || '')
          .toLocaleLowerCase()
          .includes(term),
      )
    );
  });

  const createAccount = async (event) => {
    event.preventDefault();
    const result = await mutation.run(() =>
      api.post(
        '/admin/wali-akun',
        {
          username,
          password,
          no_whatsapp: whatsapp || null,
          santri_ids: selectedStudents.map((student) => Number(student.id)),
        },
        token,
      ),
    );
    if (result) {
      setModal(false);
      setUsername('');
      setPassword('');
      setWhatsapp('');
      setSelectedStudents([]);
      refresh();
    }
  };
  const updateAccount = async (event) => {
    event.preventDefault();
    const body = {};
    if (username.trim()) body.username = username.trim();
    if (password) body.password = password;
    if (whatsapp.trim()) body.no_whatsapp = whatsapp.trim();
    const result = await mutation.run(() =>
      api.patch(`/admin/wali-akun/${targetAccount.id}`, body, token),
    );
    if (result) {
      setModal(false);
      setUsername('');
      setPassword('');
      setWhatsapp('');
      refresh();
    }
  };
  const linkChild = async (event) => {
    event.preventDefault();
    const result = await mutation.run(() =>
      api.post(
        `/admin/wali-akun/${targetAccount.id}/anak`,
        {
          santri_id: Number(childToLink),
          ...(whatsapp.trim() ? { no_whatsapp: whatsapp.trim() } : {}),
        },
        token,
      ),
    );
    if (result) {
      setModal(false);
      setChildToLink('');
      setWhatsapp('');
      refresh();
    }
  };
  const unlinkChild = async (account, child) => {
    if (!window.confirm(`Lepaskan hubungan ${child.nama_lengkap} dari akun ini?`)) return;
    try {
      await api.delete(`/admin/wali-akun/${account.id}/anak/${child.santri_id}`, token);
      refresh();
    } catch (err) {
      window.alert(err.message);
    }
  };
  const deactivate = async (id) => {
    if (!window.confirm('Nonaktifkan akun wali ini?')) return;
    try {
      await api.delete(`/admin/wali-akun/${id}`, token);
      refresh();
    } catch (err) {
      window.alert(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Orang tua / wali"
        subtitle="Satu akun wali dapat terhubung ke beberapa anak di pondok."
        action={
          <button
            className="btn-primary"
            onClick={() => {
              setModalMode('create');
              setTargetAccount(null);
              setUsername('');
              setPassword('');
              setWhatsapp('');
              setSelectedStudents([]);
              setModal(true);
            }}
          >
            <Plus size={17} />
            Buat akun wali
          </button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <StatCard
          label="Akun orang tua / wali"
          value={accounts.length}
          detail="Akun disediakan admin, tanpa pendaftaran mandiri."
          icon={Users}
        />
        <Alert>
          Akses wali sesuai hubungan anak. Wali hanya dapat melihat saldo, transaksi, dan mengatur
          limit anak yang terhubung.
        </Alert>
      </div>
      <section className="card mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <h2 className="font-semibold">Daftar akun wali</h2>
          <div className="relative w-full sm:max-w-sm">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="field pl-10"
              aria-label="Cari akun wali atau santri"
              placeholder="Cari wali, nama anak, NIS, atau kontak"
              value={accountSearch}
              onChange={(event) => setAccountSearch(event.target.value)}
            />
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <div className="p-4">
            <ErrorNotice error={error} onRetry={refresh} />
          </div>
        ) : !accounts.length ? (
          <Empty title="Belum ada akun wali" />
        ) : !filteredAccounts.length ? (
          <Empty title="Akun wali tidak ditemukan" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px]">
              <thead>
                <tr>
                  {['Akun', 'Anak terhubung', 'Kontak', 'Tindakan'].map((h) => (
                    <th className="table-head px-4 py-3" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((item) => (
                  <tr key={item.id}>
                    <td className="table-cell font-semibold">
                      {item.username}
                      <p className="mt-1 text-xs font-normal text-muted">ID {item.id}</p>
                    </td>
                    <td className="table-cell">
                      {item.children?.length ? (
                        item.children.map((child) => (
                          <p
                            key={child.relasi_id}
                            className="flex items-center justify-between gap-3 py-1"
                          >
                            {child.nama_lengkap} · {child.nis}
                            <button
                              className="text-xs text-red-600"
                              onClick={() => unlinkChild(item, child)}
                            >
                              Lepas
                            </button>
                          </p>
                        ))
                      ) : (
                        <span className="text-muted">Belum ada anak</span>
                      )}
                    </td>
                    <td className="table-cell">{item.children?.[0]?.no_whatsapp || '—'}</td>
                    <td className="table-cell">
                      <div className="flex flex-col items-start gap-2">
                        <button
                          className="text-sm font-semibold text-pondok-600"
                          onClick={() => {
                            setTargetAccount(item);
                            setModalMode('link');
                            setChildToLink('');
                            setWhatsapp('');
                            setModal(true);
                          }}
                        >
                          Hubungkan anak
                        </button>
                        <button
                          className="text-sm font-semibold text-pondok-600"
                          onClick={() => {
                            setTargetAccount(item);
                            setModalMode('edit');
                            setUsername(item.username);
                            setPassword('');
                            setWhatsapp(item.children?.[0]?.no_whatsapp || '');
                            setModal(true);
                          }}
                        >
                          Ubah akun
                        </button>
                        <button
                          className="text-sm font-semibold text-red-600"
                          onClick={() => deactivate(item.id)}
                        >
                          Nonaktifkan
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {modal && (
        <Modal
          title={
            modalMode === 'create'
              ? 'Buat akun wali'
              : modalMode === 'link'
                ? 'Hubungkan anak'
                : 'Ubah akun wali'
          }
          onClose={() => setModal(false)}
        >
          {modalMode === 'create' && (
            <>
              <p className="mb-5 text-sm text-muted">
                Buat akses wali dan hubungkan minimal satu santri.
              </p>
              <ActionForm
                onSubmit={createAccount}
                busy={mutation.busy}
                error={mutation.error}
                submitLabel="Buat akun & hubungkan anak"
              >
                <Field
                  label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <Field
                  label="Password awal"
                  type="password"
                  hint="Minimal 12 byte, maksimal 72 byte."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Field
                  label="Nomor WhatsApp (opsional)"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                />
                <StudentSearchPicker
                  token={token}
                  multiple
                  selectedItems={selectedStudents}
                  onSelectedItemsChange={setSelectedStudents}
                  label="Pilih santri yang dihubungkan"
                />
              </ActionForm>
            </>
          )}
          {modalMode === 'link' && (
            <ActionForm
              onSubmit={linkChild}
              busy={mutation.busy}
              error={mutation.error}
              submitLabel="Hubungkan santri"
            >
              <p className="text-sm text-muted">Akun: {targetAccount?.username}</p>
              <StudentSearchPicker
                token={token}
                value={childToLink}
                onChange={setChildToLink}
                excludeIds={(targetAccount?.children || []).map((child) => child.santri_id)}
                label="Santri"
              />
              <Field
                label="Nomor WhatsApp (opsional)"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </ActionForm>
          )}
          {modalMode === 'edit' && (
            <ActionForm
              onSubmit={updateAccount}
              busy={mutation.busy}
              error={mutation.error}
              submitLabel="Simpan perubahan"
            >
              <Field
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <Field
                label="Password baru (opsional)"
                type="password"
                hint="Kosongkan untuk mempertahankan password."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Field
                label="Nomor WhatsApp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                hint="Kosongkan untuk tidak mengubah data kontak."
              />
            </ActionForm>
          )}
        </Modal>
      )}
    </>
  );
}
