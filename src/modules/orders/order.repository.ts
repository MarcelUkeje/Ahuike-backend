import { randomUUID } from 'node:crypto';
import type { Order, OrderItem } from './order.model.js';

export interface CreateOrderRecord {
  customerId: string;
  restaurantId: string;
  items: OrderItem[];
  deliveryAddress: string;
  deliveryFee: number;
}

export interface OrderRepository {
  create(input: CreateOrderRecord): Promise<Order>;
  listForCustomer(customerId: string): Promise<Order[]>;
  findById(id: string): Promise<Order | null>;
}

export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();

  async create(input: CreateOrderRecord): Promise<Order> {
    const now = new Date().toISOString();
    const subtotal = input.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const order: Order = {
      id: randomUUID(),
      ...input,
      subtotal,
      total: subtotal + input.deliveryFee,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(order.id, order);
    return order;
  }

  async listForCustomer(customerId: string): Promise<Order[]> {
    return [...this.orders.values()]
      .filter((order) => order.customerId === customerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findById(id: string): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }
}
