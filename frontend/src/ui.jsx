import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, Bell, Blocks, BookOpenText,
  ChevronLeft, ChevronRight, CircleUserRound, ClipboardList, Coffee, CreditCard,
  Fingerprint, LayoutDashboard, LogOut, Menu, Search, ShieldCheck, SlidersHorizontal, Users, Wallet, X,
} from 'lucide-react';

export const cx = (...values) => values.filter(Boolean).join(' ');

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
  return (
    <div className={cx('flex items-center gap-2.5 font-bold tracking-tight', inverse ? 'text-white' : 'text-pondok-700')}>
      <span className={cx('grid h-9 w-9 place-items-center rounded-xl', inverse ? 'bg-white/10' : 'bg-pondok-50')}>
        <Blocks size={21} />
      </span>
      <span className="text-xl">PondokPay</span>
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
];
const managementLinks = [
  { to: '/admin/users', label: 'Akun pengguna', icon: CircleUserRound },
  { to: '/admin/credentials', label: 'Kredensial', icon: Fingerprint },
  { to: '/admin/approvals', label: 'Persetujuan finansial', icon: ShieldCheck },
  { to: '/admin/audit', label: 'Log audit', icon: BookOpenText },
];

export function AdminLayout({ user, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const pageName = [...adminLinks, ...managementLinks].find((link) =>
    link.end ? location.pathname === link.to : location.pathname.startsWith(link.to),
  )?.label || 'Admin';

  const menu = (
    <div className="flex h-full flex-col bg-pondok-700 text-white">
      <div className="px-5 pb-5 pt-6"><Brand inverse /><div className="mt-7"><p className="text-sm font-semibold">Pondok Assa'adah</p><p className="mt-1 text-xs text-white/60">Ruang administrasi</p></div></div>
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
          <div className="flex items-center gap-3 text-xs text-muted"><span className="hidden sm:inline">{new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date())}</span><span className="badge-green">Sesi aman</span></div>
        </header>
        <main className="mx-auto max-w-[1480px] p-4 sm:p-7"><Outlet /></main>
        <footer className="flex justify-between px-4 pb-6 text-[11px] text-muted sm:px-7"><span>PondokPay · Pondok Assa'adah</span><span>Amanah dalam setiap transaksi</span></footer>
      </div>
    </div>
  );
}

const bottomLinks = [
  { to: '', label: 'Beranda', icon: LayoutDashboard },
  { to: 'history', label: 'Riwayat', icon: ClipboardList },
  { to: 'account', label: 'Akun', icon: CircleUserRound },
];

export function MobileLayout({ user, basePath, title, children, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationLinks = user.role === 'wali'
    ? [
      { to: '', label: 'Beranda', icon: LayoutDashboard },
      { to: 'history', label: 'Riwayat', icon: ClipboardList },
      { to: 'limit', label: 'Limit', icon: SlidersHorizontal },
    ]
    : user.role === 'kasir'
      ? [
        { to: '', label: 'Transaksi', icon: Wallet },
        { to: 'history', label: 'Riwayat', icon: ClipboardList },
        { to: 'account', label: 'Akun', icon: CircleUserRound },
      ]
    : bottomLinks;
  return (
    <div className="mx-auto min-h-screen max-w-[520px] bg-[#f4f7f4] pb-24 shadow-xl">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line/70 bg-[#f4f7f4]/95 px-5 py-3.5 backdrop-blur-xl">
        <Link to={basePath}><Brand /></Link>
        {user.role === 'wali'
          ? <button className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-muted transition hover:text-pondok-700" onClick={onLogout} aria-label="Keluar"><LogOut size={17} /></button>
          : <span className="badge-green capitalize">{user.role}</span>}
      </header>
      <main className="px-4 pb-6 pt-4 sm:px-5">{title && <h1 className="mb-4 text-2xl font-medium">{title}</h1>}{children}</main>
      <nav className="fixed bottom-0 left-1/2 z-30 grid w-full max-w-[520px] -translate-x-1/2 grid-cols-3 border-t border-line/80 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 shadow-[0_-8px_24px_rgba(24,63,54,0.06)] backdrop-blur-xl">
        {navigationLinks.map(({ to, label, icon: Icon }) => {
          const active = to ? location.pathname.startsWith(`${basePath}/${to}`) : location.pathname === basePath || location.pathname === `${basePath}/`;
          return <button key={label} onClick={() => navigate(to ? `${basePath}/${to}` : basePath)} className={cx('relative flex min-h-12 flex-col items-center justify-center gap-1 py-1.5 text-[11px] transition', active ? 'font-semibold text-pondok-700' : 'text-muted')}><Icon size={20} strokeWidth={active ? 2.4 : 1.8} /><span>{label}</span>{active && <span className="absolute -top-2 h-0.5 w-8 rounded-full bg-pondok-600" />}</button>;
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
