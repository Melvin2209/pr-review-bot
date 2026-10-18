import { describe, expect, it } from 'vitest';
import { Cart } from './cart.js';

describe('Cart', () => {
  it('sums prices times quantities', () => {
    const cart = new Cart();
    cart.add({ sku: 'tea', price: 4, quantity: 2 });
    cart.add({ sku: 'cup', price: 10, quantity: 1 });
    expect(cart.total()).toBe(18);
  });

  it('merges identical items', () => {
    const cart = new Cart();
    cart.add({ sku: 'tea', price: 4, quantity: 1 });
    cart.add({ sku: 'tea', price: 4, quantity: 2 });
    expect(cart.size).toBe(1);
    expect(cart.total()).toBe(12);
  });
});
