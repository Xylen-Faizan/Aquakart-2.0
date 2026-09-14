import {
  calculateAvailableCapacity,
  canAcceptOrder,
  reserveCapacity,
  releaseCapacity,
  fulfillCapacity
} from '../src/capacity';

describe('capacity functions', () => {
  it('calculateAvailableCapacity', () => {
    expect(calculateAvailableCapacity(20, 5, 5)).toBe(10);
    expect(calculateAvailableCapacity(20, 20, 0)).toBe(0);
    expect(calculateAvailableCapacity(20, 25, 0)).toBe(0);
  });

  it('canAcceptOrder', () => {
    expect(canAcceptOrder(20, 5, 5, 5)).toBe(true);
    expect(canAcceptOrder(20, 5, 5, 15)).toBe(false);
    expect(canAcceptOrder(20, 5, 5, 0)).toBe(false);
    expect(canAcceptOrder(20, 5, 5, -5)).toBe(false);
  });

  it('concurrency scenario', () => {
    const max = 20;
    const orderA = 15;
    const orderB = 15;
    expect(canAcceptOrder(max, 0, 0, orderA)).toBe(true);
    const reservedAfterA = reserveCapacity(0, orderA);
    expect(reservedAfterA).toBe(15);
    expect(canAcceptOrder(max, reservedAfterA, 0, orderB)).toBe(false);
  });

  it('releaseCapacity', () => {
    expect(releaseCapacity(15, 5)).toBe(10);
    expect(releaseCapacity(15, 20)).toBe(0);
  });

  it('fulfillCapacity', () => {
    expect(fulfillCapacity(15, 5, 10)).toEqual({ reserved: 5, fulfilled: 15 });
    expect(fulfillCapacity(10, 0, 15)).toEqual({ reserved: 0, fulfilled: 15 });
  });
});
