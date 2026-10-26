import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleCheck,
  CreditCard,
  Fingerprint,
  Pause,
  Package,
  Play,
  Trash2,
  Wallet,
  ShieldCheck,
} from 'lucide-react';
import { api, idempotencyKey } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  AmountLine,
  Avatar,
  Empty,
  ErrorNotice,
  Field,
  formatDate,
  formatMoney,
  Modal,
  MobileLoading,
  StatusBadge,
} from '../../ui.jsx';
import { METHOD_FIELDS, PurchaseForm } from './shared.jsx';
import { CatalogPOS } from './CatalogPOS.jsx';

export function CashierHome({ token }) {
  const navigate = useNavigate();
  const [canteenId, setCanteenId] = useState('');
  const [method, setMethod] = useState('RFID');
  const [lookupValue, setLookupValue] = useState('');
  const [student, setStudent] = useState(null);
  const [saleReceipt, setSaleReceipt] = useState(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saleMode, setSaleMode] = useState('catalog');
  const [cartItems, setCartItems] = useState([]);
  const [step, setStep] = useState('amount');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shiftModal, setShiftModal] = useState(false);
  const [shiftResult, setShiftResult] = useState(null);
  const [cartModal, setCartModal] = useState(false);
  const [heldCartsOpen, setHeldCartsOpen] = useState(false);
  const [cartLabel, setCartLabel] = useState('');
  const [cartMessage, setCartMessage] = useState('');
  const idempotency = useRef(null);
  const field = METHOD_FIELDS[method];
  const {
    data: canteenData,
    loading,
    error: canteenError,
    refresh: refreshCanteens,
  } = useApiData('/kantin', token);
  const canteens = canteenData?.data || [];
  const selectedCanteen =
    canteens.find((item) => String(item.id) === String(canteenId)) || canteens[0];
  const catalogEnabled = Boolean(selectedCanteen?.catalog_enabled);
  const usesCatalog = catalogEnabled && saleMode === 'catalog';
  const catalogPath = selectedCanteen?.catalog_enabled
    ? `/kantin/${selectedCanteen.id}/produk`
    : '/kantin';
  const {
    data: catalogData,
    loading: catalogLoading,
    error: catalogError,
    refresh: refreshCatalog,
    setData: setCatalogData,
  } = useApiData(catalogPath, token);
  const catalogProducts = catalogData?.data || [];
  const shiftPath = selectedCanteen ? `/kantin/${selectedCanteen.id}/giliran/aktif` : '/kantin';
  const {
    data: shiftData,
    loading: shiftLoading,
    error: shiftError,
    refresh: refreshShift,
  } = useApiData(shiftPath, token);
  const currentShift = shiftData?.data;
  const heldCartsPath = selectedCanteen ? `/kantin/${selectedCanteen.id}/keranjang-tertahan` : '/kantin';
  const {
    data: heldCartData,
    loading: heldCartsLoading,
    error: heldCartsError,
    refresh: refreshHeldCarts,
  } = useApiData(heldCartsPath, token);
  const heldCarts = heldCartData?.data || [];

  const openShift = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/kantin/${selectedCanteen.id}/giliran/buka`, {}, token);
      setShiftResult(null);
      refreshShift();
    } catch (err) {
      setError(err.message);
      refreshShift();
    } finally {
      setBusy(false);
    }
  };

  const closeShift = async () => {
    if (!currentShift || cartItems.length || amount || step !== 'amount') return;
    setBusy(true);
    setError('');
    try {
      const result = await api.post(
        `/kantin/${selectedCanteen.id}/giliran/${currentShift.id}/tutup`,
        {},
        token,
      );
      setShiftResult(result.data);
      setShiftModal(false);
      refreshShift();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const holdCart = async (event) => {
    event.preventDefault();
    if (!selectedCanteen || !cartItems.length) return;
    setBusy(true);
    setError('');
    try {
      await api.post(
        `/kantin/${selectedCanteen.id}/keranjang-tertahan`,
        { label: cartLabel, items: cartItems },
        token,
      );
      setCartItems([]);
      setAmount('');
      setDescription('');
      setCartLabel('');
      setCartModal(false);
      setNotice('Keranjang disimpan. Kasir dapat melayani transaksi lain.');
      refreshHeldCarts();
      refreshCatalog();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const restoreHeldCart = async (heldCart) => {
    let items;
    try {
      items = typeof heldCart.items === 'string' ? JSON.parse(heldCart.items) : heldCart.items;
    } catch {
      setError('Isi keranjang tertahan tidak dapat dibaca. Hapus keranjang tersebut dan coba lagi.');
      return;
    }
    if (!Array.isArray(items) || !items.length) {
      setError('Keranjang tertahan kosong atau formatnya tidak valid.');
      return;
    }
    if (cartItems.length || amount || step !== 'amount') {
      setError('Selesaikan atau kosongkan transaksi saat ini sebelum memulihkan keranjang.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const freshCatalog = await api.get(`/kantin/${selectedCanteen.id}/produk`, token);
      const currentProducts = freshCatalog?.data || [];
      setCatalogData(freshCatalog);
      const currentProductMap = new Map(currentProducts.map((product) => [Number(product.id), product]));
      const unavailable = items.find((item) => {
        const product = currentProductMap.get(Number(item.product_id));
        return !product || Number(product.is_active) !== 1 || Number(item.quantity) > Number(product.stok);
      });
      if (unavailable) {
        setError('Stok atau ketersediaan produk berubah. Periksa katalog dan sesuaikan keranjang sebelum memulihkan.');
        return;
      }
      await api.delete(`/kantin/${selectedCanteen.id}/keranjang-tertahan/${heldCart.id}`, token);
      setSaleMode('catalog');
      setCartItems(items);
      const total = items.reduce((sum, item) => {
        const product = currentProductMap.get(Number(item.product_id));
        return sum + Number(product.harga) * Number(item.quantity);
      }, 0);
      setAmount(total.toFixed(2));
      setDescription('Pembelian katalog');
      setStep('amount');
      setCartMessage(`Keranjang "${heldCart.label}" dipulihkan.`);
      setError('');
      refreshHeldCarts();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteHeldCart = async (heldCart) => {
    setBusy(true);
    setError('');
    try {
      await api.delete(`/kantin/${selectedCanteen.id}/keranjang-tertahan/${heldCart.id}`, token);
      refreshHeldCarts();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const lookupStudent = async (event) => {
    event.preventDefault();
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setError('Masukkan nominal belanja yang valid terlebih dahulu.');
      setStep('amount');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setStudent(null);
    setSaleReceipt(null);
    try {
      const result = await api.post(
        `/kantin/${selectedCanteen.id}/santri/lookup`,
        { [field.key]: field.key === 'fingerprint_id' ? Number(lookupValue) : lookupValue.trim() },
        token,
      );
      setStudent(result.data);
      setLookupValue('');
      const value = Number(amount);
      if (value > Number(result.data.saldo)) setError('Saldo santri tidak mencukupi.');
      else if (value > Number(result.data.sisa_limit_harian))
        setError('Nominal melebihi sisa limit belanja harian.');
      setStep('confirm');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!idempotency.current) idempotency.current = idempotencyKey();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.post(
        `/kantin/${selectedCanteen.id}/penjualan`,
        {
          santri_id: student.id,
          ...(usesCatalog
            ? { items: cartItems, jumlah: Number(amount) }
            : { jumlah: Number(amount) }),
          keterangan: description || (usesCatalog ? 'Pembelian katalog' : null),
        },
        token,
        { idempotencyKey: idempotency.current },
      );
      setSaleReceipt(result.data);
      setStudent((previous) =>
        previous
          ? {
              ...previous,
              saldo: result.data.santri?.saldo ?? previous.saldo,
              belanja_hari_ini: Number(previous.belanja_hari_ini || 0) + Number(amount),
              sisa_limit_harian: Math.max(
                0,
                Number(previous.sisa_limit_harian || 0) - Number(amount),
              ).toFixed(2),
            }
          : previous,
      );
      setNotice(result.message || 'Pembayaran berhasil.');
      setStep('success');
      idempotency.current = null;
      if (selectedCanteen?.catalog_enabled) {
        refreshCatalog();
      }
      refreshShift();
    } catch (err) {
      setError(err.message);
      if (err.status === 409)
        setNotice(
          'Transaksi belum berhasil. Periksa kembali saldo, limit harian, atau status kantin sebelum melanjutkan.',
        );
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStudent(null);
    setSaleReceipt(null);
    setAmount('');
    setDescription('');
    setCartItems([]);
    setStep('amount');
    setError('');
    setNotice('');
    idempotency.current = null;
    setLookupValue('');
  };
  const changeCanteen = (nextId) => {
    setCanteenId(nextId);
    setSaleMode(
      canteens.find((item) => String(item.id) === String(nextId))?.catalog_enabled
        ? 'catalog'
        : 'manual',
    );
    setStudent(null);
    setSaleReceipt(null);
    setAmount('');
    setDescription('');
    setCartItems([]);
    setLookupValue('');
    setStep('amount');
    setError('');
    setNotice('');
    idempotency.current = null;
  };
  const changeCartQuantity = (product, difference) => {
    const current = cartItems.find((item) => Number(item.product_id) === Number(product.id));
    const nextQuantity = (current?.quantity || 0) + difference;
    if (nextQuantity > Number(product.stok)) return;
    const nextCart = current
      ? cartItems.map((item) => Number(item.product_id) === Number(product.id)
        ? { ...item, quantity: nextQuantity }
        : item).filter((item) => item.quantity > 0)
      : [...cartItems, { product_id: Number(product.id), quantity: 1 }];
    const productById = new Map(catalogProducts.map((item) => [Number(item.id), item]));
    const nextAmount = nextCart.reduce((sum, item) => {
      const selected = productById.get(Number(item.product_id));
      return sum + Number(selected?.harga || 0) * item.quantity;
    }, 0);
    setCartItems(nextCart);
    setAmount(nextAmount.toFixed(2));
  };

  if (loading) return <MobileLoading />;
  if (canteenError)
    return (
      <>
        <ErrorNotice error={canteenError} onRetry={refreshCanteens} />
        <Empty
          title="Kantin tidak tersedia"
          description="Hubungi admin untuk memastikan akun kasir ditugaskan ke kantin aktif."
        />
      </>
    );
  if (!canteens.length)
    return (
      <Empty
        title="Belum ada kantin aktif"
        description="Akun kasir belum ditugaskan ke kantin aktif."
      />
    );
  if (shiftLoading) return <MobileLoading text="Memeriksa giliran kasir..." />;
  if (shiftError) return <ErrorNotice error={shiftError} onRetry={refreshShift} />;
  if (!currentShift) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        {shiftResult && (
          <Alert type="success">
            Giliran ditutup. Penjualan {formatMoney(shiftResult.sales_total)}, refund {formatMoney(shiftResult.refunds_total)}, bersih {formatMoney(shiftResult.net_total)}.
          </Alert>
        )}
        <section className="card overflow-hidden">
          <div className="bg-pondok-700 px-5 py-6 text-white sm:px-7">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><Wallet size={22} /></div>
            <h1 className="mt-4 text-xl font-semibold">Mulai giliran kasir</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              Buka giliran sebelum melayani transaksi. Penjualan dan refund akan masuk ke rekap giliran ini; pembayaran tetap menggunakan saldo santri.
            </p>
          </div>
          <div className="p-5 sm:p-7">
            <p className="font-semibold">{selectedCanteen.nama}</p>
            <p className="mt-1 text-xs text-muted">Setelah giliran ditutup, kasir perlu membuka giliran baru untuk bertransaksi kembali.</p>
            {error && <Alert type="error" className="mt-4">{error}</Alert>}
            <button type="button" className="btn-primary mt-5 min-h-12 w-full" disabled={busy} onClick={openShift}>
              <Play size={17} />{busy ? 'Membuka giliran...' : 'Buka giliran kasir'}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`mx-auto w-full ${usesCatalog ? 'max-w-[1180px]' : 'max-w-3xl'} ${usesCatalog && step === 'amount' && cartItems.length ? 'pb-32 lg:pb-0' : ''}`}>
      {step === 'amount' && (
        <section className="card mb-5 flex flex-col gap-3 overflow-hidden border-pondok-100 bg-gradient-to-r from-white to-pondok-50/50 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid h-2.5 w-2.5 place-items-center rounded-full bg-emerald-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              </span>
              <p className="text-sm font-semibold">Giliran #{currentShift.id} aktif</p>
              <span className="hidden text-xs text-muted sm:inline">{formatDate(currentShift.opened_at, true)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {selectedCanteen.nama} <span className="mx-1 text-line">·</span>
              {currentShift.sales_count || 0} penjualan <span className="mx-1 text-line">·</span>
              {currentShift.refunds_count || 0} refund <span className="mx-1 text-line">·</span>
              Bersih <strong className="font-semibold text-ink">{formatMoney(currentShift.net_total || 0)}</strong>
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary w-full !min-h-10 !py-2 text-xs sm:w-auto"
            disabled={busy || Boolean(cartItems.length) || Boolean(amount)}
            onClick={() => setShiftModal(true)}
          >
            Tutup giliran
          </button>
        </section>
      )}
      {cartMessage && <Alert type="success" className="mb-4">{cartMessage}</Alert>}
      {error && step === 'amount' && <Alert type="error" className="mb-4">{error}</Alert>}
      {step !== 'amount' && step !== 'success' && (
        <button
          className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-pondok-700 transition hover:bg-pondok-50"
          onClick={() => {
            setError('');
            if (selectedCanteen?.catalog_enabled) refreshCatalog();
            setStep(step === 'confirm' ? 'credential' : 'amount');
          }}
        >
          <ArrowLeft size={18} />
          {step === 'confirm'
            ? 'Periksa kredensial lagi'
            : usesCatalog ? 'Ubah keranjang' : 'Ubah nominal'}
        </button>
      )}
      {step === 'amount' && (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {usesCatalog ? 'Kasir produk' : 'Catat nominal'}
              </h1>
              <p className="mt-1 text-xs text-muted sm:text-sm">
                {usesCatalog ? 'Pilih belanjaan, verifikasi santri, lalu konfirmasi pembayaran.' : 'Catat nominal belanja lalu verifikasi santri.'}
              </p>
            </div>
            <label className="relative block w-full sm:max-w-[240px]">
              <select
                className="field !min-h-10 appearance-none !py-2 pr-9 text-xs font-semibold"
                value={selectedCanteen?.id || ''}
                onChange={(e) => changeCanteen(e.target.value)}
              >
                {canteens.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nama}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={18}
                className="pointer-events-none absolute right-3 top-2.5 text-muted"
              />
            </label>
          </div>
          {catalogEnabled && (
            <div className="mb-3 flex rounded-xl border border-line bg-white p-1" aria-label="Mode transaksi">
              {[
                ['catalog', 'Kasir produk'],
                ['manual', 'Catat nominal'],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={`min-h-9 flex-1 rounded-lg px-2 text-xs font-semibold transition ${saleMode === mode ? 'bg-pondok-700 text-white' : 'text-muted hover:bg-canvas'}`}
                  aria-pressed={saleMode === mode}
                  onClick={() => {
                    setSaleMode(mode);
                    setAmount('');
                    setDescription('');
                    setCartItems([]);
                    setError('');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {usesCatalog ? (
            <section className="mt-3">
              {catalogError ? (
                <ErrorNotice error={catalogError} onRetry={refreshCatalog} />
              ) : catalogLoading ? (
                <MobileLoading text="Memuat katalog..." />
              ) : (
                <>
                  <section className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white p-3">
                    <p className="text-xs text-muted">{cartItems.reduce((sum, item) => sum + Number(item.quantity), 0)} item di keranjang saat ini</p>
                    <div className="flex gap-2">
                      <button type="button" className="btn-secondary !min-h-9 !px-3 !py-1.5 text-xs" disabled={!cartItems.length || busy} onClick={() => { setCartLabel(`Antrean ${heldCarts.length + 1}`); setCartModal(true); }}>
                        <Pause size={15} />Tahan keranjang
                      </button>
                      <button type="button" className="btn-secondary !min-h-9 !px-3 !py-1.5 text-xs" onClick={() => setHeldCartsOpen((open) => !open)} aria-expanded={heldCartsOpen}>
                        <Package size={15} />Tertahan ({heldCarts.length})
                      </button>
                    </div>
                  </section>
                  {heldCartsOpen && (
                    <section className="mb-3 rounded-xl border border-line bg-white p-3">
                      <h2 className="text-sm font-semibold">Keranjang tertahan</h2>
                      {heldCartsError && <ErrorNotice error={heldCartsError} onRetry={refreshHeldCarts} />}
                      {heldCartsLoading ? <MobileLoading text="Memuat keranjang..." /> : !heldCarts.length ? (
                        <p className="mt-2 text-xs text-muted">Belum ada keranjang tertahan.</p>
                      ) : (
                        <div className="mt-2 divide-y divide-line">
                          {heldCarts.map((heldCart) => (
                            <div key={heldCart.id} className="flex items-center gap-2 py-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold">{heldCart.label}</p>
                                <p className="mt-0.5 text-[10px] text-muted">{heldCart.cashier_username} · {formatDate(heldCart.updated_at, true)}</p>
                              </div>
                              <button type="button" className="btn-primary !min-h-9 !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => restoreHeldCart(heldCart)}>Pulihkan</button>
                              <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-red-600 hover:bg-red-50" aria-label={`Hapus ${heldCart.label}`} disabled={busy} onClick={() => deleteHeldCart(heldCart)}><Trash2 size={15} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                  <CatalogPOS
                    products={catalogProducts}
                    cartItems={cartItems}
                    setCartItems={setCartItems}
                    onCheckout={() => {
                      const productsById = new Map(catalogProducts.map((product) => [Number(product.id), product]));
                      const total = cartItems.reduce((sum, item) => {
                        const product = productsById.get(Number(item.product_id));
                        return sum + Number(product?.harga || 0) * item.quantity;
                      }, 0);
                      if (!cartItems.length || total <= 0) return;
                      setAmount(total.toFixed(2));
                      setDescription('Pembelian katalog');
                      setError('');
                      setStep('credential');
                    }}
                  />
                </>
              )}
            </section>
          ) : (
            <PurchaseForm
              amount={amount}
              setAmount={setAmount}
              description={description}
              setDescription={setDescription}
              error={error}
              onSubmit={(event) => {
                event.preventDefault();
                const value = Number(amount);
                if (!Number.isFinite(value) || value <= 0) {
                  setError('Masukkan nominal belanja yang valid.');
                  return;
                }
                setError('');
                setStep('credential');
              }}
            />
          )}
        </>
      )}
      {step === 'credential' && (
        <section className="card p-4 sm:p-6">
          <div className="mb-5">
            <StatusBadge>Langkah 2 dari 3</StatusBadge>
            <h1 className="mt-3 text-xl font-semibold">Verifikasi santri</h1>
            <p className="mt-1 text-sm text-muted">
              Nominal belanja <strong className="text-ink">{formatMoney(amount)}</strong>. Pindai
              kartu atau sidik jari.
            </p>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-canvas p-1.5">
            {Object.keys(METHOD_FIELDS).map((item) => (
              <button
                type="button"
                key={item}
                className={`flex min-h-14 items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold transition ${method === item ? 'bg-pondok-700 text-white shadow-sm' : 'text-muted hover:bg-white'}`}
                onClick={() => {
                  setMethod(item);
                  setLookupValue('');
                  setError('');
                }}
              >
                {item === 'RFID' ? <CreditCard size={19} /> : <Fingerprint size={19} />}
                {item === 'RFID' ? 'Kartu RFID' : 'Sidik jari'}
              </button>
            ))}
          </div>
          <form className="space-y-4" onSubmit={lookupStudent}>
            <label className="block">
              <span className="label">{field.label}</span>
              <input
                className="field min-h-14 text-lg tracking-wider"
                type="password"
                inputMode={field.inputMode}
                autoComplete="new-password"
                autoCapitalize="off"
                spellCheck="false"
                maxLength={field.key === 'rfid_uid' ? 50 : undefined}
                pattern={field.key === 'fingerprint_id' ? '[0-9]*' : undefined}
                placeholder={field.placeholder}
                value={lookupValue}
                onChange={(event) =>
                  setLookupValue(
                    field.key === 'fingerprint_id'
                      ? event.target.value.replace(/\D/g, '')
                      : event.target.value,
                  )
                }
                required
              />
            </label>
            <p className="flex items-start gap-2 rounded-xl bg-pondok-50 p-3 text-xs leading-relaxed text-pondok-700">
              <ShieldCheck size={16} className="mt-0.5 shrink-0" />
              Nilai RFID dan ID sidik jari disamarkan di layar dan hanya dikirim untuk verifikasi.
            </p>
            {error && <Alert type="error">{error}</Alert>}
            <button
              className="btn-primary min-h-12 w-full"
              disabled={busy || !selectedCanteen || selectedCanteen.status !== 'active'}
            >
              {busy ? (
                'Memverifikasi...'
              ) : (
                <>
                  <ShieldCheck size={18} />
                  Verifikasi santri
                </>
              )}
            </button>
          </form>
        </section>
      )}
      {step === 'confirm' && student && (
        <div className="mx-auto max-w-[760px] pb-28 lg:pb-0">
          <div className="mb-4">
            <h1 className="text-xl font-semibold">Konfirmasi belanja</h1>
            <p className="mt-1 text-xs text-muted">{selectedCanteen?.nama} · {usesCatalog ? `${cartItems.reduce((sum, item) => sum + item.quantity, 0)} item` : 'Transaksi nominal'}</p>
          </div>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold text-pondok-700">
            <span className="rounded-full bg-[#e8f4ed] px-2.5 py-1">1 · Belanja</span>
            <span className="text-muted">›</span>
            <span className="rounded-full bg-[#e8f4ed] px-2.5 py-1">2 · Konfirmasi</span>
          </div>
          <div className="card p-3.5 sm:p-5">
            {usesCatalog && (
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Keranjang</p>
                  <button type="button" className="text-xs font-semibold text-pondok-700" onClick={() => setStep('amount')}>Ubah belanja</button>
                </div>
                <div className="divide-y divide-line">
                  {cartItems.map((item) => {
                    const product = catalogProducts.find((row) => Number(row.id) === Number(item.product_id));
                    if (!product) return null;
                    return (
                      <div key={item.product_id} className="flex items-center gap-2 py-2.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e8f4ed] text-[10px] font-semibold text-pondok-800">
                          {product.nama.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold">{product.nama}</p>
                          <p className="text-[10px] text-muted">{item.quantity} × {formatMoney(product.harga)}</p>
                        </div>
                        <div className="flex items-center gap-1 rounded-lg bg-canvas p-1">
                          <button type="button" className="grid h-6 w-6 place-items-center rounded-md text-muted" aria-label={`Kurangi ${product.nama}`} onClick={() => changeCartQuantity(product, -1)}>−</button>
                          <span className="w-4 text-center text-xs">{item.quantity}</span>
                          <button type="button" className="grid h-6 w-6 place-items-center rounded-md text-pondok-700 disabled:opacity-40" aria-label={`Tambah ${product.nama}`} disabled={Number(product.stok) <= item.quantity} onClick={() => changeCartQuantity(product, 1)}>+</button>
                        </div>
                        <span className="w-[72px] text-right text-xs font-semibold">{formatMoney(Number(product.harga) * item.quantity)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between border-t border-line pt-3 text-xs">
                  <span className="text-muted">Total · {cartItems.reduce((sum, item) => sum + item.quantity, 0)} item</span>
                  <span className="font-semibold">{formatMoney(amount)}</span>
                </div>
              </div>
            )}
            {!usesCatalog && (
              <div className="mb-4 flex items-center justify-between">
                <div><p className="text-xs text-muted">Nominal belanja</p><p className="mt-1 text-2xl font-semibold">{formatMoney(amount)}</p></div>
                <button type="button" className="text-xs font-semibold text-pondok-700" onClick={() => setStep('amount')}>Ubah nominal</button>
              </div>
            )}
            <div className="rounded-xl border border-[#cfe8d9] bg-[#eaf5ef] p-3">
            <div className="flex items-center gap-3">
              <Avatar name={student.nama_lengkap} className="bg-[#d8eddf] text-pondok-800" />
              <div className="min-w-0">
                <p className="font-semibold">{student.nama_lengkap}</p>
                <p className="text-xs text-muted">{student.nis} · {student.asrama || 'Santri'}</p>
              </div>
              <StatusBadge>Terverifikasi</StatusBadge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#cfe8d9] pt-3">
              <div><p className="text-[10px] text-muted">Saldo santri</p><p className="mt-0.5 text-sm font-semibold">{formatMoney(student.saldo)}</p></div>
              <div><p className="text-[10px] text-muted">Sisa limit harian</p><p className="mt-0.5 text-sm font-semibold">{formatMoney(student.sisa_limit_harian)}</p></div>
            </div>
            <p className="mt-2 text-[10px] text-muted">Limit {formatMoney(student.limit_harian)} · Terpakai hari ini {formatMoney(student.belanja_hari_ini)}</p>
            </div>
          </div>
          {error && (
            <Alert type="error" className="mt-4">
              {error}
            </Alert>
          )}
          {notice && (
            <Alert type="warning" className="mt-4">
              {notice}
            </Alert>
          )}
          <section className="card mt-3 p-3.5 sm:p-4">
            <h2 className="text-sm font-semibold">Setelah pembayaran</h2>
            <AmountLine label="Saldo setelah bayar" amount={formatMoney(Number(student.saldo) - Number(amount))} positive />
            <AmountLine label="Sisa limit harian" amount={formatMoney(Math.max(0, Number(student.sisa_limit_harian) - Number(amount)))} positive />
            {Number(amount) > Number(student.saldo) || Number(amount) > Number(student.sisa_limit_harian)
              ? <Alert type="error" className="mt-2">Saldo atau sisa limit harian tidak mencukupi.</Alert>
              : <Alert className="mt-2"><ShieldCheck size={15} />Saldo dan sisa limit mencukupi untuk belanja ini.</Alert>}
          </section>
          <p className="mt-3 text-[10px] leading-relaxed text-muted">Jika harga atau stok berubah, pilihan tetap tersimpan. Tinjau perubahan dan konfirmasi ulang. Jika koneksi terputus, ulangi transaksi yang sama dan jangan mulai transaksi baru.</p>
          <div className="fixed inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-white/95 px-4 py-2 shadow-[0_-5px_18px_rgba(24,63,54,0.07)] backdrop-blur-xl lg:static lg:mt-4 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            <div className="mx-auto flex max-w-[760px] items-center justify-between text-xs">
              <span className="text-muted">Total pembayaran</span><span className="font-semibold">{formatMoney(amount)}</span>
            </div>
            <button
              className="btn-primary mx-auto mt-2 min-h-11 w-full max-w-[760px] !py-2.5"
              disabled={busy || Number(amount) > Number(student.saldo) || Number(amount) > Number(student.sisa_limit_harian)}
              onClick={pay}
            >
              <ShieldCheck size={16} />{busy ? 'Memproses transaksi...' : `Bayar ${formatMoney(amount)}`}
            </button>
            <p className="mt-1.5 text-center text-[10px] text-muted">Dipotong dari saldo {student.nama_lengkap}</p>
          </div>
        </div>
      )}
      {step === 'success' && student && (
        <div className="mx-auto max-w-[650px] pb-4 pt-2 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-[#cfe8d9] bg-[#eaf5ef] text-pondok-700">
            <CircleCheck size={34} strokeWidth={1.6} />
          </div>
          <h2 className="mt-3 text-xl font-semibold">Transaksi berhasil</h2>
          <p className="mt-1 text-xs text-muted">Belanja tercatat. Saldo santri telah dipotong.</p>
          <div className="card mt-4 p-4 text-left sm:p-5">
            <div className="border-b border-line pb-3 text-center">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Total pembayaran</p>
              <p className="mt-1 text-3xl font-semibold">{formatMoney(amount)}</p>
              <p className="mt-1 text-[10px] text-muted">#{saleReceipt?.transaksi_id || saleReceipt?.id || '—'} · {formatDate(new Date(), true)}</p>
            </div>
            <div className="flex items-center gap-3 border-b border-line py-3">
              <Avatar name={student.nama_lengkap} />
              <div className="min-w-0">
                <p className="font-semibold">{student.nama_lengkap}</p>
                <p className="text-xs text-muted">{student.nis} · {student.asrama || 'Santri'}</p>
              </div>
            </div>
            {usesCatalog && (
              <div className="border-b border-line py-2">
                {cartItems.map((item) => {
                  const product = catalogProducts.find((row) => Number(row.id) === Number(item.product_id));
                  if (!product) return null;
                  return (
                    <div key={item.product_id} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <span>{product.nama} <span className="text-muted">× {item.quantity}</span></span>
                      <span className="font-semibold">{formatMoney(Number(product.harga) * item.quantity)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="py-2">
              <AmountLine label="Total item" amount={`${usesCatalog ? cartItems.reduce((sum, item) => sum + item.quantity, 0) : 1}`} />
              <AmountLine label="Pembayaran" amount="Saldo santri" />
              <AmountLine label="Saldo santri saat ini" amount={formatMoney(student.saldo)} positive />
              <AmountLine label="Sisa limit harian" amount={formatMoney(student.sisa_limit_harian)} positive />
              <AmountLine label="Kasir" amount={JSON.parse(sessionStorage.getItem('pondokpay.user') || '{}').username || 'Kasir'} />
              <AmountLine label="Saldo akhir kantin" amount={formatMoney(saleReceipt?.kantin?.saldo ?? selectedCanteen?.saldo)} />
              {description && <AmountLine label="Keterangan" amount={description} />}
            </div>
          </div>
          {usesCatalog && <Alert className="mt-3 text-left"><Package size={15} />Stok produk terkait telah diperbarui.</Alert>}
          <button className="btn-primary mt-4 min-h-11 w-full !py-2.5" onClick={reset}>
            <Check size={18} />
            Transaksi berikutnya
          </button>
          <button className="btn-secondary mt-2 min-h-10 w-full !py-2" onClick={() => navigate('/kasir/history')}>
            Lihat riwayat kantin
          </button>
        </div>
      )}
      {shiftModal && currentShift && (
        <Modal title="Tutup giliran kasir?" onClose={() => setShiftModal(false)}>
          <div className="space-y-3">
            <Alert type="warning">
              Setelah ditutup, penjualan baru tidak dapat dicatat sampai giliran berikutnya dibuka. Rekap ini menghitung pembayaran dari saldo santri, bukan uang tunai di laci.
            </Alert>
            <div className="rounded-xl bg-canvas p-4">
              <AmountLine label="Penjualan" amount={formatMoney(currentShift.sales_total || 0)} />
              <AmountLine label="Refund" amount={formatMoney(currentShift.refunds_total || 0)} />
              <AmountLine label="Total bersih" amount={formatMoney(currentShift.net_total || 0)} positive />
              <AmountLine label="Jumlah transaksi" amount={String(currentShift.sales_count || 0)} />
            </div>
            {error && <Alert type="error">{error}</Alert>}
            <div className="flex gap-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => setShiftModal(false)}>Kembali</button>
              <button type="button" className="btn-primary flex-1" disabled={busy} onClick={closeShift}>{busy ? 'Menutup...' : 'Tutup giliran'}</button>
            </div>
          </div>
        </Modal>
      )}
      {cartModal && (
        <Modal title="Tahan keranjang" onClose={() => setCartModal(false)}>
          <form className="space-y-3" onSubmit={holdCart}>
            <Alert>
              Keranjang akan tersimpan di server untuk akun kasir ini. Harga dan stok akan diperiksa ulang saat keranjang dipulihkan.
            </Alert>
            <Field label="Nama / nomor antrean" value={cartLabel} onChange={(event) => setCartLabel(event.target.value)} maxLength={80} required />
            {error && <Alert type="error">{error}</Alert>}
            <button className="btn-primary w-full" disabled={busy || !cartItems.length}>
              {busy ? 'Menyimpan...' : 'Simpan dan kosongkan keranjang'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
