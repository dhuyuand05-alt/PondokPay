import { createContext, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, Bell, Blocks, BookOpenText,
  ChevronLeft, ChevronRight, CircleUserRound, ClipboardList, Coffee, CreditCard, Download,
  Fingerprint, LayoutDashboard, LogOut, Menu, MessageCircle, Package, Search, Settings2, ShieldCheck, SlidersHorizontal, Users, Wallet, X,
} from 'lucide-react';
import { api, resolveAssetUrl } from './api.js';

export const cx = (...values) => values.filter(Boolean).join(' ');
export const InstitutionContext = createContext({
  name: 'PondokPay',
  app_name: null,
  logo_path: null,
  timezone: 'Asia/Jakarta',
});
export const useInstitution = () => useContext(InstitutionContext);
const PwaInstallContext = createContext({ installPrompt: null, install: async () => false, installed: false });
let institutionTimeZone = 'Asia/Jakarta';

export const setInstitutionTimeZone = (timezone) => {
  institutionTimeZone = timezone || 'Asia/Jakarta';
};

export function PwaInstallProvider({ children }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true,
    );
    const handleBeforeInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return false;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === 'accepted') setInstalled(true);
    return choice.outcome === 'accepted';
  };

  return (
    <PwaInstallContext.Provider value={{ installPrompt, install, installed }}>
      {children}
    </PwaInstallContext.Provider>
  );
}

export function formatMoney(value, currency = 'IDR') {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: institutionTimeZone,
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(date);
}

export function initials(name = '') {
  return String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'PP';
}

export function Avatar({ name, className = '' }) {
  return <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pondok-50 text-sm font-bold text-pondok-600', className)}>{initials(name)}</div>;
}

