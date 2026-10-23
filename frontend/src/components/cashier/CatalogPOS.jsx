import { useMemo, useState } from 'react';
import { Barcode, ChevronDown, Cookie, CupSoda, Minus, Package, Plus, Search, ShoppingBasket, Sandwich, Utensils } from 'lucide-react';
import { Empty, formatMoney } from '../../ui.jsx';

const categoryStyle = {
  Minuman: 'bg-[#e5f1eb]',
  Makanan: 'bg-[#f5ecd9]',
  Camilan: 'bg-[#eee9f4]',
};
const productIcons = [CupSoda, Sandwich, Cookie, Utensils, Package];

export function CatalogPOS({ products, cartItems, setCartItems, onCheckout }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Semua');
  const [scanMessage, setScanMessage] = useState('');
  const [showAll, setShowAll] = useState(false);
  const productMap = useMemo(
    () => new Map(products.map((product) => [Number(product.id), product])),
    [products],
  );
  const categories = [
    'Semua',
    ...new Set(products.filter((item) => item.is_active).map((item) => item.kategori)),
  ];
  const filtered = products.filter((product) => {
    if (!product.is_active || (category !== 'Semua' && product.kategori !== category)) return false;
    return `${product.nama} ${product.kategori} ${product.sku || ''} ${product.barcode || ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  });
  const visibleProducts = showAll || query ? filtered : filtered.slice(0, 4);
  const cart = cartItems
    .map((item) => ({ ...item, product: productMap.get(Number(item.product_id)) }))
    .filter((item) => item.product);
  const total = cart.reduce((sum, item) => sum + Number(item.product.harga) * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const quantityFor = (productId) =>
    cartItems.find((item) => Number(item.product_id) === Number(productId))?.quantity || 0;

  const changeQuantity = (product, difference) => {
    setCartItems((current) => {
      const existing = current.find((item) => Number(item.product_id) === Number(product.id));
      const quantity = (existing?.quantity || 0) + difference;
      if (quantity > Number(product.stok)) return current;
      if (!existing && difference > 0) {
        return [...current, { product_id: Number(product.id), quantity: 1 }];
      }
      return current
        .map((item) => Number(item.product_id) === Number(product.id)
          ? { ...item, quantity }
          : item)
        .filter((item) => item.quantity > 0);
    });
  };

  const scanBarcode = (event) => {
    if (event.key !== 'Enter' || !query.trim()) return;
    const code = query.trim().toLowerCase();
    const match = products.find((product) =>
      product.is_active &&
      (String(product.barcode || '').toLowerCase() === code ||
        String(product.sku || '').toLowerCase() === code),
    );
    if (!match) {
      setScanMessage('Barcode/SKU tidak ditemukan. Coba nama produk.');
      return;
    }
    if (Number(match.stok) <= quantityFor(match.id)) {
      setScanMessage(`Stok ${match.nama} tidak mencukupi.`);
      return;
    }
    changeQuantity(match, 1);
    setQuery('');
    setScanMessage(`${match.nama} ditambahkan.`);
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,374px)] lg:gap-6">
      <section className="min-w-0">
        <label className="relative block">
          <Search size={17} className="absolute left-3.5 top-3.5 text-muted" />
          <input
            className="field !h-11 !rounded-xl !py-2.5 pl-10 pr-11"
            placeholder="Cari produk atau pindai barcode"
            aria-label="Cari produk atau pindai barcode"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setScanMessage('');
            }}
            onKeyDown={scanBarcode}
            autoComplete="off"
            inputMode="search"
          />
          <Barcode size={17} className="absolute right-3.5 top-3.5 text-muted" />
        </label>
        {scanMessage && <p aria-live="polite" className="mt-1.5 text-xs text-pondok-700">{scanMessage}</p>}
        <div className="my-3 flex gap-2 overflow-x-auto pb-0.5">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              className={`min-h-9 shrink-0 rounded-lg border px-3 text-xs font-medium transition ${category === item ? 'border-pondok-700 bg-pondok-700 text-white' : 'border-line bg-white text-muted hover:border-pondok-200'}`}
              onClick={() => {
                setCategory(item);
                setShowAll(false);
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Pilih produk</h2>
          <span className="hidden text-[11px] text-muted sm:inline">{filtered.length} produk tersedia</span>
        </div>
        {!filtered.length ? (
          <div className="rounded-xl border border-line bg-white">
            <Empty
              title={products.length ? 'Produk tidak ditemukan' : 'Katalog masih kosong'}
              description={products.length ? 'Coba kata kunci atau kategori lain.' : 'Tambahkan produk dan stok di menu Produk.'}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleProducts.map((product) => {
              const quantity = quantityFor(product.id);
              const noStock = Number(product.stok) <= 0;
              const Icon = productIcons[Number(product.id) % productIcons.length];
              return (
                <article
                  key={product.id}
                  className={`flex min-h-[178px] flex-col rounded-2xl border bg-white p-2.5 transition sm:min-h-[192px] sm:p-3 ${quantity ? 'border-pondok-600 ring-1 ring-pondok-600' : 'border-line hover:border-pondok-200'}`}
                >
                  <button
                    type="button"
                    className={`relative mb-2 flex h-[68px] items-center justify-between overflow-hidden rounded-xl px-3 text-pondok-900 sm:h-[82px] ${categoryStyle[product.kategori] || 'bg-[#e9eaf1]'}`}
                    disabled={noStock}
                    onClick={() => changeQuantity(product, 1)}
                    aria-label={`Tambah ${product.nama}`}
                  >
                    <span className="text-3xl font-semibold tracking-wide sm:text-4xl">{product.nama.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}</span>
                    <Icon size={22} strokeWidth={1.4} />
                    {noStock && <span className="absolute inset-0 grid place-items-center bg-white/70 text-xs font-semibold text-red-700">Stok habis</span>}
                  </button>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    disabled={noStock}
                    onClick={() => changeQuantity(product, 1)}
                  >
                    <p className="truncate text-[11px] font-semibold leading-4 sm:text-xs">{product.nama}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted">
                      {product.kategori} · Stok {product.stok}
                    </p>
                  </button>
                  <div className="mt-2 flex items-center justify-between gap-1">
                    <span className="text-xs font-bold sm:text-sm">{formatMoney(product.harga)}</span>
                    {quantity ? (
                      <div className="flex h-8 items-center gap-1 rounded-lg bg-pondok-700 px-1 text-white">
                        <button type="button" className="grid h-6 w-6 place-items-center" aria-label={`Kurangi ${product.nama}`} onClick={() => changeQuantity(product, -1)}><Minus size={13} /></button>
                        <span className="w-4 text-center text-xs font-semibold">{quantity}</span>
                        <button type="button" className="grid h-6 w-6 place-items-center disabled:opacity-40" aria-label={`Tambah ${product.nama}`} disabled={noStock || quantity >= Number(product.stok)} onClick={() => changeQuantity(product, 1)}><Plus size={13} /></button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="grid h-8 w-8 place-items-center rounded-lg bg-[#e8f4ed] text-pondok-700 disabled:opacity-40"
                        aria-label={`Tambah ${product.nama} ke keranjang`}
                        disabled={noStock}
                        onClick={() => changeQuantity(product, 1)}
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {filtered.length > 4 && !query && (
          <button
            type="button"
            className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white text-xs font-semibold text-pondok-700 lg:hidden"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? 'Tampilkan lebih sedikit' : `Lihat ${filtered.length - 4} produk lainnya`}
            <ChevronDown size={14} className={showAll ? 'rotate-180 transition' : 'transition'} />
          </button>
        )}
        <p className="mt-3 hidden text-[11px] text-muted lg:block">
          Scanner barcode USB/Bluetooth dapat digunakan pada kolom pencarian. Pindai lalu tekan Enter.
        </p>
      </section>
      <aside className="card sticky top-[76px] hidden h-fit p-4 lg:block">
        <CartSummary cart={cart} total={total} itemCount={itemCount} onCheckout={onCheckout} />
      </aside>
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-[50px] z-20 border-t border-line bg-white px-4 pb-2 pt-2 shadow-[0_-5px_18px_rgba(24,63,54,0.07)] lg:hidden">
          <div className="mx-auto flex max-w-[520px] items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <ShoppingBasket size={17} className="text-pondok-700" />
              <span>{itemCount} item dipilih</span>
            </div>
            <span className="text-lg font-semibold">{formatMoney(total)}</span>
          </div>
          <button type="button" onClick={onCheckout} className="mx-auto mt-2 flex min-h-10 w-full max-w-[520px] items-center justify-center gap-2 rounded-xl bg-pondok-700 text-xs font-semibold text-white">
            <ShoppingBasket size={15} /> Lihat keranjang
          </button>
        </div>
      )}
    </div>
  );
}

function CartSummary({ cart, total, itemCount, onCheckout }) {
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Keranjang</h2>
        <span className="rounded-lg bg-[#e8f4ed] px-2 py-1 text-[11px] font-semibold text-pondok-700">{itemCount} item</span>
      </div>
      {!cart.length ? (
        <p className="rounded-lg bg-canvas p-3 text-xs text-muted">Pilih produk untuk memulai.</p>
      ) : (
        <div className="max-h-48 divide-y divide-line overflow-y-auto">
          {cart.map(({ product, quantity }) => (
            <div key={product.id} className="flex items-center justify-between gap-2 py-2.5 text-xs">
              <div className="min-w-0">
                <p className="truncate font-semibold">{product.nama}</p>
                <p className="mt-0.5 text-[10px] text-muted">{quantity} × {formatMoney(product.harga)}</p>
              </div>
              <span className="shrink-0 font-semibold">{formatMoney(Number(product.harga) * quantity)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between border-t border-line pt-3 text-xs">
        <span className="text-muted">Total · {itemCount} item</span>
        <span className="font-semibold">{formatMoney(total)}</span>
      </div>
      <button type="button" className="btn-primary mt-3 min-h-10 w-full !rounded-lg !py-2 text-xs" disabled={!cart.length || total <= 0} onClick={onCheckout}>
        Lanjut verifikasi santri
      </button>
    </>
  );
}
