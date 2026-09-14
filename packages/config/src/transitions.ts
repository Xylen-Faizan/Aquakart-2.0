import type { OrderStatus } from './constants';
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = { placed: ['accepted', 'rejected', 'cancelled'], accepted: ['preparing', 'cancelled'], preparing: ['out_for_delivery', 'cancelled'], out_for_delivery: ['delivered'], delivered: [], rejected: [], cancelled: [] };
export const TERMINAL_STATUSES: OrderStatus[] = ['delivered', 'rejected', 'cancelled'];
export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean { return VALID_TRANSITIONS[from]?.includes(to) ?? false; }
export function isTerminalStatus(status: OrderStatus): boolean { return TERMINAL_STATUSES.includes(status); }
