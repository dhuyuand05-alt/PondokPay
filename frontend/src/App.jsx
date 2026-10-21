import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { api, ApiError } from './api.js';
import {
  AdminLayout, Alert, Brand, Field, Loading, MobileLayout,
} from './ui.jsx';
import {
  AdminApprovals, AdminAudit, AdminDashboard, AdminCanteens, AdminCredentials,
  AdminParents, AdminStudentDetail, AdminStudents, AdminTransactions, AdminUsers,
} from './components/admin/index.js';
import { CashierAccount, CashierHome, CashierHistory } from './components/cashier/index.js';
import { ParentHome, ParentHistory, ParentLimit } from './components/parent/index.js';

const TOKEN_KEY = 'pondokpay.access_token';
const USER_KEY = 'pondokpay.user';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api.post('/auth/login', { username, password });
      if (result.mfa_required) {
        onLogin({ challenge: result.challenge_token, enrollment: result.mfa_enrollment_required, user: { username } });
      } else {
        onLogin({ token: result.token, user: result.user });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-2">
      <section className="relative hidden min-h-screen overflow-hidden bg-pondok-700 px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <Brand inverse />
        <div className="max-w-xl">
          <p className="mb-5 text-xs font-bold uppercase tracking-widest text-gold">Amanah · Mudah · Terjaga</p>
          <h1 className="max-w-lg text-5xl font-medium leading-tight">Lebih tenang,<br />lebih tertata.</h1>
          <p className="mt-5 max-w-lg leading-relaxed text-white/70">Kelola keuangan santri dengan aman. Dari uang saku hingga transaksi kantin, dalam satu ruang yang terhubung.</p>
          <div className="relative mt-14 flex h-56 items-end justify-center gap-6 opacity-70">
            <div className="h-32 w-20 border border-pondok-200/70" />
            <div className="h-52 w-56 rounded-t-full border border-pondok-200/70" />
            <div className="h-32 w-20 border border-pondok-200/70" />
            <div className="absolute bottom-0 h-40 w-24 rounded-t-full border border-pondok-200/60" />
          </div>
        </div>
        <p className="text-sm text-white/65"><ShieldCheck className="mr-2 inline" size={18} />Untuk lingkungan pondok yang lebih baik.</p>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-xl">
          <div className="mb-12 lg:hidden"><Brand /></div>
          <span className="badge-green">Portal admin, kasir & wali</span>
          <h2 className="mt-6 text-3xl font-medium sm:text-4xl">Assalamu’alaikum.</h2>
          <p className="mt-2 text-muted">Selamat datang kembali. Masuk untuk melanjutkan.</p>
          <form className="mt-8 space-y-5" onSubmit={submit}>
            {error && <Alert type="error">{error}</Alert>}
            <Field label="Username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={50} />
            <label className="block">
              <span className="label">Kata sandi</span>
              <span className="relative block">
                <input className="field pr-12" type={visible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                <button type="button" className="absolute inset-y-0 right-2 px-3 text-muted" onClick={() => setVisible(!visible)} aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </span>
            </label>
            <button className="btn-primary w-full !py-4" disabled={busy}>{busy ? 'Memverifikasi...' : <>Masuk <ArrowRight size={18} /></>}</button>
          </form>
          <Alert className="mt-6">Akun admin dan kasir memerlukan kode 6 digit dari aplikasi authenticator untuk keamanan akun.</Alert>
          <p className="mt-7 text-xs leading-relaxed text-muted">Akun dibuat oleh admin pondok. Jika mengalami kendala akses, hubungi pengelola akun.</p>
        </div>
      </section>
    </div>
  );
}

function Mfa({ challenge, onComplete, onBack }) {
  const [code, setCode] = useState('');
  const [provision, setProvision] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);

  const setup = async () => {
    setError('');
    setSetupLoading(true);
    try {
      const data = await api.post('/auth/mfa/setup', undefined, challenge.challenge);
      setProvision(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSetupLoading(false);
    }
  };

  const verify = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.post('/auth/mfa/verify', { code }, challenge.challenge);
      onComplete({ token: result.token, user: result.user });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-10">
      <div className="w-full">
        <button className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-pondok-600" onClick={onBack}>← Kembali ke halaman masuk</button>
        <div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-pondok-50 text-pondok-600"><ShieldCheck size={32} /></div>
        <span className="badge-green">Verifikasi keamanan</span>
        <h1 className="mt-5 text-3xl font-medium">Satu langkah lagi.</h1>
        <p className="mt-2 text-muted">Masukkan kode dari aplikasi authenticator untuk melanjutkan ke PondokPay.</p>
        {error && <Alert type="error" className="mt-5">{error}</Alert>}
        {challenge.enrollment && !provision ? (
          <div className="mt-7 space-y-4">
            <Alert>Aktivasi MFA diperlukan sebelum akun admin atau kasir dapat digunakan. Simpan secret hanya di aplikasi authenticator yang terdaftar.</Alert>
            <button className="btn-primary w-full" disabled={setupLoading} onClick={setup}>{setupLoading ? 'Menyiapkan...' : 'Mulai pengaturan MFA'}</button>
          </div>
        ) : (
          <form className="mt-7 space-y-5" onSubmit={verify}>
            {provision && (
              <div className="card space-y-3 p-5">
                <p className="font-semibold">Hubungkan aplikasi authenticator</p>
                <p className="text-sm text-muted">Tambahkan akun dengan memindai URI berikut di aplikasi authenticator. Jika aplikasi tidak mendukung URI, masukkan secret secara manual.</p>
                <code className="block break-all rounded-lg bg-canvas p-3 text-xs">{provision.provisioning_uri}</code>
                <div><span className="eyebrow">Secret manual</span><code className="mt-1 block select-all break-all font-semibold">{provision.secret}</code></div>
              </div>
            )}
            <Field label="Kode authenticator" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} required />
            <p className="text-xs text-muted">Kode berlaku dalam waktu terbatas. Tantangan login berlaku 5 menit.</p>
            <button className="btn-primary w-full !py-4" disabled={busy || code.length !== 6}>{busy ? 'Memverifikasi...' : 'Verifikasi & masuk'}</button>
          </form>
        )}
      </div>
    </div>
  );
}