export function Brand({ inverse = false }) {
  const institution = useInstitution();
  return (
    <div className={cx('flex items-center gap-2.5 font-bold tracking-tight', inverse ? 'text-white' : 'text-pondok-700')}>
      <span className={cx('grid h-9 w-9 place-items-center rounded-xl', inverse ? 'bg-white/10' : 'bg-pondok-50')}>
        {institution.logo_path
          ? <img src={resolveAssetUrl(institution.logo_path)} alt="" className="h-full w-full rounded-xl object-contain" />
          : <Blocks size={21} />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xl">{institution.name || 'PondokPay'}</span>
        <span className={cx('block text-[10px] font-medium tracking-normal', inverse ? 'text-white/65' : 'text-muted')}>PondokPay</span>
      </span>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, detail, icon: Icon, dark = false }) {
  return (
    <div className={cx('card p-5', dark && 'border-pondok-700 bg-pondok-700 text-white')}>
      <div className="flex items-center justify-between text-sm">
        <span className={dark ? 'text-white/75' : 'text-muted'}>{label}</span>
        {Icon && <Icon size={20} className={dark ? 'text-white/75' : 'text-pondok-600'} />}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</div>
      {detail && <div className={cx('mt-2 text-xs', dark ? 'text-white/70' : 'text-muted')}>{detail}</div>}
    </div>
  );
}

export function StatusBadge({ children, tone = 'green' }) {
  const tones = {
    green: 'badge-green',
    amber: 'badge-amber',
    gray: 'badge-gray',
    red: 'badge bg-red-50 text-red-700',
  };
  return <span className={tones[tone] || tones.gray}>{children}</span>;
}

export function Alert({ type = 'info', children, className = '' }) {
  const styles = {
    info: 'border-pondok-100 bg-pondok-50 text-pondok-700',
    warning: 'border-amber-100 bg-amber-50 text-amber-800',
    error: 'border-red-100 bg-red-50 text-red-700',
    success: 'border-emerald-100 bg-emerald-50 text-emerald-800',
  };
  const Icon = type === 'error' ? Bell : ShieldCheck;
  return (
    <div className={cx('flex items-start gap-3 rounded-xl border p-4 text-sm', styles[type], className)}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Field({ label, hint, className = '', ...props }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      <input className="field" {...props} />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function SelectField({ label, children, className = '', ...props }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      <select className="field" {...props}>{children}</select>
    </label>
  );
}

export function TextAreaField({ label, className = '', ...props }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      <textarea className="field min-h-24 resize-y" {...props} />
    </label>
  );
}

export function Modal({ title, onClose, children, size = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6', size)}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button className="rounded-lg p-2 text-muted hover:bg-canvas" onClick={onClose} aria-label="Tutup"><X size={20} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function PwaInstallButton() {
  const { installPrompt, install, installed } = useContext(PwaInstallContext);
  const [helpOpen, setHelpOpen] = useState(false);
  if (installed) return null;

  const handleClick = async () => {
    if (!installPrompt) {
      setHelpOpen(true);
      return;
    }
    try {
      const accepted = await install();
      if (!accepted) setHelpOpen(true);
    } catch (error) {
      console.error('PWA installation prompt failed:', error);
      setHelpOpen(true);
    }
  };
  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11px] font-semibold text-pondok-700 transition hover:bg-pondok-50 sm:px-3"
        onClick={handleClick}
        title="Pasang aplikasi PondokPay"
      >
        <Download size={15} />
        <span>Pasang<span className="hidden sm:inline"> aplikasi</span></span>
      </button>
      {helpOpen && (
        <Modal title="Pasang aplikasi di perangkat" onClose={() => setHelpOpen(false)}>
          <div className="space-y-3 text-sm leading-relaxed text-muted">
            <p>PondokPay dipasang langsung dari browser sebagai PWA. Ini bukan file APK.</p>
            {isIos ? (
              <p>Di Safari, ketuk tombol <strong className="text-ink">Bagikan</strong>, lalu pilih <strong className="text-ink">Tambahkan ke Layar Utama</strong>.</p>
            ) : (
              <p>Buka menu browser <strong className="text-ink">⋮</strong> lalu pilih <strong className="text-ink">Instal aplikasi</strong> atau <strong className="text-ink">Tambahkan ke layar utama</strong>. Nama aplikasi dan ikon mengikuti pengaturan admin.</p>
            )}
          </div>
          <button type="button" className="btn-primary mt-5 w-full" onClick={() => setHelpOpen(false)}>Mengerti</button>
        </Modal>
      )}
    </>
  );
}

export function Loading({ label = 'Memuat data...' }) {
  return <div className="flex min-h-40 items-center justify-center gap-3 text-sm text-muted"><span className="h-5 w-5 animate-spin rounded-full border-2 border-pondok-200 border-t-pondok-600" />{label}</div>;
}

export function Empty({ title = 'Belum ada data', description = 'Data akan tampil di sini setelah tersedia.' }) {
  return <div className="px-5 py-12 text-center"><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-pondok-50 text-pondok-600"><ClipboardList size={22} /></div><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-muted">{description}</p></div>;
}

export function ErrorNotice({ error, onRetry }) {
  if (!error) return null;
  return <Alert type="error" className="mb-4"><div className="flex flex-wrap items-center justify-between gap-3"><span>{error}</span>{onRetry && <button className="font-semibold underline" onClick={onRetry}>Coba lagi</button>}</div></Alert>;
}

export function Pagination({ pagination, onPage }) {
  if (!pagination || Number(pagination.total) <= Number(pagination.limit)) return null;
  const totalPages = Math.ceil(Number(pagination.total) / Number(pagination.limit));
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-4 text-sm text-muted">
      <span>Halaman {pagination.page} dari {totalPages} · {pagination.total} data</span>
      <div className="flex gap-2">
        <button className="btn-secondary !p-2" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)} aria-label="Halaman sebelumnya"><ChevronLeft size={18} /></button>
        <button className="btn-secondary !p-2" disabled={pagination.page >= totalPages} onClick={() => onPage(pagination.page + 1)} aria-label="Halaman berikutnya"><ChevronRight size={18} /></button>
      </div>
    </div>
  );
}

