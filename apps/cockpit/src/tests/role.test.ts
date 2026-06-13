import { describe, it, expect } from 'vitest';
import { canWriteContract, canActOnIncidents, canAcceptProposal, ROLE_META } from '@/store/role';

// FE permission mirror of auth/provider.py:Principal. The server stays
// authoritative; these guard the affordances the UI offers per role.
describe('canWriteContract', () => {
  it('admin can write anything', () => {
    expect(canWriteContract('admin', 'platform')).toBe(true);
    expect(canWriteContract('admin', 'product')).toBe(true);
    expect(canWriteContract('admin', undefined)).toBe(true);
  });

  it('steward writes platform but not product', () => {
    expect(canWriteContract('steward', 'platform')).toBe(true);
    expect(canWriteContract('steward', 'product')).toBe(false);
  });

  it('owner writes both platform and product', () => {
    expect(canWriteContract('owner', 'platform')).toBe(true);
    expect(canWriteContract('owner', 'product')).toBe(true);
  });

  it('viewer writes nothing', () => {
    expect(canWriteContract('viewer', 'platform')).toBe(false);
    expect(canWriteContract('viewer', 'product')).toBe(false);
    expect(canWriteContract('viewer', undefined)).toBe(false);
  });
});

describe('canActOnIncidents', () => {
  it('requires steward role or higher', () => {
    expect(canActOnIncidents('viewer')).toBe(false);
    expect(canActOnIncidents('steward')).toBe(true);
    expect(canActOnIncidents('owner')).toBe(true);
    expect(canActOnIncidents('admin')).toBe(true);
  });
});

describe('canAcceptProposal', () => {
  it('follows the contract write rule', () => {
    expect(canAcceptProposal('viewer')).toBe(false);
    expect(canAcceptProposal('steward', 'platform')).toBe(true);
    expect(canAcceptProposal('steward', 'product')).toBe(false);
  });
});

describe('ROLE_META', () => {
  it('routes writer roles to the My-work landing', () => {
    expect(ROLE_META.steward.home).toBe('/my');
    expect(ROLE_META.owner.home).toBe('/my');
    expect(ROLE_META.viewer.home).toBe('/');
    expect(ROLE_META.admin.home).toBe('/');
  });
});
