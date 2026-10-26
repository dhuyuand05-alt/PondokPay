import {
  BadgeCheck,
  CalendarDays,
  KeyRound,
  LogOut,
  MapPin,
  ShieldCheck,
  Store,
  UserRound,
} from 'lucide-react';
import { useApiData } from '../../hooks.js';
import { Alert, Avatar, Empty, ErrorNotice, formatDate, MobileLoading } from '../../ui.jsx';

export function CashierAccount({ token, user, onLogout }) {
  const {
    data: profileData,
    loading: profileLoading,
    error: profileError,
    refresh: refreshProfile,
  } = useApiData('/auth/me', token);
  const {
    data: canteenData,
    loading: canteensLoading,
    error: canteenError,
    refresh: refreshCanteens,
  } = useApiData('/kantin', token);
  const profile = profileData?.user || user;
  const canteens = canteenData?.data || [];

  if (profileLoading || canteensLoading) return <MobileLoading />;

  return (
    <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Pengaturan petugas</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Akun kasir</h1>
          <p className="mt-1 text-sm text-muted">Informasi akun, penugasan, dan keamanan akses.</p>
        </div>
        <span className="hidden items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-muted shadow-sm sm:inline-flex">
          <CalendarDays size={15} className="text-pondok-700" />
          {profile?.created_at ? `Bergabung ${formatDate(profile.created_at)}` : 'PondokPay'}
        </span>
      </header>

      {(profileError || canteenError) && (
        <div className="space-y-2">
          {profileError && <ErrorNotice error={profileError} onRetry={refreshProfile} />}
          {canteenError && <ErrorNotice error={canteenError} onRetry={refreshCanteens} />}
        </div>
      )}

      <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-[#0a4d3d] via-pondok-700 to-[#08785d] p-5 text-white shadow-[0_18px_40px_rgba(7,87,70,0.16)] sm:p-7 lg:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full border-[44px] border-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-36 right-1/4 -z-10 h-64 w-64 rounded-full bg-white/[0.04] blur-2xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <Avatar
              name={profile?.username || 'Kasir'}
              className="h-16 w-16 shrink-0 border border-white/20 bg-white/15 text-xl text-white shadow-inner sm:h-[76px] sm:w-[76px]"
            />
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/90">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Petugas terverifikasi
              </span>
              <h2 className="mt-2 truncate text-xl font-semibold sm:text-2xl">{profile?.username || 'Kasir'}</h2>
              <p className="mt-1 text-xs text-white/70 sm:text-sm">
                ID akun {profile?.id || user?.id || '—'} <span className="mx-1.5 text-white/35">·</span>
                <span className="capitalize">{profile?.role || 'kasir'}</span>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-white/15 pt-4 sm:min-w-[280px] sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <div className="rounded-xl bg-white/[0.08] p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-white/65">Kantin ditugaskan</p>
              <p className="mt-1 text-xl font-semibold">{canteens.length}</p>
            </div>
            <div className="rounded-xl bg-white/[0.08] p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-white/65">Keamanan</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                <ShieldCheck size={16} className="text-emerald-200" /> MFA aktif
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)] lg:items-start">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
            <div>
              <p className="eyebrow">Penugasan</p>
              <h2 className="mt-1 text-base font-semibold">Kantin saya</h2>
            </div>
            <span className="rounded-full bg-pondok-50 px-3 py-1.5 text-xs font-semibold text-pondok-700">
              {canteens.length} aktif
            </span>
          </div>
          {canteens.length ? (
            <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
              {canteens.map((canteen) => (
                <article
                  key={canteen.id}
                  className="group flex min-w-0 items-start gap-3 rounded-2xl border border-line/80 bg-[#fcfdfb] p-3.5 transition hover:border-pondok-200 hover:bg-pondok-50/40 sm:p-4"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-pondok-50 text-pondok-700 transition group-hover:bg-white">
                    <Store size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{canteen.nama}</p>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Aktif
                      </span>
                    </div>
                    <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-muted">
                      <MapPin size={14} className="mt-0.5 shrink-0 text-pondok-600" />
                      <span className="min-w-0">{canteen.lokasi || 'Lokasi belum diatur'}</span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            !canteenError && (
              <div className="p-4">
                <Empty
                  title="Belum ada kantin ditugaskan"
                  description="Hubungi admin pondok untuk mengatur penugasan kantin."
                />
              </div>
            )
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
          <div className="flex items-start gap-3 p-4 sm:p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pondok-50 text-pondok-700">
              <ShieldCheck size={19} />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Perlindungan akun</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Verifikasi dua langkah wajib aktif untuk menjaga akses kasir dan transaksi.
              </p>
            </div>
          </div>
          <div className="space-y-3 border-t border-line bg-[#fbfcfa] px-4 py-4 sm:px-5">
            <div className="flex items-center gap-3">
              <KeyRound size={16} className="shrink-0 text-pondok-700" />
              <span className="flex-1 text-xs text-muted">Autentikasi multi-faktor</span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <BadgeCheck size={15} /> Aktif
              </span>
            </div>
            <div className="flex items-start gap-3">
              <UserRound size={16} className="mt-0.5 shrink-0 text-pondok-700" />
              <p className="text-xs leading-relaxed text-muted">
                Jangan bagikan kode verifikasi, kata sandi, atau data kredensial santri kepada siapa pun.
              </p>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
              onClick={() => {
                if (window.confirm('Keluar dari akun kasir?')) onLogout();
              }}
            >
              <LogOut size={16} />
              Keluar dari akun
            </button>
          </div>
        </section>
      </div>

      <p className="pb-2 text-center text-[11px] text-muted">
        PondokPay <span className="mx-1 text-line">·</span> Amanah dalam setiap transaksi
      </p>
    </div>
  );
}