const adminLinks = [
  { to: '/admin', label: 'Ringkasan', icon: LayoutDashboard, end: true },
  { to: '/admin/santri', label: 'Data santri', icon: Users },
  { to: '/admin/kantin', label: 'Kantin & kasir', icon: Coffee },
  { to: '/admin/wali', label: 'Orang tua / wali', icon: CircleUserRound },
  { to: '/admin/transaksi', label: 'Transaksi', icon: ArrowLeftRight },
  { to: '/admin/reports/financial', label: 'Laporan finansial', icon: ClipboardList },
];
const managementLinks = [
  { to: '/admin/settings', label: 'Pengaturan pondok', icon: Settings2 },
  { to: '/admin/cash', label: 'Kas admin', icon: Banknote },
  { to: '/admin/users', label: 'Akun pengguna', icon: CircleUserRound },
  { to: '/admin/credentials', label: 'Kredensial', icon: Fingerprint },
  { to: '/admin/approvals', label: 'Persetujuan finansial', icon: ShieldCheck },
  { to: '/admin/audit', label: 'Log audit', icon: BookOpenText },
];

export function AdminLayout({ user, onLogout }) {
  const institution = useInstitution();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const pageName = [...adminLinks, ...managementLinks].find((link) =>
    link.end ? location.pathname === link.to : location.pathname.startsWith(link.to),
  )?.label || 'Admin';

  const menu = (
    <div className="flex h-full flex-col bg-pondok-700 text-white">
      <div className="px-5 pb-5 pt-6"><Brand inverse /><div className="mt-7"><p className="text-sm font-semibold">{institution.name}</p><p className="mt-1 text-xs text-white/60">Ruang administrasi</p></div></div>
      <nav className="flex-1 px-3">
        <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/55">Utama</p>
        {adminLinks.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)} className={({ isActive }) => cx('mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition', isActive ? 'bg-white/10 font-semibold text-white' : 'text-white/80 hover:bg-white/5')}>
            <Icon size={18} />{label}
          </NavLink>
        ))}
        <p className="px-3 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-widest text-white/55">Pengelolaan</p>
        {managementLinks.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={() => setMobileOpen(false)} className={({ isActive }) => cx('mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition', isActive ? 'bg-white/10 font-semibold text-white' : 'text-white/80 hover:bg-white/5')}>
            <Icon size={18} />{label}
          </NavLink>
        ))}
      </nav>
      <div className="m-4 rounded-xl bg-white/5 p-4 text-xs leading-relaxed text-white/70"><ShieldCheck size={18} className="mb-2 text-pondok-200" />Akses admin dilindungi verifikasi dua langkah.</div>
      <div className="flex items-center gap-3 border-t border-white/10 p-4">
        <Avatar name={user.username} className="bg-white/15 text-white" />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.username}</p><p className="text-xs text-white/60">Administrator</p></div>
        <button onClick={onLogout} className="rounded-lg p-2 text-white/70 hover:bg-white/10" title="Keluar"><LogOut size={18} /></button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] lg:block">{menu}</aside>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)}><aside className="h-full w-[280px]" onClick={(event) => event.stopPropagation()}>{menu}</aside></div>}
      <div className="min-w-0 flex-1 lg:ml-[236px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3"><button className="rounded-lg p-2 hover:bg-canvas lg:hidden" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><span className="text-sm text-muted">Admin</span><ChevronRight size={15} className="text-muted" /><span className="text-sm font-semibold">{pageName}</span></div>
          <div className="flex items-center gap-2 sm:gap-3 text-xs text-muted"><PwaInstallButton /><span className="hidden sm:inline">{new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: institution.timezone || 'Asia/Jakarta' }).format(new Date())}</span><span className="badge-green">Sesi aman</span></div>
        </header>
        <main className="mx-auto max-w-[1480px] p-4 sm:p-7"><Outlet /></main>
        <footer className="flex justify-between gap-4 px-4 pb-6 text-[11px] text-muted sm:px-7"><span>PondokPay · {institution.name}</span><span>Amanah dalam setiap transaksi</span></footer>
      </div>
    </div>
  );
}

const bottomLinks = [
  { to: '', label: 'Beranda', icon: LayoutDashboard },
  { to: 'history', label: 'Riwayat', icon: ClipboardList },
  { to: 'account', label: 'Akun', icon: CircleUserRound },
];

