import { useEffect, useState } from 'react';
import { ImagePlus, QrCode, Save, Trash2, Wifi, WifiOff } from 'lucide-react';
import { api, resolveAssetUrl } from '../../api.js';
import {
  Alert, Field, Loading, PageHeader, SelectField, TextAreaField,
} from '../../ui.jsx';

const emptySettings = {
  name: '',
  app_name: '',
  address: '',
  phone: '',
  email: '',
  manager_name: '',
  timezone: 'Asia/Jakarta',
  logo_path: null,
};

export function AdminSettings({ token, onUpdate }) {
  const [form, setForm] = useState({ ...emptySettings });
  const [logoFile, setLogoFile] = useState(null);
  const [whatsapp, setWhatsapp] = useState({
    status: 'disconnected',
    phone: null,
    qr_data_url: null,
    error: null,
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [midtrans, setMidtrans] = useState({
    merchant_id: '',
    client_key: '',
    server_key: '',
    environment: 'sandbox',
    clear_server_key: false,
  });
  const [midtransConfigured, setMidtransConfigured] = useState(false);
  const [midtransLoading, setMidtransLoading] = useState(true);
  const [midtransBusy, setMidtransBusy] = useState(false);
  const [midtransError, setMidtransError] = useState('');
  const [midtransNotice, setMidtransNotice] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    api.get('/admin/settings', token).then((result) => {
      if (active) {
        setForm({ ...emptySettings, ...result.data });
      }
    }).catch((loadError) => {
      if (active) setLoadError(loadError.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token, loadAttempt]);

  useEffect(() => {
    let active = true;
    const refreshStatus = async () => {
      try {
        const result = await api.get('/admin/settings/whatsapp/status', token);
        if (active) setWhatsapp(result.data);
      } catch (statusError) {
        if (active) setWhatsapp((current) => ({ ...current, error: statusError.message }));
      }
    };
    refreshStatus();
    if (!['connecting', 'qr', 'reconnecting'].includes(whatsapp.status)) return () => { active = false; };
    const timer = setInterval(refreshStatus, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token, whatsapp.status]);

  useEffect(() => {
    let active = true;
    api.get('/admin/settings/midtrans', token).then((result) => {
      if (active) {
        setMidtrans((current) => ({ ...current, ...result.data, server_key: '' }));
        setMidtransConfigured(result.data.server_key_configured);
      }
    }).catch((error) => {
      if (active) setMidtransError(error.message);
    }).finally(() => {
      if (active) setMidtransLoading(false);
    });
    return () => { active = false; };
  }, [token]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.put('/admin/settings', form, token);
      setForm(result.data);
      onUpdate(result.data);
      setNotice(result.message);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async () => {
    if (!logoFile) {
      setError('Pilih file logo terlebih dahulu.');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(logoFile.type)) {
      setError('Logo harus berupa file PNG, JPG, atau WebP.');
      return;
    }
    if (logoFile.size > 2 * 1024 * 1024) {
      setError('Ukuran logo maksimal 2 MB.');
      return;
    }
    const data = new FormData();
    data.append('logo', logoFile);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.post('/admin/settings/logo', data, token);
      setForm(result.data);
      onUpdate(result.data);
      setLogoFile(null);
      setNotice(result.message);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  };

  const removeLogo = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.delete('/admin/settings/logo', token);
      setForm(result.data);
      onUpdate(result.data);
      setLogoFile(null);
      setNotice(result.message);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusy(false);
    }
  };

  const connectWhatsApp = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.post('/admin/settings/whatsapp/connect', {}, token);
      setWhatsapp(result.data);
      setNotice(result.message);
    } catch (connectError) {
      setError(connectError.message);
    } finally {
      setBusy(false);
    }
  };

  const disconnectWhatsApp = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.delete('/admin/settings/whatsapp/disconnect', token);
      setWhatsapp(result.data);
      setNotice(result.message);
    } catch (disconnectError) {
      setError(disconnectError.message);
    } finally {
      setBusy(false);
    }
  };

  const saveMidtrans = async (event) => {
    event.preventDefault();
    setMidtransBusy(true);
    setMidtransError('');
    setMidtransNotice('');
    try {
      const result = await api.put('/admin/settings/midtrans', midtrans, token);
      setMidtrans((current) => ({
        ...current,
        ...result.data,
        server_key: '',
        clear_server_key: false,
      }));
      setMidtransConfigured(result.data.server_key_configured);
      setMidtransNotice(result.message);
    } catch (error) {
      setMidtransError(error.message);
    } finally {
      setMidtransBusy(false);
    }
  };

  if (loading) return <Loading label="Memuat pengaturan pondok..." />;
  if (loadError) {
    return (
      <div>
        <PageHeader title="Pengaturan pondok" subtitle="Atur profil untuk instalasi pondok ini." />
        <Alert type="error">{loadError} <button className="ml-2 font-semibold underline" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Coba lagi</button></Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Pengaturan pondok"
        subtitle="Atur identitas yang ditampilkan di aplikasi untuk instalasi pondok ini."
      />
      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
        <form className="card space-y-5 p-5 sm:p-6" onSubmit={saveProfile}>
          <div>
            <h2 className="text-lg font-semibold">Profil pondok</h2>
            <p className="mt-1 text-sm text-muted">Data ini menggantikan nama dan informasi pondok yang sebelumnya tertulis langsung di tampilan.</p>
          </div>
          <Field label="Nama pondok" name="name" value={form.name} onChange={updateField} maxLength={150} required />
          <Field
            label="Nama aplikasi PWA"
            name="app_name"
            value={form.app_name || ''}
            onChange={updateField}
            maxLength={80}
            hint={`Nama ini tampil saat aplikasi dipasang. Kosongkan untuk memakai nama pondok (${form.name || 'Nama Pondok'}).`}
          />
          <TextAreaField label="Alamat" name="address" value={form.address || ''} onChange={updateField} maxLength={255} rows={3} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nomor telepon / WhatsApp" name="phone" type="tel" value={form.phone || ''} onChange={updateField} maxLength={30} />
            <Field label="Email" name="email" type="email" value={form.email || ''} onChange={updateField} maxLength={254} />
          </div>
          <Field label="Nama penanggung jawab" name="manager_name" value={form.manager_name || ''} onChange={updateField} maxLength={100} />
          <Field
            label="Zona waktu (IANA)"
            name="timezone"
            value={form.timezone || 'Asia/Jakarta'}
            onChange={updateField}
            maxLength={64}
            placeholder="Asia/Jakarta"
            hint="Contoh: Asia/Jakarta, Asia/Makassar, atau Asia/Jayapura. Zona waktu ini digunakan untuk tanggal dan waktu di aplikasi."
            required
          />
          <div className="flex justify-end border-t border-line pt-5">
            <button className="btn-primary" type="submit" disabled={busy}>
              <Save size={17} />{busy ? 'Menyimpan...' : 'Simpan profil'}
            </button>
          </div>
        </form>
        <section className="card h-fit space-y-5 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">Logo pondok dan aplikasi</h2>
            <p className="mt-1 text-sm text-muted">Logo ini juga digunakan sebagai ikon aplikasi yang dipasang. Format PNG, JPG, atau WebP; ukuran maksimal 2 MB.</p>
          </div>
          <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-line bg-canvas p-5">
            {form.logo_path
              ? <img src={resolveAssetUrl(form.logo_path)} alt={`Logo ${form.name}`} className="max-h-32 max-w-full object-contain" />
              : <div className="text-center text-sm text-muted"><ImagePlus size={28} className="mx-auto mb-2" />Belum ada logo pondok</div>}
          </div>
          <input
            className="field file:mr-3 file:rounded-lg file:border-0 file:bg-pondok-50 file:px-3 file:py-2 file:font-semibold file:text-pondok-700"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setLogoFile(event.target.files?.[0] || null)}
            aria-label="Pilih file logo pondok"
          />
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" type="button" disabled={busy || !logoFile} onClick={uploadLogo}>
              <ImagePlus size={17} />{busy ? 'Mengunggah...' : 'Unggah logo'}
            </button>
            {form.logo_path && (
              <button className="btn-secondary" type="button" disabled={busy} onClick={removeLogo}>
                <Trash2 size={17} />Hapus logo
              </button>
            )}
          </div>
        </section>
        <section className="card space-y-5 p-5 sm:p-6 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Pembayaran digital Midtrans</h2>
              <p className="mt-1 text-sm text-muted">Atur kredensial untuk top-up saldo wali melalui QRIS Core API. Layanan Core API dan QRIS harus aktif di akun Midtrans untuk lingkungan yang dipilih.</p>
            </div>
            <span className={midtransConfigured ? 'badge-green' : 'badge-amber'}>
              {midtransConfigured ? 'Kredensial tersimpan' : 'Belum dikonfigurasi'}
            </span>
          </div>
          {midtransLoading ? (
            <Loading label="Memuat pengaturan Midtrans..." />
          ) : (
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveMidtrans}>
              {midtransError && <Alert type="error" className="sm:col-span-2">{midtransError}</Alert>}
              {midtransNotice && <Alert type="success" className="sm:col-span-2">{midtransNotice}</Alert>}
              <SelectField
                label="Lingkungan"
                name="environment"
                value={midtrans.environment}
                onChange={(event) => setMidtrans((current) => ({ ...current, environment: event.target.value }))}
              >
                <option value="sandbox">Sandbox (pengembangan / uji coba)</option>
                <option value="production">Production (transaksi nyata)</option>
              </SelectField>
              <Field
                label="Merchant ID"
                name="merchant_id"
                value={midtrans.merchant_id}
                onChange={(event) => setMidtrans((current) => ({ ...current, merchant_id: event.target.value }))}
                maxLength={100}
                autoComplete="off"
                required
              />
              <Field
                label="Client Key"
                name="client_key"
                value={midtrans.client_key}
                onChange={(event) => setMidtrans((current) => ({ ...current, client_key: event.target.value }))}
                maxLength={255}
                autoComplete="off"
                required
              />
              <Field
                label={midtransConfigured ? 'Server Key (kosongkan untuk tetap menggunakan kunci tersimpan)' : 'Server Key'}
                name="server_key"
                type="password"
                value={midtrans.server_key}
                onChange={(event) => setMidtrans((current) => ({
                  ...current,
                  server_key: event.target.value,
                  clear_server_key: false,
                }))}
                maxLength={255}
                autoComplete="new-password"
                required={!midtransConfigured}
                hint="Kunci disimpan dalam bentuk terenkripsi dan tidak pernah dikirim kembali ke browser."
              />
              {midtransConfigured && (
                <label className="flex items-center gap-2 self-center text-sm text-red-700 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={midtrans.clear_server_key}
                    disabled={Boolean(midtrans.server_key)}
                    onChange={(event) => setMidtrans((current) => ({
                      ...current,
                      clear_server_key: event.target.checked,
                    }))}
                  />
                  Hapus Server Key tersimpan dan nonaktifkan pembayaran QRIS
                </label>
              )}
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 sm:col-span-2">
                <p className="font-semibold">Alamat notifikasi Midtrans</p>
                <p className="mt-1 break-all font-mono text-xs">{new URL('midtrans/notification', `${(import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api`).replace(/\/+$/, '')}/`).toString()}</p>
                <p className="mt-2">Daftarkan URL HTTPS backend tersebut di pengaturan notifikasi Midtrans untuk lingkungan yang dipilih. Sistem memverifikasi signature dan status langsung ke Midtrans sebelum menambah saldo.</p>
              </div>
              <div className="flex justify-end sm:col-span-2">
                <button className="btn-primary" type="submit" disabled={midtransBusy}>
                  <Save size={17} />{midtransBusy ? 'Menyimpan...' : 'Simpan pengaturan pembayaran'}
                </button>
              </div>
            </form>
          )}
          <div className="rounded-xl border border-line bg-canvas p-4 text-sm leading-relaxed text-muted">
            Wali dapat mengisi saldo Rp10.000–Rp450.000 per transaksi. QRIS berlaku 15 menit; biaya transaksi Midtrans ditanggung pondok. Aktivasi Core API pada lingkungan Production harus diminta ke Midtrans.
          </div>
        </section>
        <section className="card space-y-5 p-5 sm:p-6 xl:col-span-2">
          <div>
            <h2 className="text-lg font-semibold">Koneksi bot WhatsApp</h2>
            <p className="mt-1 text-sm text-muted">Hubungkan perangkat WhatsApp pondok dengan memindai QR. Gunakan nomor khusus bot dan pastikan sesi server tetap tersimpan.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {whatsapp.status !== 'connected' && (
              <button className="btn-primary" type="button" disabled={busy || ['connecting', 'qr', 'reconnecting'].includes(whatsapp.status)} onClick={connectWhatsApp}>
                <QrCode size={17} />{busy ? 'Memulai...' : whatsapp.status === 'connecting' || whatsapp.status === 'qr' ? 'Menunggu scan QR' : 'Hubungkan WhatsApp'}
              </button>
            )}
            {whatsapp.status !== 'disconnected' && (
              <button className="btn-secondary !border-red-200 !text-red-700" type="button" disabled={busy} onClick={disconnectWhatsApp}>
                <WifiOff size={17} />{busy ? 'Memutuskan...' : whatsapp.status === 'connected' ? 'Putuskan dan hapus sesi' : 'Batalkan koneksi'}
              </button>
            )}
            <span className="inline-flex items-center gap-2 text-sm text-muted">
              <Wifi size={16} className={whatsapp.status === 'connected' ? 'text-green-600' : ''} />
              {whatsapp.status === 'connected'
                ? whatsapp.phone ? `Terhubung · +${whatsapp.phone}` : 'Terhubung'
                : whatsapp.status === 'qr'
                  ? 'Menunggu QR dipindai'
                  : whatsapp.status === 'connecting' || whatsapp.status === 'reconnecting'
                    ? 'Menghubungkan...'
                    : whatsapp.status === 'logged_out'
                      ? 'Sesi keluar'
                      : whatsapp.status === 'error'
                        ? 'Koneksi bermasalah'
                        : 'Belum terhubung'}
            </span>
          </div>
          {whatsapp.error && <Alert type="error">{whatsapp.error}</Alert>}
          {whatsapp.qr_data_url && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-white p-5">
              <img className="h-72 w-72 max-w-full object-contain" src={whatsapp.qr_data_url} alt="QR untuk menghubungkan WhatsApp" />
              <p className="text-center text-sm text-muted">WhatsApp di ponsel → Perangkat tertaut → Tautkan perangkat. QR diperbarui otomatis; pindai sebelum kedaluwarsa.</p>
            </div>
          )}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
            <p className="font-semibold">Catatan penggunaan</p>
            <p className="mt-1">Baileys menggunakan protokol WhatsApp Web yang tidak resmi. WhatsApp dapat memutuskan sesi atau membatasi nomor. Gunakan nomor khusus bot, kirim hanya notifikasi yang disetujui wali, dan ikuti ketentuan WhatsApp. QR dan sesi tertaut bersifat rahasia.</p>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-4 text-sm leading-relaxed text-muted">
            <p className="font-semibold text-ink">Alur verifikasi wali</p>
            <p className="mt-1">Setelah bot terhubung, wali memasukkan nomornya di akun wali lalu mengirim sendiri pesan berkode yang disiapkan aplikasi. Notifikasi belanja, top-up, dan penarikan hanya dikirim ke nomor yang sudah terverifikasi.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
