import { useState } from 'react';
import { Clock3, Package, Pencil, Plus, Search } from 'lucide-react';
import { api } from '../../api.js';
import { useApiData } from '../../hooks.js';
import {
  Alert,
  Empty,
  ErrorNotice,
  Field,
  formatDate,
  formatMoney,
  Loading,
  Modal,
  PageHeader,
  StatusBadge,
} from '../../ui.jsx';

const emptyForm = {
  nama: '',
  kategori: 'Umum',
  sku: '',
  barcode: '',
  harga: '',
  stok: '0',
  stok_minimum: '5',
  is_active: true,
};

const isActiveProduct = (product) => product.is_active === true || Number(product.is_active) === 1;

export function CashierCatalogManagement({ token }) {
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const {
    data: canteenData,
    loading: canteenLoading,
    error: canteenError,
    refresh: refreshCanteens,
  } = useApiData('/kantin', token);
  const canteens = canteenData?.data || [];
  const canteen = canteens.find((item) => String(item.id) === String(selectedId)) || canteens[0];
  const id = canteen?.id;
  const {
    data: productData,
    loading: productsLoading,
    error: productError,
    refresh: refreshProducts,
  } = useApiData(id ? `/kantin/${id}/produk` : '/kantin', token);
  const { data: movementData, refresh: refreshMovements } = useApiData(
    id ? `/kantin/${id}/pergerakan-stok` : '/kantin',
    token,
  );
  const products = productData?.data || [];
  const movements = movementData?.data || [];
  const filteredProducts = products.filter((product) => {
    const searchMatch = `${product.nama} ${product.kategori} ${product.sku || ''} ${product.barcode || ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    const active = isActiveProduct(product);
    const lowStock = active && Number(product.stok) <= Number(product.stok_minimum);
    return searchMatch && (
      statusFilter === 'all' ||
      (statusFilter === 'active' && active) ||
      (statusFilter === 'low' && lowStock) ||
      (statusFilter === 'inactive' && !active)
    );
  });

  const openForm = (product = null) => {
    setEditing(product);
    setForm(product ? {
      nama: product.nama,
      kategori: product.kategori,
      sku: product.sku || '',
      barcode: product.barcode || '',
      harga: String(product.harga),
      stok: String(product.stok),
      stok_minimum: String(product.stok_minimum),
      is_active: Boolean(product.is_active),
    } : emptyForm);
    setErrorMessage('');
    setModal(true);
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      const payload = {
        ...form,
        harga: Number(form.harga),
        stok: Number(form.stok),
        stok_minimum: Number(form.stok_minimum),
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
      };
      if (editing) {
        await api.patch(`/kantin/${id}/produk/${editing.id}`, payload, token);
        setNotice('Produk berhasil diperbarui.');
      } else {
        await api.post(`/kantin/${id}/produk`, payload, token);
        setNotice('Produk berhasil ditambahkan.');
      }
      setModal(false);
      refreshProducts();
      refreshMovements();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleCatalog = async () => {
    setBusy(true);
    setErrorMessage('');
    try {
      const result = await api.patch(
        `/kantin/${id}/katalog`,
        { catalog_enabled: !canteen.catalog_enabled },
        token,
      );
      setNotice(result.message);
      refreshCanteens();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleProduct = async (product) => {
    setBusy(true);
    setErrorMessage('');
    try {
      await api.patch(`/kantin/${id}/produk/${product.id}`, {
        is_active: !product.is_active,
      }, token);
      setNotice(product.is_active ? 'Produk dinonaktifkan.' : 'Produk diaktifkan kembali.');
      refreshProducts();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (canteenLoading || (canteen && productsLoading)) return <Loading />;

  return (
    <>
      <PageHeader
        title="Produk & stok"
        subtitle={canteen ? `Kelola katalog, harga, dan ketersediaan produk kantin.` : 'Pilih kantin yang ditugaskan untuk mengelola katalog.'}
        action={canteen && <button type="button" className="btn-primary !min-h-10 !py-2" onClick={() => openForm()}><Plus size={16} />Tambah produk</button>}
      />
      <ErrorNotice error={canteenError || productError} onRetry={() => {
        refreshCanteens();
        refreshProducts();
      }} />
      {errorMessage && <Alert type="error" className="mb-4">{errorMessage}</Alert>}
      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}
      {!canteen ? (
        <Empty title="Belum ada kantin ditugaskan" description="Hubungi admin untuk mengatur penugasan akun kasir." />
      ) : (
        <>
          {canteens.length > 1 && (
            <label className="mb-4 block max-w-sm">
              <span className="label">Kantin yang dikelola</span>
              <select
                className="field"
                value={canteen.id}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {canteens.map((item) => <option key={item.id} value={item.id}>{item.nama}</option>)}
              </select>
            </label>
          )}
          <section className="card mb-4 flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pondok-50 text-pondok-600">
                <Package size={20} />
              </span>
              <div>
                <p className="font-semibold">Gunakan katalog saat kasir bertransaksi</p>
                <p className="mt-1 text-xs text-muted">
                  {canteen.catalog_enabled
                    ? 'Kasir memilih produk; harga dan stok divalidasi otomatis.'
                    : 'Kantin masih memakai input nominal manual.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(canteen.catalog_enabled)}
              disabled={busy}
              onClick={toggleCatalog}
              className={`relative h-8 w-14 shrink-0 rounded-full transition ${canteen.catalog_enabled ? 'bg-pondok-700' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${canteen.catalog_enabled ? 'left-7' : 'left-1'}`} />
            </button>
          </section>
          <div className="mb-3 flex flex-col gap-2.5 sm:flex-row">
            <label className="relative flex-1">
              <Search size={16} className="absolute left-3 top-3 text-muted" />
              <input
                className="field !min-h-10 !py-2 pl-9 text-xs"
                placeholder="Cari nama, kategori, SKU, atau barcode"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          <div className="mb-3 flex gap-1.5 overflow-x-auto">
            {[
              ['all', `Semua (${products.length})`],
              ['active', `Aktif (${products.filter(isActiveProduct).length})`],
              ['low', `Stok menipis (${products.filter((item) => isActiveProduct(item) && Number(item.stok) <= Number(item.stok_minimum)).length})`],
              ['inactive', `Nonaktif (${products.filter((item) => !isActiveProduct(item)).length})`],
            ].map(([value, label]) => (
              <button key={value} type="button" className={`min-h-8 shrink-0 rounded-lg border px-2.5 text-[11px] font-semibold ${statusFilter === value ? 'border-pondok-700 bg-pondok-700 text-white' : 'border-line bg-white text-muted'}`} onClick={() => setStatusFilter(value)}>{label}</button>
            ))}
          </div>
          {!filteredProducts.length ? (
            <div className="card">
              <Empty
                title={products.length && query.trim() ? 'Produk tidak ditemukan' : products.length ? 'Tidak ada produk di filter ini' : 'Produk belum tersedia'}
                description={products.length ? 'Ubah pencarian atau pilih filter lain.' : 'Tambahkan produk beserta harga dan stok untuk memulai katalog.'}
              />
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-xl border border-line bg-white lg:block">
                <div className="grid grid-cols-[minmax(0,1fr)_105px_88px_90px_38px] bg-[#f5f5f1] px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-muted">
                  <span>Produk / SKU</span><span>Harga</span><span>Stok</span><span>Status</span><span />
                </div>
                {filteredProducts.map((product) => (
                  <div key={product.id} className="grid grid-cols-[minmax(0,1fr)_105px_88px_90px_38px] items-center border-t border-line px-3 py-2.5 text-xs hover:bg-[#f7faf7]">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{product.nama}</p>
                      <p className="truncate text-[10px] text-muted">{product.sku || product.barcode || 'Tanpa SKU'} · {product.kategori}</p>
                    </div>
                    <span className="font-semibold">{formatMoney(product.harga)}</span>
                    <span className={Number(product.stok) <= Number(product.stok_minimum) && isActiveProduct(product) ? 'font-semibold text-amber-700' : ''}>{product.stok} unit <small className="block text-[9px] font-normal text-muted">Min. {product.stok_minimum}</small></span>
                    <StatusBadge tone={!isActiveProduct(product) ? 'gray' : Number(product.stok) <= Number(product.stok_minimum) ? 'amber' : 'green'}>{!isActiveProduct(product) ? 'Nonaktif' : Number(product.stok) <= Number(product.stok_minimum) ? 'Menipis' : 'Aktif'}</StatusBadge>
                    <button type="button" aria-label={`Ubah ${product.nama}`} className="grid h-8 w-8 place-items-center rounded-lg text-pondok-700 hover:bg-pondok-50" onClick={() => openForm(product)}><Pencil size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:hidden">
                {filteredProducts.map((product) => (
                  <article key={product.id} className="rounded-xl border border-line bg-white p-3">
                    <div className="flex items-start gap-2.5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e8f4ed] text-pondok-700"><Package size={17} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="min-w-0"><p className="truncate text-xs font-semibold">{product.nama}</p><p className="truncate text-[10px] text-muted">{product.kategori} · {product.sku || product.barcode || 'Tanpa SKU'}</p></div>
                          <StatusBadge tone={!isActiveProduct(product) ? 'gray' : Number(product.stok) <= Number(product.stok_minimum) ? 'amber' : 'green'}>{!isActiveProduct(product) ? 'Nonaktif' : Number(product.stok) <= Number(product.stok_minimum) ? 'Menipis' : 'Aktif'}</StatusBadge>
                        </div>
                        <div className="mt-2 flex items-end justify-between"><div><p className="text-sm font-semibold">{formatMoney(product.harga)}</p><p className="text-[10px] text-muted">Stok {product.stok} · Min {product.stok_minimum}</p></div><button type="button" className="grid h-8 w-8 place-items-center rounded-lg bg-[#e8f4ed] text-pondok-700" onClick={() => openForm(product)} aria-label={`Ubah ${product.nama}`}><Pencil size={14} /></button></div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
          <section className="card mt-6 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 size={17} className="text-pondok-600" />
              <h2 className="font-semibold">Pergerakan stok terakhir</h2>
            </div>
            {!movements.length ? (
              <p className="text-sm text-muted">Belum ada penyesuaian atau penjualan stok.</p>
            ) : (
              <div className="divide-y divide-line">
                {movements.slice(0, 8).map((movement) => (
                  <div key={movement.id} className="flex items-center gap-3 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{movement.nama_produk}</p>
                      <p className="text-xs text-muted">{movement.note || movement.movement_type} · {formatDate(movement.created_at, true)}</p>
                    </div>
                    <span className={Number(movement.quantity_change) < 0 ? 'font-semibold text-red-600' : 'font-semibold text-emerald-700'}>
                      {Number(movement.quantity_change) > 0 ? '+' : ''}{movement.quantity_change}
                    </span>
                    <span className="w-20 text-right text-xs text-muted">Stok {movement.stock_after}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      {modal && (
        <Modal title={editing ? 'Ubah produk' : 'Tambah produk'} onClose={() => setModal(false)}>
          <form className="space-y-3" onSubmit={saveProduct}>
            <Field label="Nama produk" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} maxLength={120} required />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Kategori" value={form.kategori} onChange={(e) => setForm({ ...form, kategori: e.target.value })} maxLength={80} />
              <Field label="Harga (Rp)" type="number" min="0.01" step="0.01" value={form.harga} onChange={(e) => setForm({ ...form, harga: e.target.value })} required />
              <Field label="SKU (opsional)" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} maxLength={40} />
              <Field label="Barcode (opsional)" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} maxLength={80} />
              <Field label="Stok saat ini" type="number" min="0" step="1" value={form.stok} onChange={(e) => setForm({ ...form, stok: e.target.value })} required />
              <Field label="Peringatan stok rendah" type="number" min="0" step="1" value={form.stok_minimum} onChange={(e) => setForm({ ...form, stok_minimum: e.target.value })} required />
            </div>
            {errorMessage && <Alert type="error">{errorMessage}</Alert>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'Menyimpan...' : editing ? 'Simpan perubahan' : 'Tambah produk'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
