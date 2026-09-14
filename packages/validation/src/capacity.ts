export function calculateAvailableCapacity(max: number, reserved: number, fulfilled: number): number {
  return Math.max(0, max - reserved - fulfilled);
}

export function canAcceptOrder(max: number, reserved: number, fulfilled: number, qty: number): boolean {
  if (qty <= 0) return false;
  return qty <= calculateAvailableCapacity(max, reserved, fulfilled);
}

export function reserveCapacity(reserved: number, qty: number): number {
  return reserved + qty;
}

export function releaseCapacity(reserved: number, qty: number): number {
  return Math.max(0, reserved - qty);
}

export function fulfillCapacity(reserved: number, fulfilled: number, qty: number): { reserved: number; fulfilled: number } {
  return {
    reserved: Math.max(0, reserved - qty),
    fulfilled: fulfilled + qty
  };
}
