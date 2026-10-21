import { Link } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CirclePlus,
  CreditCard,
  Download,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  Avatar,
  Empty,
  ErrorNotice,
  formatDate,
  formatMoney,
  Loading,
  PageHeader,
  StatCard,
  StatusBadge,
} from '../../ui.jsx';
import { typeName } from './shared.jsx';

export function AdminDashboard({ token, user }) {
  const { data, loading, error, refresh } = useApiData('/admin/dashboard', token);
  const summary = data?.summary || {};
  const transactions = data?.recent_transactions || [];
  return (
    <>
      <PageHeader
        title="Keuangan pondok, dalam genggaman."
        subtitle={`Assalamu’alaikum, ${user.username}. Berikut ringkasan operasional hari ini.`}
        action={
          <Link to="/admin/santri" className="btn-primary">
            <UserPlus size={17} />
            Kelola santri
          </Link>
        }
      />
      <ErrorNotice error={error} onRetry={refresh} />
      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              dark
              label="Total saldo santri"
              value={formatMoney(summary.total_saldo)}
              detail="Saldo tersimpan di seluruh akun santri"
              icon={Wallet}
            />
            <StatCard
              label="Total saldo kantin"
              value={formatMoney(summary.total_saldo_kantin)}
              detail={`Tersedia di ${summary.total_kantin ?? 0} kantin pondok`}
              icon={CreditCard}
            />
            <StatCard
              label="Total transaksi"
              value={Number(summary.total_transaksi || 0).toLocaleString('id-ID')}
              detail="Seluruh transaksi yang tercatat"
              icon={Download}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Santri', summary.total_santri],
              ['Orang tua / wali', summary.total_wali],
              ['Kasir', summary.total_kasir],
              ['Kantin', summary.total_kantin],
            ].map(([label, value]) => (
              <div key={label} className="card flex items-center gap-3 p-4">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-pondok-50 text-pondok-600">
                  <CirclePlus size={19} />
                </div>
                <div>
                  <p className="text-xl font-semibold">
                    {Number(value || 0).toLocaleString('id-ID')}
                  </p>
                  <p className="text-xs text-muted">{label}</p>
                </div>
              </div>
            ))}
          </div>
          <section className="card mt-5 p-5">
            <h2 className="font-semibold">Pergerakan dana hari ini</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {[
                ['Belanja santri', summary.belanja_hari_ini, ArrowDownLeft],
                ['Top up saldo', summary.topup_hari_ini, ArrowDownLeft],
                ['Penarikan saldo', summary.tarik_hari_ini, ArrowUpRight],
              ].map(([label, value, Icon]) => (
                <div key={label} className="flex items-center gap-3">
                  <Icon className="text-pondok-600" size={20} />
                  <div>
                    <p className="text-xs text-muted">{label}</p>
                    <p className="mt-1 text-xl font-semibold">{formatMoney(value)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="card mt-5 overflow-hidden">
            <div className="flex items-center justify-between p-5">
              <h2 className="font-semibold">Transaksi terbaru</h2>
              <Link className="text-sm font-semibold text-pondok-600" to="/admin/transaksi">
                Lihat semua →
              </Link>
            </div>
            {!transactions.length ? (
              <Empty title="Belum ada transaksi" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[740px]">
                  <thead>
                    <tr>
                      {['Santri', 'Transaksi', 'Keterangan', 'Nominal', 'Saldo akhir'].map((h) => (
                        <th className="table-head px-4 py-3" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((item) => (
                      <tr key={item.id}>
                        <td className="table-cell">
                          <div className="flex items-center gap-3">
                            <Avatar name={item.nama_lengkap} />
                            <div>
                              <p className="font-semibold">{item.nama_lengkap || 'Santri'}</p>
                              <p className="text-xs text-muted">
                                {item.nis || '—'} · {formatDate(item.created_at, true)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="table-cell">
                          <StatusBadge>{typeName(item.tipe_transaksi)}</StatusBadge>
                        </td>
                        <td className="table-cell">{item.keterangan || item.nama_kantin || '—'}</td>
                        <td className="table-cell font-semibold">
                          {item.tipe_transaksi === 'topup' ? '+' : '−'}
                          {formatMoney(item.jumlah)}
                        </td>
                        <td className="table-cell">{formatMoney(item.saldo_akhir)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
