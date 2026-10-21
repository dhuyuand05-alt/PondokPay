import { LogOut, MapPin, ShieldCheck, Store, UserRound } from 'lucide-react';
import { useApiData } from '../../hooks.js';
import { Avatar, Empty, ErrorNotice, formatDate, MobileLoading, StatusBadge } from '../../ui.jsx';

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
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-pondok-800 via-pondok-700 to-pondok-600 p-5 text-white shadow-[0_18px_40px_rgba(7,87,70,0.2)] sm:p-6">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border-[28px] border-white/5" />
        <div className="relative flex items-center gap-4">
          <Avatar
            name={profile?.username || 'Kasir'}
            className="h-16 w-16 border border-white/20 bg-white/15 text-lg text-white"
          />
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/90">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Akun kasir
            </span>
            <h1 className="mt-2 truncate text-xl font-semibold">{profile?.username || 'Kasir'}</h1>
            <p className="mt-0.5 text-sm text-white/70">ID akun {profile?.id || user?.id || '—'}</p>
          </div>
          <UserRound size={22} className="shrink-0 text-white/65" />
        </div>
        <div className="relative mt-5 flex items-center justify-between border-t border-white/15 pt-3 text-xs text-white/75">
          <span className="capitalize">Role · {profile?.role || 'kasir'}</span>
          <span>
            {profile?.created_at ? `Bergabung ${formatDate(profile.created_at)}` : 'PondokPay'}
          </span>
        </div>
      </section>

      {profileError && <ErrorNotice error={profileError} onRetry={refreshProfile} />}
      {canteenError && <ErrorNotice error={canteenError} onRetry={refreshCanteens} />}

      <section>
        <div className="mb-3 flex items-end justify-between px-1">
          <div>
            <p className="eyebrow">Penugasan</p>
            <h2 className="mt-1 font-semibold">Kantin saya</h2>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-muted shadow-sm">
            {canteens.length} aktif
          </span>
        </div>
        {canteens.length ? (
          <div className="space-y-2.5">
            {canteens.map((canteen) => (
              <article
                key={canteen.id}
                className="flex items-center gap-3 rounded-2xl border border-line/70 bg-white p-3.5"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-pondok-50 text-pondok-700">
                  <Store size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{canteen.nama}</p>
                  <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted">
                    <MapPin size={13} />
                    {canteen.lokasi || 'Lokasi belum diatur'}
                  </p>
                </div>
                <span className="badge-green">Aktif</span>
              </article>
            ))}
          </div>
        ) : (
          !canteenError && (
            <Empty
              title="Belum ada kantin ditugaskan"
              description="Hubungi admin pondok untuk mengatur penugasan kantin."
            />
          )
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-line/70 bg-white">
        <div className="flex items-start gap-3 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pondok-50 text-pondok-700">
            <ShieldCheck size={19} />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Keamanan akun</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Akun kasir dilindungi verifikasi dua langkah. Jangan bagikan kode verifikasi atau data
              kredensial santri kepada siapa pun.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-line/70 px-4 py-3 text-sm">
          <span className="text-muted">Verifikasi dua langkah</span>
          <span className="badge-green">Wajib aktif</span>
        </div>
      </section>

      <button
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
        onClick={() => {
          if (window.confirm('Keluar dari akun kasir?')) onLogout();
        }}
      >
        <LogOut size={17} />
        Keluar dari akun
      </button>
      <p className="pb-2 text-center text-[11px] text-muted">
        PondokPay · Amanah dalam setiap transaksi
      </p>
    </div>
  );
}
