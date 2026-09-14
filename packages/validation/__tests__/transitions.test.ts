import { isValidTransition, isTerminalStatus } from '@aquakart/config';

describe('transition functions', () => {
  it('isValidTransition', () => {
    expect(isValidTransition('placed', 'accepted')).toBe(true);
    expect(isValidTransition('placed', 'rejected')).toBe(true);
    expect(isValidTransition('placed', 'cancelled')).toBe(true);
    expect(isValidTransition('placed', 'delivered')).toBe(false);
    
    expect(isValidTransition('accepted', 'preparing')).toBe(true);
    expect(isValidTransition('accepted', 'cancelled')).toBe(true);
    expect(isValidTransition('accepted', 'delivered')).toBe(false);
    
    expect(isValidTransition('preparing', 'out_for_delivery')).toBe(true);
    expect(isValidTransition('preparing', 'cancelled')).toBe(true);
    
    expect(isValidTransition('out_for_delivery', 'delivered')).toBe(true);
    expect(isValidTransition('out_for_delivery', 'cancelled')).toBe(false);
    
    expect(isValidTransition('delivered', 'cancelled')).toBe(false);
  });

  it('isTerminalStatus', () => {
    expect(isTerminalStatus('delivered')).toBe(true);
    expect(isTerminalStatus('rejected')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('placed')).toBe(false);
    expect(isTerminalStatus('accepted')).toBe(false);
  });
});
