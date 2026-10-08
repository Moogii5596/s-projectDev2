import { describe, it, expect } from 'vitest';
import { CloudEventsAdapter } from './cloud-events.adapter';

// RULE-10: new Class() шууд instantiate

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('CloudEventsAdapter', () => {
  it('specversion нь "1.0" байна', () => {
    const event = CloudEventsAdapter.wrap({
      tenantId: TENANT_ID,
      type:     'mn.s-project.requisition.submitted',
      source:   '/s-project/core-kernel',
      data:     { test: true },
    });
    expect(event.specversion).toBe('1.0');
  });

  it('tenantid extension attribute байна', () => {
    const event = CloudEventsAdapter.wrap({
      tenantId: TENANT_ID,
      type:     'mn.s-project.requisition.submitted',
      source:   '/s-project/core-kernel',
      data:     {},
    });
    expect(event.tenantid).toBe(TENANT_ID);
  });

  it('source format зөв', () => {
    const event = CloudEventsAdapter.wrap({
      tenantId: TENANT_ID,
      type:     'mn.s-project.requisition.submitted',
      source:   '/s-project/core-kernel',
      data:     {},
    });
    expect(event.source).toBe('/s-project/core-kernel');
  });

  it('datacontenttype нь "application/json" байна', () => {
    const event = CloudEventsAdapter.wrap({
      tenantId: TENANT_ID,
      type:     'mn.s-project.requisition.submitted',
      source:   '/s-project/core-kernel',
      data:     {},
    });
    expect(event.datacontenttype).toBe('application/json');
  });

  it('id нь UUID format байна', () => {
    const event = CloudEventsAdapter.wrap({
      tenantId: TENANT_ID,
      type:     'mn.s-project.requisition.submitted',
      source:   '/s-project/core-kernel',
      data:     {},
    });
    expect(event.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('time нь ISO 8601 format байна', () => {
    const event = CloudEventsAdapter.wrap({
      tenantId: TENANT_ID,
      type:     'mn.s-project.requisition.submitted',
      source:   '/s-project/core-kernel',
      data:     {},
    });
    expect(() => new Date(event.time)).not.toThrow();
    expect(new Date(event.time).toISOString()).toBe(event.time);
  });
});