export function MobileLayout({ user, basePath, title, children, onLogout, token }) {
  if (user.role === 'kasir') {
    return (
      <CashierFrame
        user={user}
        basePath={basePath}
        children={children}
        onLogout={onLogout}
        token={token}
      />
    );
  }
  const location = useLocation();
  const navigate = useNavigate();
  const navigationLinks = user.role === 'wali'
    ? [
      { to: '', label: 'Beranda', icon: LayoutDashboard },
      { to: 'history', label: 'Riwayat', icon: ClipboardList },
      { to: 'limit', label: 'Limit', icon: SlidersHorizontal },
      { to: 'topup', label: 'Top-up', icon: Wallet },
      { to: 'account', label: 'WhatsApp', icon: MessageCircle },
    ]
    : user.role === 'kasir'
      ? [
        { to: '', label: 'Transaksi', icon: Wallet },
        { to: 'catalog', label: 'Produk', icon: Package },
        { to: 'history', label: 'Riwayat', icon: ClipboardList },
        { to: 'account', label: 'Akun', icon: CircleUserRound },
      ]
    : bottomLinks;
  return (
    <div className={cx('mx-auto min-h-screen bg-[#f4f7f4] shadow-xl', user.role === 'kasir' ? 'max-w-7xl pb-20' : 'max-w-[520px] pb-24')}>
      <header className={cx('sticky top-0 z-20 flex items-center justify-between border-b border-line/70 bg-[#f4f7f4]/95 backdrop-blur-xl', user.role === 'kasir' ? 'px-3.5 py-2.5 sm:px-5 sm:py-3' : 'px-5 py-3.5')}>
        <Link to={basePath}><Brand /></Link>
        {user.role === 'wali'
          ? <div className="flex items-center gap-2"><PwaInstallButton /><button className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-muted transition hover:text-pondok-700" onClick={onLogout} aria-label="Keluar"><LogOut size={16} /></button></div>
          : <span className="badge-green capitalize">{user.role}</span>}
      </header>
      <main className={cx(user.role === 'kasir' ? 'px-3.5 pb-5 pt-3 sm:px-5 sm:pt-4 lg:px-7' : 'px-4 pb-6 pt-4 sm:px-5')}>
        {title && <h1 className="mb-4 text-2xl font-medium">{title}</h1>}{children}
      </main>
      <nav className={cx(
        'fixed bottom-0 left-1/2 z-30 grid w-full -translate-x-1/2 border-t border-line/80 bg-white/95 px-2 shadow-[0_-8px_24px_rgba(24,63,54,0.06)] backdrop-blur-xl',
        user.role === 'kasir' ? 'pb-[max(env(safe-area-inset-bottom),6px)] pt-1' : 'pb-[max(env(safe-area-inset-bottom),10px)] pt-2',
        user.role === 'kasir' ? 'max-w-7xl' : 'max-w-[520px]',
        navigationLinks.length === 5 ? 'grid-cols-5' : navigationLinks.length === 4 ? 'grid-cols-4' : 'grid-cols-3',
      )}>
        {navigationLinks.map(({ to, label, icon: Icon }) => {
          const active = to ? location.pathname.startsWith(`${basePath}/${to}`) : location.pathname === basePath || location.pathname === `${basePath}/`;
          return <button key={label} onClick={() => navigate(to ? `${basePath}/${to}` : basePath)} className={cx('relative flex flex-col items-center justify-center transition', user.role === 'kasir' ? 'min-h-10 gap-0.5 py-1 text-[10px]' : 'min-h-12 gap-1 py-1.5 text-[11px]', active ? 'font-semibold text-pondok-700' : 'text-muted')}><Icon size={user.role === 'kasir' ? 18 : 20} strokeWidth={active ? 2.4 : 1.8} /><span>{label}</span>{active && <span className="absolute -top-1 h-0.5 w-7 rounded-full bg-pondok-600" />}</button>;
        })}
      </nav>
    </div>
  );
}

