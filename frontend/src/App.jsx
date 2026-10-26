import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  CircleCheck,
  Eye,
  EyeOff,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
  Store,
  Users,
  Wallet,
} from 'lucide-react';
import { api, ApiError, resolveAssetUrl } from './api.js';
import {
  AdminLayout, Alert, Brand, Field, InstitutionContext, Loading, MobileLayout,
  setInstitutionTimeZone,
} from './ui.jsx';
import {
  AdminApprovals,
  AdminAudit,
  AdminCash,
  AdminDashboard,
  AdminCanteens,
  AdminCredentials,
  AdminParents,
  AdminStudentDetail,
  AdminStudents,
  AdminTransactions,
  AdminFinancialReports,
  AdminUsers,
  AdminSettings,
} from './components/admin/index.js';
import { CashierAccount, CashierCatalogManagement, CashierHome, CashierHistory, CashierPayoutApprovals } from './components/cashier/index.js';
import { ParentAccount, ParentHome, ParentHistory, ParentLimit, ParentTopup } from './components/parent/index.js';
import DocumentationPage from './DocumentationPage.jsx';

const TOKEN_KEY = 'pondokpay.access_token';
const USER_KEY = 'pondokpay.user';
const CashierPurchasing = lazy(() => import('./components/cashier/Purchasing.jsx')
  .then((module) => ({ default: module.CashierPurchasing })));

