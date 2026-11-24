export const calculateWeightedAverageCost = (
  currentQuantity,
  currentUnitCost,
  receivedQuantity,
  receivedUnitCost,
) => {
  const currentQty = BigInt(currentQuantity);
  const receivedQty = BigInt(receivedQuantity);
  const receivedCents = moneyToCents(receivedUnitCost);
  const totalQuantity = currentQty + receivedQty;
  if (currentQty < 0n || receivedQty <= 0n || totalQuantity <= 0n) {
    throw new RangeError('Stock quantities must be non-negative and received quantity must be positive.');
  }
  if (currentQty > 0n && (currentUnitCost === null || currentUnitCost === undefined)) return null;
  const currentCents = currentQty === 0n ? 0n : moneyToCents(currentUnitCost);
  const totalValue = currentQty * currentCents + receivedQty * receivedCents;
  return centsToMoney((totalValue + totalQuantity / 2n) / totalQuantity);
};

export const moneyToCents = (value) => {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Invalid money value.');
  const text = String(value ?? '').trim();
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(text)) {
    throw new TypeError('Money value must be a non-negative amount with at most two decimal places.');
  }
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};

export const centsToMoney = (cents) => {
  const value = BigInt(cents);
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
};

export const isValidPurchaseDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const normalizePurchaseItems = (items) => {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    return { error: 'Faktur harus memiliki 1 sampai 100 baris produk.' };
  }
  const normalized = [];
  const seen = new Set();
  for (const item of items) {
    const productId = Number(item?.product_id);
    const quantity = Number(item?.quantity);
    if (!Number.isSafeInteger(productId) || productId <= 0 || seen.has(productId)) {
      return { error: 'Produk faktur tidak valid atau tercantum lebih dari sekali.' };
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1_000_000) {
      return { error: 'Jumlah setiap produk harus berupa bilangan bulat positif.' };
    }
    let unitCostCents;
    try {
      unitCostCents = moneyToCents(item?.unit_cost);
    } catch {
      return { error: 'Harga modal harus berupa nominal positif dengan maksimal dua angka desimal.' };
    }
    if (unitCostCents <= 0n) return { error: 'Harga modal harus lebih besar dari nol.' };
    normalized.push({
      product_id: productId,
      quantity,
      unit_cost: centsToMoney(unitCostCents),
      subtotal: centsToMoney(BigInt(quantity) * unitCostCents),
    });
    seen.add(productId);
  }
  return { value: normalized };
};
