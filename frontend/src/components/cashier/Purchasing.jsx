import { useRef, useState } from 'react';
import {
  Banknote,
  Check,
  CreditCard,
  Eye,
  FilePlus2,
  PackagePlus,
  Pencil,
  Plus,
  ReceiptText,
  Store,
  Truck,
} from 'lucide-react';
import { api, idempotencyKey } from '../../api.js';
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
  SelectField,
  StatusBadge,
  TextAreaField,
} from '../../ui.jsx';

const emptySupplier = {
  name: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
};

const emptyInvoice = {
  supplier_id: '',
  invoice_number: '',
  invoice_date: '',
  due_date: '',
  note: '',
};

export function CashierPurchasing({ token }) {
  const [canteenId, setCanteenId] = useState('');
  const [purchasePage, setPurchasePage] = useState(1);
  const [supplierModal, setSupplierModal] = useState(false);
  const [supplierEditing, setSupplierEditing] = useState(null);
  const [supplierForm, setSupplierForm] = useState(emptySupplier);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoice);
  const [invoiceItems, setInvoiceItems] = useState([{ product_id: '', quantity: '1', unit_cost: '' }]);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'bank_transfer', reference_code: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const invoiceRequest = useRef(null);
  const paymentRequest = useRef(null);

  const { data: canteenData, loading: canteensLoading, error: canteenError, refresh: refreshCanteens } =
    useApiData('/kantin', token);
  const canteens = canteenData?.data || [];
  const canteen = canteens.find((item) => String(item.id) === String(canteenId)) || canteens[0];
  const id = canteen?.id;
  const { data: supplierData, loading: suppliersLoading, error: supplierError, refresh: refreshSuppliers } =
    useApiData(id ? `/kantin/${id}/pemasok?include_inactive=true` : '/kantin', token);
  const { data: productData, loading: productsLoading, error: productError, refresh: refreshProducts } =
    useApiData(id ? `/kantin/${id}/produk` : '/kantin', token);
  const { data: purchaseData, loading: purchasesLoading, error: purchaseError, refresh: refreshPurchases } =
    useApiData(id ? `/kantin/${id}/pembelian?page=${purchasePage}&limit=20` : '/kantin', token);
  const suppliers = supplierData?.data || [];
  const products = productData?.data || [];
  const purchases = purchaseData?.data || [];
  const purchaseTotalPages = Math.max(
    1,
    Math.ceil(Number(purchaseData?.pagination?.total || 0) / Number(purchaseData?.pagination?.limit || 20)),
  );
  const activeSuppliers = suppliers.filter((supplier) => Boolean(Number(supplier.is_active)));

  const openSupplierForm = (supplier = null) => {
    setSupplierEditing(supplier);
    setSupplierForm(supplier ? {
      name: supplier.name || '',
      contact_name: supplier.contact_name || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      notes: supplier.notes || '',
    } : emptySupplier);
    setErrorMessage('');
    setSupplierModal(true);
  };

  const saveSupplier = async (event) => {
    event.preventDefault();
    if (!id) return;
    setBusy(true);
    setErrorMessage('');
    try {
      if (supplierEditing) {
        await api.patch(`/kantin/${id}/pemasok/${supplierEditing.id}`, supplierForm, token);
        setNotice('Data pemasok berhasil diperbarui.');
      } else {
        await api.post(`/kantin/${id}/pemasok`, supplierForm, token);
        setNotice('Pemasok berhasil ditambahkan.');
      }
      setSupplierModal(false);
      refreshSuppliers();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleSupplier = async (supplier) => {
    setBusy(true);
    setErrorMessage('');
    try {
      await api.patch(`/kantin/${id}/pemasok/${supplier.id}`, {
        is_active: !Boolean(Number(supplier.is_active)),
      }, token);
      setNotice(Boolean(Number(supplier.is_active)) ? 'Pemasok dinonaktifkan.' : 'Pemasok diaktifkan.');
      refreshSuppliers();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const updateInvoiceItem = (index, field, value) => {
    setInvoiceItems((items) => items.map((item, rowIndex) =>
      rowIndex === index ? { ...item, [field]: value } : item
    ));
  };

  const saveInvoice = async (event) => {
    event.preventDefault();
    if (!id) return;
    setBusy(true);
    setErrorMessage('');
    const payload = {
      ...invoiceForm,
      supplier_id: Number(invoiceForm.supplier_id),
      items: invoiceItems.map((item) => ({
        product_id: Number(item.product_id),
        quantity: Number(item.quantity),
        unit_cost: item.unit_cost,
      })),
    };
    const signature = JSON.stringify({ canteenId: id, ...payload });
    if (invoiceRequest.current?.signature !== signature) {
      invoiceRequest.current = { signature, key: idempotencyKey() };
    }
    try {
      const result = await api.post(`/kantin/${id}/pembelian`, payload, token, {
        idempotencyKey: invoiceRequest.current.key,
      });
      setNotice(result.message);
      setInvoiceModal(false);
      setInvoiceForm(emptyInvoice);
      setInvoiceItems([{ product_id: '', quantity: '1', unit_cost: '' }]);
      invoiceRequest.current = null;
      setPurchasePage(1);
      refreshPurchases();
      refreshProducts();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const openPayment = (purchase) => {
    setPaymentTarget(purchase);
    setPaymentForm({
      amount: String(purchase.outstanding),
      method: 'bank_transfer',
      reference_code: '',
      note: '',
    });
    paymentRequest.current = null;
    setErrorMessage('');
  };

  const openDetails = async (purchase) => {
    setDetailTarget(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const result = await api.get(`/kantin/${id}/pembelian/${purchase.id}`, token);
      setDetailTarget(result.data);
    } catch (error) {
      setDetailError(error.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const savePayment = async (event) => {
    event.preventDefault();
    if (!id || !paymentTarget) return;
    setBusy(true);
    setErrorMessage('');
    const payload = { ...paymentForm, amount: paymentForm.amount };
    const signature = JSON.stringify({ canteenId: id, purchaseId: paymentTarget.id, ...payload });
    if (paymentRequest.current?.signature !== signature) {
      paymentRequest.current = { signature, key: idempotencyKey() };
    }
    try {
      const result = await api.post(
        `/kantin/${id}/pembelian/${paymentTarget.id}/pembayaran`,
        payload,
        token,
        { idempotencyKey: paymentRequest.current.key },
      );
      setNotice(`${result.message} Sisa utang ${formatMoney(result.outstanding)}.`);
      setPaymentTarget(null);
      paymentRequest.current = null;
      refreshPurchases();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (canteensLoading) return <Loading />;
  if (canteenError) return <ErrorNotice error={canteenError} onRetry={refreshCanteens} />;
  if (!canteen) return <Empty title="Belum ada kantin" />;

  const loading = suppliersLoading || productsLoading || purchasesLoading;
  const summary = purchaseData?.summary || {};
  const payable = Number(summary.outstanding || 0);
  const invoicesOpen = Number(summary.open_invoices || 0);

  return (
    <section className="mx-auto max-w-[1360px]">
      <PageHeader
        title="Pembelian & pemasok"
        subtitle={`Kelola penerimaan stok dan utang pemasok · ${canteen.nama}`}
        action={(
          <div className="flex w-full gap-2 sm:w-auto">
            <button type="button" className="btn-secondary flex-1 !py-2.5 sm:flex-none" onClick={() => openSupplierForm()}>
              <Plus size={16} /> Pemasok
            </button>
            <button
              type="button"
              className="btn-primary flex-1 !py-2.5 sm:flex-none"
              disabled={!activeSuppliers.length || !products.length}
              onClick={() => {
                setInvoiceForm({ ...emptyInvoice, supplier_id: String(activeSuppliers[0]?.id || '') });
                setInvoiceItems([{ product_id: '', quantity: '1', unit_cost: '' }]);
                invoiceRequest.current = null;
                setErrorMessage('');
                setInvoiceModal(true);
              }}
            >
              <FilePlus2 size={16} /> Terima faktur
            </button>
          </div>
        )}
      />

      {canteens.length > 1 && (
        <label className="mb-4 block max-w-sm">
          <span className="label">Kantin yang dikelola</span>
          <select
            className="field"
            value={canteen.id}
            onChange={(event) => {
              setCanteenId(event.target.value);
              setPurchasePage(1);
            }}
          >
            {canteens.map((item) => <option key={item.id} value={item.id}>{item.nama}</option>)}
          </select>
        </label>
      )}
      {(errorMessage || supplierError || productError || purchaseError) && (
        <Alert type="error" className="mb-4">
          {errorMessage || supplierError || productError || purchaseError}
        </Alert>
      )}
      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}
      <Alert type="info" className="mb-5">
        Pembayaran faktur dicatat sebagai kas/bank eksternal dan tidak mengurangi saldo kantin PondokPay.
        Harga pokok produk dihitung otomatis menggunakan rata-rata tertimbang.
      </Alert>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <article className="card flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><Banknote size={19} /></span>
          <div><p className="text-xs text-muted">Sisa utang pemasok</p><p className="mt-1 text-lg font-semibold">{formatMoney(payable)}</p></div>
        </article>
        <article className="card flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-pondok-50 text-pondok-700"><ReceiptText size={19} /></span>
          <div><p className="text-xs text-muted">Faktur belum lunas</p><p className="mt-1 text-lg font-semibold">{invoicesOpen}</p></div>
        </article>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line p-4">
            <div>
              <h2 className="font-semibold">Faktur pembelian</h2>
              <p className="mt-0.5 text-xs text-muted">Penerimaan stok dan status pembayaran</p>
            </div>
            <StatusBadge tone="gray">{purchaseData?.pagination?.total || 0} faktur</StatusBadge>
          </div>
          {loading ? <div className="p-6"><Loading /></div> : !purchases.length ? (
            <Empty title="Belum ada faktur" description="Terima faktur pemasok untuk menambah stok dan mencatat utang." />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-[#f5f5f1] text-[10px] uppercase tracking-wide text-muted">
                    <tr><th className="px-4 py-3">Pemasok / faktur</th><th className="px-4 py-3">Diterima</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Sisa</th><th className="px-4 py-3">Status</th><th /></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {purchases.map((purchase) => (
                      <tr key={purchase.id}>
                        <td className="px-4 py-3"><p className="font-semibold">{purchase.supplier_name}</p><p className="text-xs text-muted">{purchase.invoice_number}</p></td>
                        <td className="px-4 py-3 text-xs text-muted">{formatDate(purchase.received_at, true)}</td>
                        <td className="px-4 py-3 font-medium">{formatMoney(purchase.total_amount)}<small className="mt-1 block text-[10px] font-normal text-muted">Dibayar {formatMoney(purchase.total_paid)}</small></td>
                        <td className="px-4 py-3 font-semibold">{formatMoney(purchase.outstanding)}</td>
                        <td className="px-4 py-3"><StatusBadge tone={purchase.payment_status === 'paid' ? 'green' : purchase.payment_status === 'partial' ? 'amber' : 'gray'}>{purchase.payment_status === 'paid' ? 'Lunas' : purchase.payment_status === 'partial' ? 'Sebagian' : 'Belum dibayar'}</StatusBadge></td>
                        <td className="px-4 py-3 text-right">
                          <button className="mr-1 inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-pondok-700 hover:bg-pondok-50" onClick={() => openDetails(purchase)}><Eye size={14} /> Rincian</button>
                          {purchase.payment_status !== 'paid' && <button className="btn-secondary !min-h-8 !px-2.5 !py-1.5 text-xs" onClick={() => openPayment(purchase)}><CreditCard size={14} /> Bayar</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-line md:hidden">
                {purchases.map((purchase) => (
                  <article key={purchase.id} className="space-y-2.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold">{purchase.supplier_name}</p><p className="text-xs text-muted">{purchase.invoice_number} · {formatDate(purchase.received_at)}</p></div>
                      <StatusBadge tone={purchase.payment_status === 'paid' ? 'green' : purchase.payment_status === 'partial' ? 'amber' : 'gray'}>{purchase.payment_status === 'paid' ? 'Lunas' : purchase.payment_status === 'partial' ? 'Sebagian' : 'Belum dibayar'}</StatusBadge>
                    </div>
                    <div className="flex justify-between text-xs"><span className="text-muted">Total faktur</span><strong>{formatMoney(purchase.total_amount)}</strong></div>
                    <div className="flex justify-between text-xs"><span className="text-muted">Sudah dibayar</span><span>{formatMoney(purchase.total_paid)}</span></div>
                    <div className="flex items-center justify-between text-xs"><span className="text-muted">Sisa utang</span><span className="font-semibold">{formatMoney(purchase.outstanding)}</span></div>
                    <button className="btn-secondary w-full !py-2 text-xs" onClick={() => openDetails(purchase)}><Eye size={14} /> Rincian faktur & pembayaran</button>
                    {purchase.payment_status !== 'paid' && <button className="btn-secondary w-full !py-2 text-xs" onClick={() => openPayment(purchase)}><CreditCard size={14} /> Catat pembayaran</button>}
                  </article>
                ))}
              </div>
              {purchaseTotalPages > 1 && (
                <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs">
                  <span className="text-muted">Halaman {purchasePage} dari {purchaseTotalPages}</span>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary !min-h-8 !px-3 !py-1 text-xs" disabled={purchasePage <= 1} onClick={() => setPurchasePage((page) => page - 1)}>Sebelumnya</button>
                    <button type="button" className="btn-secondary !min-h-8 !px-3 !py-1 text-xs" disabled={purchasePage >= purchaseTotalPages} onClick={() => setPurchasePage((page) => page + 1)}>Berikutnya</button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line p-4">
            <div><h2 className="font-semibold">Pemasok</h2><p className="mt-0.5 text-xs text-muted">Kontak rekanan kantin</p></div>
            <button className="grid h-9 w-9 place-items-center rounded-lg bg-pondok-50 text-pondok-700" onClick={() => openSupplierForm()} aria-label="Tambah pemasok"><Plus size={17} /></button>
          </div>
          {loading ? <div className="p-5"><Loading /></div> : !suppliers.length ? (
            <Empty title="Belum ada pemasok" description="Tambahkan pemasok agar faktur dapat dicatat." />
          ) : (
            <div className="divide-y divide-line">
              {suppliers.map((supplier) => {
                const active = Boolean(Number(supplier.is_active));
                return (
                  <article key={supplier.id} className="flex items-start gap-3 p-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-pondok-50 text-pondok-700"><Store size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{supplier.name}</p><StatusBadge tone={active ? 'green' : 'gray'}>{active ? 'Aktif' : 'Nonaktif'}</StatusBadge></div>
                      <p className="mt-1 truncate text-xs text-muted">{supplier.contact_name || supplier.phone || supplier.email || 'Belum ada kontak'}</p>
                      <div className="mt-2 flex gap-2">
                        <button className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line px-2 text-xs font-medium hover:bg-canvas" onClick={() => openSupplierForm(supplier)}><Pencil size={13} /> Ubah</button>
                        <button className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line px-2 text-xs font-medium hover:bg-canvas" disabled={busy} onClick={() => toggleSupplier(supplier)}>{active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {supplierModal && (
        <Modal title={supplierEditing ? 'Ubah pemasok' : 'Tambah pemasok'} onClose={() => setSupplierModal(false)}>
          <form className="space-y-3" onSubmit={saveSupplier}>
            <Field label="Nama pemasok" value={supplierForm.name} maxLength={120} required onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nama kontak" value={supplierForm.contact_name} maxLength={120} onChange={(event) => setSupplierForm({ ...supplierForm, contact_name: event.target.value })} />
              <Field label="Nomor telepon" value={supplierForm.phone} maxLength={40} onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })} />
              <Field label="Email" type="email" value={supplierForm.email} maxLength={190} onChange={(event) => setSupplierForm({ ...supplierForm, email: event.target.value })} />
              <Field label="Alamat" value={supplierForm.address} maxLength={255} onChange={(event) => setSupplierForm({ ...supplierForm, address: event.target.value })} />
            </div>
            <TextAreaField label="Catatan" value={supplierForm.notes} maxLength={255} onChange={(event) => setSupplierForm({ ...supplierForm, notes: event.target.value })} />
            {errorMessage && <Alert type="error">{errorMessage}</Alert>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'Menyimpan...' : <><Check size={16} /> Simpan pemasok</>}</button>
          </form>
        </Modal>
      )}

      {invoiceModal && (
        <Modal title="Terima faktur pemasok" onClose={() => setInvoiceModal(false)} size="max-w-3xl">
          <form className="space-y-4" onSubmit={saveInvoice}>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Pemasok" value={invoiceForm.supplier_id} required onChange={(event) => setInvoiceForm({ ...invoiceForm, supplier_id: event.target.value })}>
                <option value="">Pilih pemasok</option>
                {activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </SelectField>
              <Field label="Nomor faktur" value={invoiceForm.invoice_number} maxLength={80} required onChange={(event) => setInvoiceForm({ ...invoiceForm, invoice_number: event.target.value })} />
              <Field label="Tanggal faktur" type="date" value={invoiceForm.invoice_date} onChange={(event) => setInvoiceForm({ ...invoiceForm, invoice_date: event.target.value })} />
              <Field label="Jatuh tempo (opsional)" type="date" value={invoiceForm.due_date} onChange={(event) => setInvoiceForm({ ...invoiceForm, due_date: event.target.value })} />
            </div>
            <div className="rounded-xl border border-line">
              <div className="flex items-center justify-between border-b border-line px-3 py-2.5"><h3 className="text-sm font-semibold">Barang yang diterima</h3><button type="button" className="btn-secondary !min-h-8 !px-2.5 !py-1 text-xs" onClick={() => setInvoiceItems((items) => [...items, { product_id: '', quantity: '1', unit_cost: '' }])}><Plus size={14} /> Baris</button></div>
              <div className="space-y-3 p-3">
                {invoiceItems.map((item, index) => {
                  const subtotal = Number(item.quantity || 0) * Number(item.unit_cost || 0);
                  return (
                    <div key={index} className="grid gap-2 rounded-lg bg-[#f8f9f7] p-3 sm:grid-cols-[minmax(0,1fr)_90px_130px_100px_32px] sm:items-end">
                      <SelectField label="Produk" value={item.product_id} required onChange={(event) => updateInvoiceItem(index, 'product_id', event.target.value)}>
                        <option value="">Pilih produk</option>
                        {products.map((product) => <option key={product.id} value={product.id}>{product.nama} · stok {product.stok}</option>)}
                      </SelectField>
                      <Field label="Jumlah" type="number" min="1" max="1000000" step="1" value={item.quantity} required onChange={(event) => updateInvoiceItem(index, 'quantity', event.target.value)} />
                      <Field label="Harga modal / unit" type="number" min="0.01" step="0.01" value={item.unit_cost} required onChange={(event) => updateInvoiceItem(index, 'unit_cost', event.target.value)} />
                      <div className="pb-2 text-xs"><span className="text-muted">Subtotal</span><p className="mt-1 font-semibold">{formatMoney(subtotal)}</p></div>
                      <button type="button" disabled={invoiceItems.length === 1} onClick={() => setInvoiceItems((items) => items.filter((_, rowIndex) => rowIndex !== index))} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-30" aria-label="Hapus baris produk">×</button>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between border-t border-line px-3 py-3 text-sm"><span className="text-muted">Total faktur</span><strong>{formatMoney(invoiceItems.reduce((total, item) => total + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0))}</strong></div>
            </div>
            <TextAreaField label="Catatan" value={invoiceForm.note} maxLength={255} onChange={(event) => setInvoiceForm({ ...invoiceForm, note: event.target.value })} />
            <Alert type="info">Stok akan langsung bertambah setelah faktur diterima. Sisa faktur dicatat sebagai utang pemasok.</Alert>
            {errorMessage && <Alert type="error">{errorMessage}</Alert>}
            <button className="btn-primary w-full" disabled={busy || !activeSuppliers.length || !products.length}>{busy ? 'Menerima faktur...' : <><PackagePlus size={16} /> Terima faktur & tambah stok</>}</button>
          </form>
        </Modal>
      )}

      {paymentTarget && (
        <Modal title="Catat pembayaran pemasok" onClose={() => setPaymentTarget(null)}>
          <form className="space-y-4" onSubmit={savePayment}>
            <div className="rounded-xl bg-[#f5f7f4] p-4">
              <div className="flex items-center gap-2"><Truck size={16} className="text-pondok-700" /><p className="text-sm font-semibold">{paymentTarget.supplier_name}</p></div>
              <p className="mt-1 text-xs text-muted">Faktur {paymentTarget.invoice_number}</p>
              <p className="mt-3 text-xs text-muted">Sisa utang</p><p className="text-xl font-semibold">{formatMoney(paymentTarget.outstanding)}</p>
            </div>
            <Field label="Nominal pembayaran" type="number" min="0.01" max={paymentTarget.outstanding} step="0.01" required value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} />
            <SelectField label="Dibayar melalui" value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>
              <option value="bank_transfer">Transfer bank</option><option value="cash">Tunai eksternal</option><option value="other">Lainnya</option>
            </SelectField>
            <Field label="Referensi / nomor bukti" value={paymentForm.reference_code} maxLength={100} onChange={(event) => setPaymentForm({ ...paymentForm, reference_code: event.target.value })} />
            <TextAreaField label="Catatan" value={paymentForm.note} maxLength={255} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} />
            <Alert type="warning">Pembayaran ini hanya dicatat sebagai arus kas/bank eksternal dan tidak memotong saldo kantin.</Alert>
            {errorMessage && <Alert type="error">{errorMessage}</Alert>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'Mencatat...' : <><CreditCard size={16} /> Catat pembayaran</>}</button>
          </form>
        </Modal>
      )}

      {detailLoading && <Modal title="Rincian faktur" onClose={() => setDetailLoading(false)}><Loading /></Modal>}
      {detailError && !detailTarget && (
        <Modal title="Rincian faktur" onClose={() => setDetailError('')}>
          <Alert type="error">{detailError}</Alert>
        </Modal>
      )}
      {detailTarget && (
        <Modal title={`Faktur ${detailTarget.invoice_number}`} onClose={() => setDetailTarget(null)} size="max-w-2xl">
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl bg-[#f5f7f4] p-4 sm:grid-cols-3">
              <div><p className="text-[10px] text-muted">Pemasok</p><p className="mt-1 text-sm font-semibold">{detailTarget.supplier_name}</p></div>
              <div><p className="text-[10px] text-muted">Total faktur</p><p className="mt-1 text-sm font-semibold">{formatMoney(detailTarget.total_amount)}</p></div>
              <div><p className="text-[10px] text-muted">Sisa utang</p><p className="mt-1 text-sm font-semibold">{formatMoney(detailTarget.outstanding)}</p></div>
            </div>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Barang diterima</h3>
              <div className="divide-y divide-line rounded-xl border border-line">
                {detailTarget.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 p-3 text-xs">
                    <div className="min-w-0"><p className="truncate font-semibold">{item.product_name}</p><p className="mt-1 text-muted">{item.quantity} × {formatMoney(item.unit_cost)}</p></div>
                    <span className="shrink-0 font-semibold">{formatMoney(item.subtotal)}</span>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Riwayat pembayaran</h3>
              {!detailTarget.payments.length ? <p className="rounded-xl bg-canvas p-3 text-xs text-muted">Belum ada pembayaran.</p> : (
                <div className="divide-y divide-line rounded-xl border border-line">
                  {detailTarget.payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between gap-3 p-3 text-xs">
                      <div className="min-w-0"><p className="font-semibold">{payment.method === 'bank_transfer' ? 'Transfer bank' : payment.method === 'cash' ? 'Tunai eksternal' : 'Lainnya'} · {formatDate(payment.paid_at, true)}</p><p className="mt-1 truncate text-muted">{payment.reference_code || payment.note || 'Tanpa referensi'}</p></div>
                      <span className="shrink-0 font-semibold">{formatMoney(payment.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {detailTarget.note && <p className="text-xs text-muted">Catatan faktur: {detailTarget.note}</p>}
            <Alert type="info">Pembayaran dicatat sebagai kas/bank eksternal dan tidak memotong saldo kantin PondokPay.</Alert>
          </div>
        </Modal>
      )}
    </section>
  );
}
