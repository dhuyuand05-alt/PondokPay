import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateWeightedAverageCost,
  isValidPurchaseDate,
  normalizePurchaseItems,
} from '../Controllers/canteenPurchasingUtils.js';

test('weighted average cost combines inventory values and rounds to the nearest cent', () => {
  assert.equal(calculateWeightedAverageCost(10, '100.00', 5, '160.00'), '120.00');
  assert.equal(calculateWeightedAverageCost(1, '10.00', 1, '10.01'), '10.01');
  assert.equal(calculateWeightedAverageCost(0, null, 4, '25.50'), '25.50');
});

test('weighted average remains unknown while legacy stock has no cost basis', () => {
  assert.equal(calculateWeightedAverageCost(7, null, 3, '20.00'), null);
});

test('purchase item normalization rejects duplicate products and invalid costs', () => {
  assert.equal(normalizePurchaseItems([
    { product_id: 1, quantity: 2, unit_cost: '10.25' },
    { product_id: 1, quantity: 1, unit_cost: '12.00' },
  ]).error, 'Produk faktur tidak valid atau tercantum lebih dari sekali.');
  assert.equal(normalizePurchaseItems([
    { product_id: 1, quantity: 1, unit_cost: '0' },
  ]).error, 'Harga modal harus lebih besar dari nol.');
  assert.deepEqual(normalizePurchaseItems([
    { product_id: 3, quantity: 2, unit_cost: '10.25' },
  ]).value, [{
    product_id: 3,
    quantity: 2,
    unit_cost: '10.25',
    subtotal: '20.50',
  }]);
});

test('purchase dates must be real ISO calendar dates', () => {
  assert.equal(isValidPurchaseDate('2024-02-29'), true);
  assert.equal(isValidPurchaseDate('2025-02-29'), false);
  assert.equal(isValidPurchaseDate('2025-13-01'), false);
  assert.equal(isValidPurchaseDate('01-02-2025'), false);
});