function SessionRoutes({ session, onLogout }) {
  const navigate = useNavigate();
  const user = session.user;
  const token = session.token;
  const redirect = user.role === 'admin' ? '/admin' : user.role === 'kasir' ? '/kasir' : user.role === 'wali' ? '/wali' : '/unsupported';

  useEffect(() => {
    if (window.location.pathname === '/' || window.location.pathname === '/login') navigate(redirect, { replace: true });
  }, [navigate, redirect]);

  if (user.role === 'admin') {
    return (
      <Routes>
        <Route path="/admin" element={<AdminLayout user={user} onLogout={onLogout} />}>
          <Route index element={<AdminDashboard token={token} user={user} />} />
          <Route path="santri" element={<AdminStudents token={token} />} />
          <Route path="santri/:id" element={<AdminStudentDetail token={token} />} />
          <Route path="kantin" element={<AdminCanteens token={token} />} />
          <Route path="wali" element={<AdminParents token={token} />} />
          <Route path="transaksi" element={<AdminTransactions token={token} />} />
          <Route path="users" element={<AdminUsers token={token} />} />
          <Route path="credentials" element={<AdminCredentials token={token} />} />
          <Route path="approvals" element={<AdminApprovals token={token} />} />
          <Route path="audit" element={<AdminAudit token={token} />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    );
  }
  if (user.role === 'kasir') {
    return (
      <Routes>
        <Route path="/kasir" element={<MobileLayout user={user} basePath="/kasir" onLogout={onLogout}><CashierHome token={token} /></MobileLayout>} />
        <Route path="/kasir/history" element={<MobileLayout user={user} basePath="/kasir" onLogout={onLogout}><CashierHistory token={token} /></MobileLayout>} />
        <Route path="/kasir/account" element={<MobileLayout user={user} basePath="/kasir" onLogout={onLogout}><CashierAccount token={token} user={user} onLogout={onLogout} /></MobileLayout>} />
        <Route path="*" element={<Navigate to="/kasir" replace />} />
      </Routes>
    );
  }
  if (user.role === 'wali') {
    return (
      <Routes>
        <Route path="/wali" element={<MobileLayout user={user} basePath="/wali" onLogout={onLogout}><ParentHome token={token} /></MobileLayout>} />
        <Route path="/wali/history" element={<MobileLayout user={user} basePath="/wali" onLogout={onLogout}><ParentHistory token={token} /></MobileLayout>} />
        <Route path="/wali/limit" element={<MobileLayout user={user} basePath="/wali" onLogout={onLogout}><ParentLimit token={token} /></MobileLayout>} />
        <Route path="*" element={<Navigate to="/wali" replace />} />
      </Routes>
    );
  }
  return <div className="mx-auto max-w-lg p-8"><Alert type="warning">Akun ini belum memiliki halaman aplikasi. Silakan hubungi admin pondok.</Alert><button className="btn-secondary mt-5" onClick={onLogout}>Keluar</button></div>;
}

export default function App() {
  const [session, setSession] = useState(() => {
    try {
      const token = sessionStorage.getItem(TOKEN_KEY);
      const user = JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
      return token && user ? { token, user } : null;
    } catch {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      return null;
    }
  });
  const [challenge, setChallenge] = useState(null);
  const [checking, setChecking] = useState(Boolean(session));

  useEffect(() => {
    if (!session?.token) return undefined;
    let active = true;
    api.get('/auth/me', session.token).then((result) => {
      if (active && result.user) {
        const restored = { token: session.token, user: { ...session.user, ...result.user } };
        setSession(restored);
        sessionStorage.setItem(USER_KEY, JSON.stringify(restored.user));
      }
    }).catch((error) => {
      if (active && error instanceof ApiError && error.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        setSession(null);
      }
    }).finally(() => active && setChecking(false));
    return () => { active = false; };
  }, []);

  const completeLogin = ({ token, user, challenge: nextChallenge, enrollment }) => {
    if (nextChallenge) {
      setChallenge({ challenge: nextChallenge, enrollment, user });
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    setChallenge(null);
    setSession({ token, user });
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setChallenge(null);
    setSession(null);
  };

  if (checking) return <Loading label="Memeriksa sesi..." />;
  if (challenge) return <Mfa challenge={challenge} onComplete={completeLogin} onBack={() => setChallenge(null)} />;
  if (!session) return <Login onLogin={completeLogin} />;
  return <SessionRoutes session={session} onLogout={logout} />;
}
