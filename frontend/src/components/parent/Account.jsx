import { useEffect, useState } from 'react';
import { MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert, ErrorNotice, Field, MobileLoading, MobileTop,
} from '../../ui.jsx';

export function ParentAccount({ token }) {
  const { data, setData, loading, error, refresh } = useApiData('/wali/notifikasi/whatsapp', token);
  const saved = data?.data || {};
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!phone && saved.whatsapp_number) setPhone(saved.whatsapp_number);
    if (saved.verified_at) setChallenge(null);
  }, [saved.whatsapp_number, saved.verified_at, phone]);

  const startVerification = async (event) => {
    event.preventDefault();
    setBusy(true);
    setActionError('');
    setMessage('');
    setChallenge(null);
    try {
      const result = await api.post(
        '/wali/notifikasi/whatsapp/verifikasi',
        { phone },
        token,
      );
      setChallenge(result.data);
      setPhone(result.data.whatsapp_number);
      setMessage(result.message);
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const disableNotifications = async () => {
    setBusy(true);
    setActionError('');
    setMessage('');
    try {
      const result = await api.delete('/wali/notifikasi/whatsapp', token);
      setChallenge(null);
      setPhone('');
      setData({ data: result.data });
      setMessage(result.message);
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <MobileLoading />;
  if (error) return <ErrorNotice error={error} onRetry={refresh} />;

  return (
    <div className="space-y-4">
      <MobileTop
        title="Notifikasi WhatsApp"
        subtitle="Terima kabar transaksi anak melalui WhatsApp."
      />
      <Alert>
        Untuk menghindari pesan yang tidak diminta, verifikasi dimulai oleh Anda. PondokPay tidak mengirim pesan WhatsApp sebelum Anda membuka tautan dan mengirim kode.
      </Alert>
      {saved.verified_at ? (
        <section className="card space-y-4 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-pondok-50 text-pondok-600"><ShieldCheck size={20} /></span>
            <div>
              <p className="font-semibold">Notifikasi aktif</p>
              <p className="mt-1 text-sm text-muted">Nomor WhatsApp terverifikasi: +{saved.whatsapp_number}</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted">Anda akan menerima notifikasi belanja, top-up, dan penarikan saldo anak yang terhubung dengan akun ini.</p>
          <button className="btn-secondary w-full !border-red-200 !text-red-700" type="button" disabled={busy} onClick={disableNotifications}>
            {busy ? 'Memproses...' : 'Nonaktifkan dan hapus nomor'}
          </button>
        </section>
      ) : (
        <form className="card space-y-4 p-4" onSubmit={startVerification}>
          <Field
            label="Nomor WhatsApp Anda"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="081234567890"
            maxLength={20}
            required
            hint="Gunakan nomor yang sama dengan akun WhatsApp yang akan mengirim pesan verifikasi."
          />
          {saved.whatsapp_number && !saved.verified_at && (
            <p className="text-xs text-muted">Nomor +{saved.whatsapp_number} belum diverifikasi. Verifikasi ulang untuk mengaktifkan notifikasi.</p>
          )}
          {actionError && <Alert type="error">{actionError}</Alert>}
          {message && <Alert type="success">{message}</Alert>}
          <button className="btn-primary min-h-12 w-full" type="submit" disabled={busy}>
            <MessageCircle size={17} />{busy ? 'Menyiapkan pesan...' : 'Siapkan verifikasi WhatsApp'}
          </button>
        </form>
      )}
      {challenge && (
        <section className="card space-y-4 p-4">
          <p className="text-sm leading-relaxed text-muted">Tautan berisi kode rahasia sekali pakai yang berlaku 10 menit. Buka WhatsApp lalu kirim pesan yang sudah terisi; jangan ubah atau bagikan kodenya.</p>
          <a
            className="btn-primary min-h-12 w-full"
            href={challenge.whatsapp_link}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={17} />Buka WhatsApp dan kirim kode
          </a>
          <button className="btn-secondary min-h-11 w-full" type="button" disabled={busy} onClick={refresh}>
            <RefreshCw size={15} />Saya sudah mengirim, periksa status
          </button>
          <p className="text-center text-xs text-muted">Jika tautan tidak dibuka, nomor WhatsApp bot belum tersedia. Hubungi admin pondok.</p>
        </section>
      )}
      {actionError && saved.verified_at && <Alert type="error">{actionError}</Alert>}
      {message && saved.verified_at && <Alert type="success">{message}</Alert>}
    </div>
  );
}