function CashierFrame({ user, basePath, children, onLogout, token }) {
  const location = useLocation();
  const navigate = useNavigate();
  const institution = useInstitution();
  const [canteens, setCanteens] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [frameError, setFrameError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([api.get('/kantin', token), api.get('/kantin/pencairan/persetujuan', token)])
      .then(([canteenResult, approvalResult]) => {
        if (!active) return;
        setCanteens(canteenResult.data || []);
        setPendingCount((approvalResult.data || []).length);
      })
      .catch((error) => {
        if (active) setFrameError(error.message);
      });
    return () => { active = false; };
  }, [token]);

  const selectedCanteen = canteens[0];
  const navigation = [
    { to: '', label: 'Kasir', icon: Coffee, desktopLabel: 'Kasir' },
    { to: 'catalog', label: 'Produk', icon: Package, desktopLabel: 'Produk & stok' },
    { to: 'history', label: 'Riwayat', icon: ClipboardList, desktopLabel: 'Riwayat transaksi' },
    { to: 'payout-approvals', label: 'Lainnya', icon: Blocks, desktopLabel: 'Persetujuan pencairan' },
  ];
  const pageTitle = navigation.find(({ to }) =>
    to ? location.pathname.startsWith(`${basePath}/${to}`) : location.pathname === basePath || location.pathname === `${basePath}/`,
  )?.desktopLabel || 'Akun';
  const navButtonClass = (active) => cx(
    'flex items-center gap-3 rounded-xl text-sm transition',
    active ? 'bg-[#e9f4ef] font-semibold text-[#078264]' : 'text-[#718079] hover:bg-[#f5f7f4]',
  );

  return (
    <div className="mx-auto min-h-screen bg-[#f5f6f2] text-[#20352e] lg:flex">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[216px] flex-col border-r border-[#e0e5dd] bg-white lg:flex">
        <div className="border-b border-[#e9ece7] px-5 py-6">
          <Brand />
        </div>
        <div className="mx-4 mt-4 rounded-2xl bg-[#f5f5f1] p-3">
          <p className="truncate text-sm font-semibold">{selectedCanteen?.nama || 'Kantin'}</p>
          <p className="mt-1 truncate text-[11px] text-muted">{selectedCanteen?.lokasi || 'Kantin yang ditugaskan'}</p>
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#e5f4ec] px-2 py-1 text-[10px] font-semibold text-[#078264]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#078264]" />
            {selectedCanteen?.status === 'active' ? 'Aktif' : 'Memuat'}
          </span>
        </div>
        <nav className="mt-5 flex-1 px-4">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-[#9aa69f]">Ruang kerja</p>
          {navigation.map(({ to, icon: Icon, desktopLabel }) => {
            const active = to
              ? location.pathname.startsWith(`${basePath}/${to}`)
              : location.pathname === basePath || location.pathname === `${basePath}/`;
            return (
              <button
                key={to}
                type="button"
                onClick={() => navigate(to ? `${basePath}/${to}` : basePath)}
                className={cx(navButtonClass(active), 'mb-1.5 min-h-11 w-full px-3 text-left')}
              >
                <Icon size={17} />
                <span className="flex-1">{desktopLabel}</span>
                {to === 'payout-approvals' && pendingCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{pendingCount}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="mx-4 mb-3 rounded-xl bg-[#104a39] p-4 text-white">
          <CreditCard size={17} className="mb-3 text-white/80" />
          <p className="text-[11px] text-white/70">Saldo kantin</p>
          <p className="mt-1 text-xl font-semibold">{formatMoney(selectedCanteen?.saldo || 0)}</p>
          <p className="mt-2 text-[10px] leading-4 text-white/65">Dikelola bersama, tercatat rapi.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`${basePath}/account`)}
          className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-[#e9f4ef] px-3 py-2 text-left text-[11px] text-[#176b50]"
        >
          <ShieldCheck size={15} />
          Akun dilindungi MFA
        </button>
        <div className="flex items-center gap-3 border-t border-[#e9ece7] px-4 py-3">
          <Avatar name={user.username} className="h-8 w-8 bg-[#f2f3ef] text-xs" />
          <button
            type="button"
            onClick={() => navigate(`${basePath}/account`)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate text-xs font-semibold">{user.username}</p>
            <p className="text-[10px] text-muted">Kasir kantin</p>
          </button>
          <button onClick={onLogout} className="rounded-lg p-1.5 text-muted hover:bg-canvas" aria-label="Keluar">
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1 lg:ml-[216px]">
        <header className="sticky top-0 z-20 flex min-h-[60px] items-center justify-between border-b border-[#e0e5dd] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <div className="lg:hidden">
              <Brand />
              <p className="ml-10 -mt-1 max-w-[210px] truncate text-[10px] text-muted">{selectedCanteen?.nama || 'Ruang kasir'}</p>
            </div>
            <div className="hidden items-center gap-2 text-xs lg:flex">
              <span className="text-muted">{selectedCanteen?.nama || institution.name}</span>
              <ChevronRight size={14} className="text-muted" />
              <span className="font-semibold">{pageTitle}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted sm:gap-3 sm:text-xs">
            <PwaInstallButton />
            <span className="hidden sm:inline">
              {new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: institution.timezone || 'Asia/Jakarta' }).format(new Date())}
            </span>
            <span className="hidden h-4 border-l border-line sm:inline" />
            <button
              type="button"
              onClick={() => navigate(`${basePath}/account`)}
              aria-label="Buka pengaturan akun"
              className="inline-flex items-center gap-1 text-[#078264]"
            >
              <ShieldCheck size={14} /> MFA aktif
            </button>
          </div>
        </header>
        <main className="mx-auto min-h-[calc(100vh-60px)] max-w-[1500px] px-4 pb-24 pt-4 sm:px-6 lg:px-7 lg:pb-8 lg:pt-7">
          {frameError && <Alert type="error" className="mb-4">{frameError}</Alert>}
          {children}
        </main>
      </div>
      <nav className="fixed bottom-0 left-1/2 z-30 grid w-full max-w-[520px] -translate-x-1/2 grid-cols-4 border-t border-[#e0e5dd] bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1 shadow-[0_-8px_24px_rgba(24,63,54,0.06)] backdrop-blur-xl lg:hidden">
        {navigation.map(({ to, label, icon: Icon }) => {
          const active = to
            ? location.pathname.startsWith(`${basePath}/${to}`)
            : location.pathname === basePath || location.pathname === `${basePath}/`;
          return (
            <button
              key={to}
              onClick={() => navigate(to ? `${basePath}/${to}` : basePath)}
              className={cx('relative flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10px]', active ? 'font-semibold text-[#078264]' : 'text-muted')}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
              <span>{label}</span>
              {active && <span className="absolute -top-1 h-0.5 w-7 rounded-full bg-[#078264]" />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function MobileTop({ title, subtitle, action }) {
  return <div className="mb-5"><div className="flex items-center justify-between gap-3"><h2 className="text-2xl font-medium">{title}</h2>{action}</div>{subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}</div>;
}

export function AmountLine({ label, amount, positive = false, strong = false }) {
  return <div className="flex items-center justify-between gap-3 py-1.5 text-sm"><span className="text-muted">{label}</span><span className={cx(strong && 'font-semibold', positive && 'text-pondok-600')}>{amount}</span></div>;
}

export function TransactionMark({ type }) {
  if (type === 'belanja' || type === 'penjualan') return <span className="grid h-9 w-9 place-items-center rounded-xl bg-pondok-50 text-pondok-600"><Coffee size={17} /></span>;
  if (type === 'topup') return <span className="grid h-9 w-9 place-items-center rounded-xl bg-pondok-50 text-pondok-600"><ArrowDownLeft size={17} /></span>;
  return <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700"><ArrowUpRight size={17} /></span>;
}

export function MobileLoading({ text = 'Memuat data...' }) {
  return <div className="flex min-h-36 items-center justify-center gap-3 text-sm text-muted"><span className="h-5 w-5 animate-spin rounded-full border-2 border-pondok-200 border-t-pondok-600" />{text}</div>;
}
