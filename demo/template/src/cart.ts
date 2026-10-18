export interface Item {
  sku: string;
  price: number;
  quantity: number;
}

export class Cart {
  private readonly items: Item[] = [];

  add(item: Item): void {
    const existing = this.items.find((i) => i.sku === item.sku);
    if (existing) existing.quantity += item.quantity;
    else this.items.push({ ...item });
  }

  total(): number {
    return this.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  }

  get size(): number {
    return this.items.length;
  }
}
