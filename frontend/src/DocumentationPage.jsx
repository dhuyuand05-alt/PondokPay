import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BellRing,
  BookOpen,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Fingerprint,
  Landmark,
  Settings,
  ShieldCheck,
  Smartphone,
  Store,
  Users,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Brand } from './ui.jsx';

const contents = [
  { id: 'ringkasan', label: 'Gambaran umum', icon: BookOpen },
  { id: 'admin', label: 'Fitur admin pondok', icon: Landmark },
  { id: 'kantin', label: 'Kasir dan kantin', icon: Store },
  { id: 'wali', label: 'Portal orang tua / wali', icon: Users },
  { id: 'notifikasi', label: 'Notifikasi WhatsApp', icon: BellRing },
  { id: 'laporan', label: 'Laporan dan audit', icon: BarChart3 },
  { id: 'pengaturan', label: 'Pengaturan dan PWA', icon: Settings },
  { id: 'keamanan', label: 'Keamanan dan batasan', icon: ShieldCheck },
];

function FeatureList({ items }) {
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-[#536c61]">
          <Check size={16} className="mt-1 shrink-0 text-[#078264]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ArticleSection({ id, icon: Icon, eyebrow, title, description, items, children }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-[#e7ede7] py-8 first:pt-0 last:border-0 sm:py-10">
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f4ec] text-[#08745a] sm:h-12 sm:w-12 sm:rounded-2xl">
          <Icon size={21} />
        </span>
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#078264] sm:text-[11px]">{eyebrow}</span>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#183f36] sm:text-2xl">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#667a71] sm:text-[15px] sm:leading-7">{description}</p>
        </div>
      </div>
      {items && <FeatureList items={items} />}
      {children}
    </section>
  );
}