function Login({ onLogin, institutionError }) {
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
          <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-pondok-600 hover:underline">
            <span aria-hidden="true">←</span> Beranda PondokPay
          </Link>
          <div className="mb-12 lg:hidden"><Brand /></div>
          <span className="badge-green">Portal admin, kasir & wali</span>
          <h2 className="mt-6 text-3xl font-medium sm:text-4xl">Assalamu’alaikum.</h2>
          <p className="mt-2 text-muted">Selamat datang kembali. Masuk untuk melanjutkan.</p>
          {institutionError && <Alert type="warning" className="mt-5">{institutionError}</Alert>}
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

function LandingPage({ institution }) {
  const appName = institution.name || 'PondokPay';
  const loginHref = '/login';
  const highlights = [
    { icon: Wallet, title: 'Saldo santri terpantau', text: 'Pantau saldo, top-up, dan aktivitas belanja dengan riwayat yang jelas.' },
    { icon: Store, title: 'Transaksi kantin praktis', text: 'Kasir mencatat belanja dengan katalog produk atau input nominal sesuai kebutuhan.' },
    { icon: BarChart3, title: 'Laporan siap digunakan', text: 'Bantu pengelola melihat rekap transaksi dan menyiapkan laporan administrasi.' },
  ];
  const audiences = [
    { icon: ShieldCheck, title: 'Admin pondok', text: 'Kelola data, akun, kantin, pengaturan, dan laporan dalam satu dashboard.' },
    { icon: Store, title: 'Petugas kantin', text: 'Proses transaksi santri dengan alur kasir yang ringkas dan mudah dipahami.' },
    { icon: Users, title: 'Orang tua / wali', text: 'Pantau aktivitas anak dan kelola saldo serta limit belanja dari akun wali.' },
  ];

  return (
    <div className="min-h-screen overflow-hidden bg-[#f7f9f6] text-[#183f36]">
      <header className="relative z-10 border-b border-[#e6ece5] bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label={`${appName}, beranda`} className="min-w-0">
            <Brand />
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-[#60736b] md:flex" aria-label="Navigasi utama">
            <a className="transition hover:text-pondok-700" href="#fitur">Fitur</a>
            <a className="transition hover:text-pondok-700" href="#pengguna">Untuk siapa</a>
            <a className="transition hover:text-pondok-700" href="#keamanan">Keamanan</a>
            <Link className="transition hover:text-pondok-700" to="/dokumentasi">Dokumentasi</Link>
          </nav>
          <Link to={loginHref} className="btn-primary !min-h-10 !rounded-lg !px-3.5 !py-2 text-xs sm:!px-4 sm:text-sm">
            Masuk aplikasi <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <main>
        <section className="relative isolate">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute -right-28 -top-24 h-[390px] w-[390px] rounded-full bg-[#dff0e5] opacity-70 blur-3xl sm:h-[560px] sm:w-[560px]" />
            <div className="absolute -left-32 top-52 h-72 w-72 rounded-full bg-[#f2ead6] opacity-60 blur-3xl" />
          </div>
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:px-8 lg:pb-24 lg:pt-20">
            <div className="landing-enter max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#d7e9dd] bg-white/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#08745a] shadow-sm sm:text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-[#078264]" />
                Sistem keuangan pondok yang terhubung
              </span>
              <h1 className="mt-5 max-w-[13ch] text-[2.55rem] font-semibold leading-[1.08] tracking-[-0.045em] text-[#153e33] sm:mt-6 sm:text-5xl lg:text-[3.65rem]">
                Keuangan pondok lebih <span className="text-[#078264]">tertata</span>, semua lebih tenang.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-[#667a71] sm:mt-5 sm:text-base sm:leading-7">
                {appName} membantu pondok mengelola saldo santri, transaksi kantin, dan pemantauan wali dalam satu aplikasi yang aman dan mudah digunakan.
              </p>
              <div className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:items-center">
                <Link to={loginHref} className="btn-primary min-h-12 w-full justify-center rounded-xl px-5 text-sm sm:w-auto sm:text-base">
                  Masuk ke aplikasi <ArrowRight size={18} />
                </Link>
                <a href="#fitur" className="btn-secondary min-h-11 w-full justify-center rounded-xl px-5 text-sm sm:w-auto">
                  Kenali fitur <ChevronRight size={17} />
                </a>
                <Link to="/dokumentasi" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-[#08745a] transition hover:bg-white/75 sm:w-auto">
                  <BookOpen size={17} /> Dokumentasi lengkap
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-[#6b7d75] sm:mt-8 sm:gap-x-6 sm:text-xs">
                {['Untuk ekosistem pondok', 'Transaksi tercatat', 'Akses sesuai peran'].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5"><CircleCheck size={14} className="text-[#078264]" />{item}</span>
                ))}
              </div>
            </div>

            <div className="landing-enter landing-enter-later relative mx-auto w-full max-w-[560px] lg:max-w-none">
              <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-[#dbeee2] via-white/40 to-[#efe6cf] blur-xl sm:-inset-5" />
              <div className="relative rounded-[1.5rem] border border-white/80 bg-white/75 p-2.5 shadow-[0_28px_90px_rgba(25,66,51,0.15)] backdrop-blur sm:rounded-[1.8rem] sm:p-4">
                <div className="overflow-hidden rounded-[1.15rem] border border-[#e7eee7] bg-[#f8faf7] sm:rounded-[1.4rem]">
                  <div className="flex items-center justify-between border-b border-[#e8eee7] bg-white px-3.5 py-3 sm:px-5 sm:py-4">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#e7f3eb] text-[#08745a] sm:h-9 sm:w-9"><Wallet size={17} /></span>
                      <div><p className="text-[11px] font-semibold sm:text-xs">Ringkasan pondok</p><p className="mt-0.5 text-[9px] text-[#84948d] sm:text-[10px]">Gambaran aktivitas keuangan</p></div>
                    </div>
                    <span className="rounded-full bg-[#e9f5ed] px-2 py-1 text-[9px] font-semibold text-[#08745a] sm:text-[10px]">Dashboard</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 p-3 sm:gap-3.5 sm:p-5">
                    <div className="rounded-xl border border-[#e8eee7] bg-white p-3 sm:rounded-2xl sm:p-4">
                      <div className="flex items-center justify-between"><span className="text-[9px] text-[#84948d] sm:text-[11px]">Saldo santri</span><Wallet size={14} className="text-[#078264]" /></div>
                      <p className="mt-2 text-base font-semibold tracking-tight sm:mt-3 sm:text-xl">Terkelola</p>
                      <p className="mt-1 text-[9px] text-[#84948d] sm:text-[10px]">Riwayat tercatat rapi</p>
                    </div>
                    <div className="rounded-xl border border-[#e8eee7] bg-white p-3 sm:rounded-2xl sm:p-4">
                      <div className="flex items-center justify-between"><span className="text-[9px] text-[#84948d] sm:text-[11px]">Aktivitas kantin</span><Store size={14} className="text-[#078264]" /></div>
                      <p className="mt-2 text-base font-semibold tracking-tight sm:mt-3 sm:text-xl">Lebih praktis</p>
                      <p className="mt-1 text-[9px] text-[#84948d] sm:text-[10px]">Kasir sesuai kebutuhan</p>
                    </div>
                    <div className="col-span-2 rounded-xl border border-[#e8eee7] bg-white p-3 sm:rounded-2xl sm:p-4">
                      <div className="flex items-center justify-between">
                        <div><p className="text-[10px] font-semibold sm:text-xs">Aktivitas transaksi</p><p className="mt-0.5 text-[9px] text-[#84948d] sm:text-[10px]">Rekap yang mudah ditinjau</p></div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#e9f5ed] px-2 py-1 text-[9px] font-semibold text-[#08745a]"><ArrowUpRight size={12} />Terpantau</span>
                      </div>
                      <div className="mt-4 flex h-[82px] items-end gap-2 border-b border-[#edf1ec] px-1 sm:mt-5 sm:h-[110px] sm:gap-3">
                        {[32, 48, 41, 67, 53, 78, 63, 91, 70, 82, 58, 96].map((height, index) => (
                          <span key={index} className={`flex-1 rounded-t-md ${index === 11 ? 'bg-[#078264]' : 'bg-[#d7ebe0]'}`} style={{ height: `${height}%` }} />
                        ))}
                      </div>
                      <div className="mt-2 flex justify-between text-[8px] text-[#9aa8a1] sm:text-[9px]"><span>Catatan transaksi</span><span>Ringkasan periode</span></div>
                    </div>
                    <div className="col-span-2 flex items-center gap-2 rounded-xl bg-[#104a39] px-3 py-2.5 text-white sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 sm:h-9 sm:w-9"><ShieldCheck size={17} /></span>
                      <div className="min-w-0"><p className="text-[10px] font-semibold sm:text-xs">Akses dengan perlindungan berlapis</p><p className="mt-0.5 truncate text-[9px] text-white/65 sm:text-[10px]">Setiap peran melihat ruang kerja yang sesuai</p></div>
                      <Check size={16} className="ml-auto shrink-0 text-[#9de0b8]" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="landing-float absolute -left-2 top-[22%] hidden items-center gap-2 rounded-xl border border-[#e5ece4] bg-white px-3 py-2.5 shadow-lg sm:flex lg:-left-8">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#eaf5ee] text-[#078264]"><ArrowDownLeft size={16} /></span>
                <div><p className="text-[10px] font-semibold">Saldo tercatat</p><p className="text-[9px] text-[#84948d]">Transaksi mudah ditinjau</p></div>
              </div>
              <div className="landing-float landing-float-delayed absolute -right-1 bottom-[16%] hidden items-center gap-2 rounded-xl border border-[#e5ece4] bg-white px-3 py-2.5 shadow-lg sm:flex lg:-right-7">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f7f1e2] text-[#9a7c35]"><Fingerprint size={16} /></span>
                <div><p className="text-[10px] font-semibold">Verifikasi aman</p><p className="text-[9px] text-[#84948d]">Sesuai alur kasir</p></div>
              </div>
            </div>
          </div>
        </section>

        <section id="fitur" className="scroll-mt-20 bg-white py-14 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <span className="eyebrow text-[#078264]">Satu aplikasi, alur lebih jelas</span>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">Hal penting dalam pengelolaan pondok, terhubung rapi.</h2>
              <p className="mt-3 text-sm leading-6 text-[#6b7d75] sm:text-base">Bantu kegiatan harian berjalan lebih tertata, dari pencatatan transaksi sampai pemantauan keluarga.</p>
            </div>
            <div className="mt-8 grid gap-3 sm:mt-11 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {highlights.map(({ icon: Icon, title, text }, index) => (
                <article key={title} className={`landing-enter rounded-2xl border border-[#e6ece5] bg-[#fbfcfa] p-4 transition hover:-translate-y-0.5 hover:shadow-soft sm:p-6 ${index === 1 ? 'landing-enter-later' : ''}`}>
                  <span className="landing-icon grid h-10 w-10 place-items-center rounded-xl bg-[#e8f4ec] text-[#078264] sm:h-12 sm:w-12 sm:rounded-2xl"><Icon size={21} /></span>
                  <h3 className="mt-4 text-sm font-semibold sm:mt-5 sm:text-base">{title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-[#6b7d75] sm:text-sm sm:leading-6">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pengguna" className="scroll-mt-20 py-14 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-16 lg:px-8">
            <div>
              <span className="eyebrow text-[#078264]">Dibuat untuk kerja bersama</span>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">Setiap orang punya akses yang sesuai perannya.</h2>
              <p className="mt-3 text-sm leading-6 text-[#6b7d75] sm:text-base sm:leading-7">Admin, petugas kantin, dan wali menggunakan satu sistem dengan pengalaman yang disesuaikan kebutuhan masing-masing.</p>
              <Link to={loginHref} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#08745a] hover:underline sm:mt-7">Masuk ke ruang kerja <ArrowRight size={16} /></Link>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
              {audiences.map(({ icon: Icon, title, text }, index) => (
                <article key={title} className={`rounded-2xl border p-4 sm:p-5 ${index === 1 ? 'border-[#d0e7d8] bg-[#eef7f1] sm:-translate-y-3' : 'border-[#e5ebe4] bg-white'}`}>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#078264] shadow-sm sm:h-10 sm:w-10"><Icon size={19} /></span>
                  <h3 className="mt-3 text-xs font-semibold sm:mt-4 sm:text-sm">{title}</h3>
                  <p className="mt-1.5 text-[11px] leading-5 text-[#6b7d75] sm:text-xs sm:leading-5">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="keamanan" className="scroll-mt-20 bg-[#104a39] py-12 text-white sm:py-16">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
            <div className="max-w-2xl">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#a8d9bb] sm:text-xs">Akses yang terjaga</span>
              <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-3xl">Informasi keuangan lebih tertata, dengan akses yang bertanggung jawab.</h2>
              <p className="mt-2 text-xs leading-5 text-white/70 sm:mt-3 sm:text-sm sm:leading-6">PondokPay menerapkan akses berbasis akun dan peran. Admin dan petugas kasir menggunakan verifikasi keamanan tambahan.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
              <LockKeyhole size={19} className="text-[#bde5c9]" />
              <div><p className="text-xs font-semibold">Akun sesuai peran</p><p className="text-[10px] text-white/65">Admin · Kasir · Wali</p></div>
              <Smartphone size={17} className="ml-2 text-white/70" />
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-5 rounded-2xl border border-[#dce9df] bg-white p-5 shadow-[0_16px_50px_rgba(25,66,51,0.07)] sm:rounded-3xl sm:p-8 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Kenali PondokPay lebih lengkap.</h2>
              <p className="mt-1.5 text-xs leading-5 text-[#6b7d75] sm:text-sm sm:leading-6">Baca panduan fitur terperinci untuk admin, petugas kantin, dan wali.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Link to="/dokumentasi" className="btn-secondary min-h-11 justify-center px-5"><BookOpen size={17} /> Baca dokumentasi</Link>
              <Link to={loginHref} className="btn-primary min-h-11 justify-center px-5">Masuk aplikasi <ArrowRight size={17} /></Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-[#e3e9e2] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-[10px] text-[#7b8a83] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-6 sm:text-xs lg:px-8">
          <span>© {new Date().getFullYear()} PondokPay · {appName}</span>
          <span>Amanah · Mudah · Terjaga</span>
        </div>
      </footer>
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

function SessionRoutes({ session, onLogout, onInstitutionUpdate }) {
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
          <Route path="reports/financial" element={<AdminFinancialReports token={token} />} />
          <Route path="users" element={<AdminUsers token={token} />} />
          <Route path="credentials" element={<AdminCredentials token={token} />} />
          <Route path="approvals" element={<AdminApprovals token={token} />} />
          <Route path="audit" element={<AdminAudit token={token} />} />
          <Route path="cash" element={<AdminCash token={token} />} />
          <Route path="settings" element={<AdminSettings token={token} onUpdate={onInstitutionUpdate} />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    );
  }
  if (user.role === 'kasir') {
    return (
      <Routes>
        <Route path="/kasir" element={<MobileLayout user={user} basePath="/kasir" token={token} onLogout={onLogout}><CashierHome token={token} /></MobileLayout>} />
        <Route path="/kasir/history" element={<MobileLayout user={user} basePath="/kasir" token={token} onLogout={onLogout}><CashierHistory token={token} /></MobileLayout>} />
        <Route path="/kasir/catalog" element={<MobileLayout user={user} basePath="/kasir" token={token} onLogout={onLogout}><CashierCatalogManagement token={token} /></MobileLayout>} />
        <Route path="/kasir/purchasing" element={<MobileLayout user={user} basePath="/kasir" token={token} onLogout={onLogout}><Suspense fallback={<Loading />}><CashierPurchasing token={token} /></Suspense></MobileLayout>} />
        <Route path="/kasir/payout-approvals" element={<MobileLayout user={user} basePath="/kasir" token={token} onLogout={onLogout}><CashierPayoutApprovals token={token} /></MobileLayout>} />
        <Route path="/kasir/account" element={<MobileLayout user={user} basePath="/kasir" token={token} onLogout={onLogout}><CashierAccount token={token} user={user} onLogout={onLogout} /></MobileLayout>} />
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
        <Route path="/wali/topup" element={<MobileLayout user={user} basePath="/wali" onLogout={onLogout}><ParentTopup token={token} /></MobileLayout>} />
        <Route path="/wali/account" element={<MobileLayout user={user} basePath="/wali" onLogout={onLogout}><ParentAccount token={token} /></MobileLayout>} />
        <Route path="*" element={<Navigate to="/wali" replace />} />
      </Routes>
    );
  }
  return <div className="mx-auto max-w-lg p-8"><Alert type="warning">Akun ini belum memiliki halaman aplikasi. Silakan hubungi admin pondok.</Alert><button className="btn-secondary mt-5" onClick={onLogout}>Keluar</button></div>;
}

export default function App() {
  const [institution, setInstitution] = useState({
    name: 'Nama Pondok',
    app_name: null,
    address: 'Jl. Contoh No. 123, Kabupaten/Kota',
    phone: '+62 812-0000-0000',
    email: 'info@contoh.ponpes.id',
    manager_name: 'Nama Penanggung Jawab',
    logo_path: null,
    timezone: 'Asia/Jakarta',
  });
  const [institutionError, setInstitutionError] = useState('');
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
    let active = true;
    api.get('/settings').then((result) => {
      if (active && result.data) {
        setInstitutionTimeZone(result.data.timezone);
        setInstitution(result.data);
        setInstitutionError('');
      }
    }).catch((error) => {
      console.error('Load public institution settings failed:', error);
      if (active) setInstitutionError('Profil pondok belum dapat dimuat. Coba muat ulang halaman atau hubungi administrator.');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setInstitutionTimeZone(institution.timezone);
    document.title = institution.app_name || (institution.name ? `${institution.name} · PondokPay` : 'PondokPay');
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (appleIcon) appleIcon.href = resolveAssetUrl(institution.logo_path) || '/pwa-icon.svg';
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) favicon.href = resolveAssetUrl(institution.logo_path) || '/pwa-icon.svg';
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = '#075746';
  }, [institution]);

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

  const updateInstitution = (settings) => {
    setInstitutionTimeZone(settings.timezone);
    setInstitution(settings);
  };

  if (checking) return <InstitutionContext.Provider value={institution}><Loading label="Memeriksa sesi..." /></InstitutionContext.Provider>;
  if (challenge) return <InstitutionContext.Provider value={institution}><Mfa challenge={challenge} onComplete={completeLogin} onBack={() => setChallenge(null)} /></InstitutionContext.Provider>;
  if (!session) {
    return (
      <InstitutionContext.Provider value={institution}>
        <Routes>
          <Route path="/login" element={<Login onLogin={completeLogin} institutionError={institutionError} />} />
          <Route path="/" element={<LandingPage institution={institution} />} />
          <Route path="/dokumentasi" element={<DocumentationPage institution={institution} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </InstitutionContext.Provider>
    );
  }
  return (
    <InstitutionContext.Provider value={institution}>
      <SessionRoutes
        session={session}
        onLogout={logout}
        onInstitutionUpdate={updateInstitution}
      />
    </InstitutionContext.Provider>
  );
}
