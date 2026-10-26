export function selectedChildId(children) {
  const remembered = sessionStorage.getItem('pondokpay.selected_child');
  return children.some((child) => String(child.id) === String(remembered))
    ? String(remembered)
    : String(children[0]?.id || '');
}

export function typeName(type) {
  return (
    { belanja: 'Belanja santri', refund_belanja: 'Pengembalian belanja', topup: 'Top up saldo', tarik: 'Penarikan saldo' }[type] ||
    'Transaksi'
  );
}