export default function DocumentationPage({ institution }) {
  const appName = institution.name || 'PondokPay';

  return (
    <div className="min-h-screen bg-[#f7f9f6] text-[#183f36]">
      <header className="sticky top-0 z-20 border-b border-[#e5ece5] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="Kembali ke beranda" className="min-w-0"><Brand /></Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <Link to="/" className="hidden items-center gap-1.5 text-sm font-semibold text-[#60736b] transition hover:text-[#08745a] sm:inline-flex">
              <ArrowLeft size={16} /> Beranda
            </Link>
            <Link to="/login" className="btn-primary !min-h-10 !rounded-lg !px-3.5 !py-2 text-xs sm:!px-4 sm:text-sm">
              Masuk aplikasi <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <div className="mb-6 flex items-center gap-2 text-xs font-medium text-[#809087]">
          <Link to="/" className="transition hover:text-[#08745a]">Beranda</Link>
          <ChevronRight size={13} />
          <span className="text-[#08745a]">Dokumentasi fitur</span>
        </div>

        <section className="relative isolate overflow-hidden rounded-2xl bg-[#104a39] px-5 py-8 text-white shadow-[0_24px_70px_rgba(25,66,51,0.13)] sm:rounded-3xl sm:px-10 sm:py-12 lg:px-14">
          <div className="pointer-events-none absolute -right-16 -top-32 -z-10 h-72 w-72 rounded-full bg-[#43856a]/40 blur-3xl sm:h-96 sm:w-96" />
          <div className="pointer-events-none absolute -bottom-36 left-1/3 -z-10 h-64 w-64 rounded-full bg-[#d3ae5e]/15 blur-3xl" />
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#d1ead8] sm:text-xs">
              <BookOpen size={14} /> Panduan fitur PondokPay
            </span>
            <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              Kenali cara kerja <span className="text-[#b6e3c5]">{appName}</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/75 sm:text-base sm:leading-7">
              Dokumentasi ini menjelaskan fitur yang tersedia bagi pengelola pondok, petugas kantin, dan wali santri—mulai dari pencatatan saldo hingga laporan dan notifikasi.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-white/75 sm:gap-3 sm:text-xs">
              {['Fitur per peran', 'Alur transaksi', 'Keamanan akun'].map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                  <Check size={13} className="text-[#b6e3c5]" /> {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <div className="mt-7 grid items-start gap-7 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-10">
          <aside className="rounded-2xl border border-[#e5ece5] bg-white p-4 shadow-[0_8px_28px_rgba(18,60,48,0.04)] lg:sticky lg:top-24">
            <p className="px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#829188]">Daftar isi</p>
            <nav className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-1" aria-label="Daftar isi dokumentasi">
              {contents.map(({ id, label, icon: Icon }) => (
                <a key={id} href={`#${id}`} className="group flex min-h-10 items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-medium leading-4 text-[#60736b] transition hover:bg-[#edf7f2] hover:text-[#08745a] sm:text-xs">
                  <Icon size={15} className="shrink-0 text-[#829188] transition group-hover:text-[#08745a]" />
                  {label}
                </a>
              ))}
            </nav>
            <div className="mt-4 hidden rounded-xl bg-[#f5f8f4] p-3 lg:block">
              <p className="text-xs font-semibold">Ingin mulai menggunakan?</p>
              <p className="mt-1 text-[11px] leading-5 text-[#73837b]">Masuk dengan akun yang dibuat oleh admin pondok.</p>
              <Link to="/login" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#08745a] hover:underline">Buka halaman masuk <ArrowRight size={13} /></Link>
            </div>
          </aside>

          <article className="min-w-0 rounded-2xl border border-[#e5ece5] bg-white px-5 py-6 shadow-[0_8px_28px_rgba(18,60,48,0.04)] sm:px-8 sm:py-9">
            <ArticleSection
              id="ringkasan"
              icon={BookOpen}
              eyebrow="01 · Gambaran umum"
              title="Satu sistem untuk alur keuangan pondok"
              description="PondokPay menghubungkan pengelolaan data santri dan saldo, transaksi kantin, serta pemantauan oleh wali. Akses setiap pengguna dibatasi sesuai perannya; data transaksi dan saldo tetap diproses serta divalidasi oleh server."
              items={[
                'Admin mengatur data operasional, akun, laporan, dan identitas pondok.',
                'Petugas kantin mencatat transaksi dengan cara yang sesuai operasional kantinnya.',
                'Wali memantau anak yang terhubung, melihat transaksi, dan mengelola limit belanja.',
                'Aplikasi dirancang untuk digunakan pengelola dan wali; saat ini belum ada portal khusus santri.',
              ]}
            />

            <ArticleSection
              id="admin"
              icon={Landmark}
              eyebrow="02 · Pengelolaan pondok"
              title="Fitur admin pondok"
              description="Admin mengelola konfigurasi dan data utama dari dashboard. Pengelolaan ini membantu menyatukan pencatatan tanpa mengambil alih operasional stok produk yang menjadi tanggung jawab kantin."
              items={[
                'Kelola data santri, akun pengguna, wali, relasi orang tua-anak, dan kredensial RFID atau fingerprint.',
                'Atur kantin dan penugasan kasir, serta pantau nilai transaksi dan pengajuan pencairan.',
                'Tinjau transaksi, persetujuan finansial, laporan keuangan, dan log audit.',
                'Atur profil pondok, zona waktu, identitas aplikasi, kanal WhatsApp, dan pengaturan layanan.',
              ]}
            />

            <ArticleSection
              id="kantin"
              icon={Store}
              eyebrow="03 · Operasional kantin"
              title="Kasir dan kantin"
              description="Petugas kantin dapat memakai alur pencatatan nominal atau kasir produk. Pilihan ini memungkinkan tiap kantin menggunakan cara kerja yang paling sesuai."
              items={[
                'Pada kasir produk, petugas mengelola katalog dan stok untuk kantin yang ditugaskan.',
                'Produk dapat dicari melalui nama atau SKU/barcode; pemindai barcode yang bertindak sebagai keyboard dapat digunakan.',
                'Pada pencatatan nominal, kasir memasukkan jumlah transaksi tanpa perlu mengelola katalog produk.',
                'Santri diverifikasi menggunakan identifier yang didukung, misalnya NIS, RFID, atau fingerprint ID.',
                'Admin melihat catatan dan ringkasan nilai transaksi kantin, bukan rincian produk yang dibeli.',
              ]}
            >
              <div className="mt-5 rounded-xl border border-[#e4eee5] bg-[#f6faf6] p-4 sm:p-5">
                <div className="flex items-center gap-2 text-sm font-semibold"><ClipboardList size={17} className="text-[#078264]" /> Alur transaksi singkat</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[
                    ['01', 'Pilih kantin dan verifikasi santri'],
                    ['02', 'Masukkan nominal atau pilih produk'],
                    ['03', 'Periksa total lalu konfirmasi transaksi'],
                  ].map(([number, text]) => (
                    <div key={number} className="flex items-start gap-2 rounded-lg bg-white p-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#e8f4ec] text-[10px] font-bold text-[#08745a]">{number}</span>
                      <p className="text-xs leading-5 text-[#60736b]">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </ArticleSection>

            <ArticleSection
              id="wali"
              icon={Users}
              eyebrow="04 · Pemantauan keluarga"
              title="Portal orang tua / wali"
              description="Wali dapat mengakses informasi anak yang telah dihubungkan oleh pengelola. Informasi dan tindakan di portal wali dibatasi pada relasi tersebut."
              items={[
                'Lihat saldo anak, transaksi terbaru, dan riwayat transaksi.',
                'Atur limit belanja harian yang berlaku untuk anak.',
                'Lakukan top-up digital melalui QRIS Midtrans dan pantau status pembayarannya.',
                'Daftarkan nomor WhatsApp untuk menerima notifikasi setelah proses verifikasi.',
              ]}
            />

            <ArticleSection
              id="notifikasi"
              icon={BellRing}
              eyebrow="05 · Komunikasi"
              title="Notifikasi transaksi melalui WhatsApp"
              description="Notifikasi wali memakai mekanisme opt-in agar pesan hanya dikirim setelah wali memulai percakapan dan memverifikasi nomor yang digunakan."
              items={[
                'Admin menyiapkan koneksi WhatsApp pada pengaturan sistem.',
                'Wali memasukkan nomor tujuan lalu memulai verifikasi melalui tautan pesan yang disediakan.',
                'Wali harus mengirim sendiri pesan berisi kode verifikasi; nomor belum aktif menerima notifikasi sebelum langkah ini selesai.',
                'Notifikasi transaksi mencakup aktivitas belanja, top-up, dan penarikan saldo anak.',
              ]}
            >
              <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#f0e6c9] bg-[#fcf8ec] p-4">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#9a7c35]" />
                <p className="text-xs leading-5 text-[#746744]">Koneksi WhatsApp perlu dijaga tetap aktif. Jika perangkat bot terputus, admin perlu menyambungkannya kembali sebelum pengiriman dapat dilanjutkan.</p>
              </div>
            </ArticleSection>

            <ArticleSection
              id="laporan"
              icon={BarChart3}
              eyebrow="06 · Pemantauan"
              title="Laporan keuangan dan log audit"
              description="Admin memiliki alat untuk meninjau aktivitas dan rekap berdasarkan data transaksi yang tercatat. Ekspor membantu penggunaan laporan di luar aplikasi."
              items={[
                'Laporan finansial dapat difilter berdasarkan periode, santri, dan kantin.',
                'Ringkasan menyediakan nilai transaksi serta tren belanja harian; tersedia ekspor CSV dan PDF.',
                'Log audit membantu meninjau aktor, waktu, sumber, serta ringkasan tindakan pada sistem.',
                'Admin juga dapat melihat transaksi dan catatan kas sesuai izin akunnya.',
              ]}
            />

            <ArticleSection
              id="pengaturan"
              icon={Settings}
              eyebrow="07 · Identitas aplikasi"
              title="Pengaturan pondok dan aplikasi PWA"
              description="Identitas pondok dan aplikasi dapat disesuaikan dari pengaturan admin untuk instalasi tersebut, sehingga nama dan logo tidak perlu ditanam sebagai nilai tetap di kode."
              items={[
                'Atur nama pondok, alamat, informasi kontak, penanggung jawab, zona waktu, dan logo.',
                'Atur nama dan logo aplikasi yang digunakan untuk pengalaman pemasangan PWA.',
                'Admin, kasir, dan wali dapat memasang aplikasi melalui browser yang mendukung instalasi web.',
                'PWA adalah aplikasi web yang dapat dipasang dari browser, bukan berkas APK Android.',
              ]}
            >
              <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#e4eee5] bg-[#f6faf6] p-4">
                <Smartphone size={18} className="mt-0.5 shrink-0 text-[#078264]" />
                <p className="text-xs leading-5 text-[#60736b]">Pemasangan PWA memerlukan HTTPS (kecuali localhost) dan ketersediaan fitur instalasi dari browser atau perangkat yang digunakan.</p>
              </div>
            </ArticleSection>

            <ArticleSection
              id="keamanan"
              icon={ShieldCheck}
              eyebrow="08 · Keamanan"
              title="Akses yang sesuai dan transaksi terjaga"
              description="Keamanan aplikasi dibangun dari pembatasan akses berbasis peran dan pemeriksaan pada backend. Antarmuka hanya menampilkan fungsi yang sesuai dengan akun."
              items={[
                'Admin dan kasir menggunakan verifikasi MFA berbasis authenticator.',
                'Wali hanya dapat melihat anak yang terhubung dengan akunnya.',
                'Kewenangan dan validasi transaksi tetap diperiksa backend, bukan hanya oleh tampilan browser.',
                'Operasi finansial menggunakan perlindungan idempotensi untuk mengurangi risiko transaksi ganda saat pengiriman ulang.',
              ]}
            >
              <div className="mt-5 flex flex-wrap gap-2">
                {[Wallet, CircleDollarSign, Fingerprint].map((Icon, index) => (
                  <span key={index} className="grid h-10 w-10 place-items-center rounded-xl bg-[#f1f7f2] text-[#08745a]">
                    <Icon size={18} />
                  </span>
                ))}
              </div>
            </ArticleSection>

            <div className="mt-7 flex flex-col gap-4 rounded-xl bg-[#f3f8f3] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <h2 className="text-sm font-semibold">Siap membuka ruang kerja?</h2>
                <p className="mt-1 text-xs leading-5 text-[#718179]">Gunakan akun yang diberikan oleh admin pondok.</p>
              </div>
              <Link to="/login" className="btn-primary min-h-10 justify-center px-4 text-xs sm:shrink-0">
                Masuk aplikasi <ArrowRight size={15} />
              </Link>
            </div>
          </article>
        </div>
      </main>

      <footer className="border-t border-[#e3e9e2] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-[10px] text-[#7b8a83] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-6 sm:text-xs lg:px-8">
          <span>© {new Date().getFullYear()} PondokPay · {appName}</span>
          <Link to="/" className="font-semibold text-[#08745a] hover:underline">Kembali ke beranda</Link>
        </div>
      </footer>
    </div>
  );
}
