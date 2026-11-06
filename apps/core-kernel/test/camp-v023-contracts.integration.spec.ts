import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCampIt, type CampIt } from './helpers/camp-it-app';

let a: CampIt;
let b: CampIt;

beforeAll(async () => {
  a = await createCampIt('v023contracta');
  b = await createCampIt('v023contractb');
}, 120_000);

afterAll(async () => {
  await b?.close();
  await a?.close();
}, 60_000);

describe('v0.2.3 contracts and exchange rates', () => {
  it('isolates tenants, enforces permission, and records the complete lifecycle', async () => {
    const catalog = await a.api().get('/api/v1/camp/contract-catalog').set(a.as('admin'));
    expect(catalog.status).toBe(200);
    const meal = catalog.body.serviceTypes.find((s: { code: string }) => s.code === 'MEAL');
    expect(meal).toMatchObject({ quantitySource: 'MEAL_ORDER', defaultUnitId: expect.any(String) });
    expect(catalog.body.units.length).toBeGreaterThan(0);

    const base = a.camp('/contracts');
    expect((await a.api().get(base).set(a.as('manager'))).status).toBe(403);
    const draft = await a.api().post(base).set(a.as('admin')).send({
      contractNo: 'CNY-1', title: 'Meal contract', organizationId: a.ids.org,
      startDate: '2026-01-01', endDate: '2026-12-31', currency: 'CNY', paymentCurrency: 'MNT',
      vatRate: '10', ratePolicy: 'MONTHLY_MANUAL',
    });
    expect(draft.status).toBe(201);
    expect(draft.body.status).toBe('DRAFT');
    const id = draft.body.id as string;
    expect((await b.api().get(b.camp(`/contracts/${id}`)).set(b.as('admin'))).status).toBe(404);
    const path = `${base}/${id}`;
    const noPrice = await a.api().post(`${path}/activate`).set(a.as('admin'));
    expect(noPrice.status).toBe(400);
    expect(noPrice.body.code).toBe('camp.err.contract.18');
    const item = await a.api().post(`${path}/items`).set(a.as('admin')).send({
      serviceTypeId: meal.id, quantityRule: 'TOTAL_DIV_N', quantityDivisor: '3',
    });
    expect(item.status).toBe(201);
    expect(item.body).toMatchObject({ quantityRule: 'TOTAL_DIV_N', quantityDivisor: '3' });
    const itemId = item.body.id as string;
    const price = await a.api().post(`${path}/items/${itemId}/prices`).set(a.as('admin')).send({
      effectiveFrom: '2026-01-01', unitPrice: '100', vatIncluded: false,
    });
    expect(price.status).toBe(201);
    const active = await a.api().post(`${path}/activate`).set(a.as('admin'));
    expect(active.status).toBe(200);
    expect(active.body.status).toBe('ACTIVE');

    const query = { itemId, date: '2026-05-10', quantity: '3' };
    const noRate = await a.api().get(`${path}/quote`).query(query).set(a.as('admin'));
    expect(noRate.status).toBe(400);
    expect(noRate.body.code).toBe('camp.err.contract.23');
    const rate = await a.api().put('/api/v1/core/exchange-rates').set(a.as('admin')).send({
      rateDate: '2026-05-01', baseCurrency: 'CNY', quoteCurrency: 'MNT', rate: '500', sourceNote: 'IT',
    });
    expect(rate.status).toBe(200);
    const quote = await a.api().get(`${path}/quote`).query(query).set(a.as('admin'));
    expect(quote.status).toBe(200);
    expect(quote.body).toMatchObject({ rate: '500', gross: '330.00', paymentGross: '165000.00', rateDate: '2026-05-01' });

    const extension = await a.api().post(`${path}/amendments`).set(a.as('admin')).send({
      amendmentType: 'EXTENSION', effectiveDate: '2026-06-01', newEndDate: '2027-12-31', documentNo: 'EXT-1',
    });
    expect(extension.status).toBe(201);
    expect(extension.body).toMatchObject({ amendmentType: 'EXTENSION', newEndDate: '2027-12-31' });
    await expect(a.prismaAdmin.campContractAmendment.update({ where: { id: extension.body.id }, data: { note: 'changed' } }))
      .rejects.toThrow(/CAMP_CONTRACT_HISTORY/);
    const terminated = await a.api().post(`${path}/terminate`).set(a.as('admin')).send({ terminatedAt: '2027-01-01', note: 'end' });
    expect(terminated.status).toBe(200);
    expect(terminated.body).toMatchObject({ status: 'TERMINATED', endDate: '2027-12-31' });
    expect(terminated.body.amendments.map((entry: { amendmentType: string }) => entry.amendmentType)).toEqual(expect.arrayContaining(['EXTENSION', 'TERMINATION']));

    const other = await a.api().post(base).set(a.as('admin')).send({
      contractNo: 'DRAFT-2', title: 'Draft', organizationId: a.ids.org, startDate: '2026-01-01',
      currency: 'MNT', paymentCurrency: 'MNT', vatRate: '10', ratePolicy: 'NONE',
    });
    expect(other.status).toBe(201);
    const history = await a.prismaAdmin.campContractAmendment.create({ data: {
      tenantId: a.tenantId, campId: a.ids.c1, contractId: other.body.id, amendmentType: 'OTHER',
      effectiveDate: new Date('2026-01-01T00:00:00Z'), createdBy: a.coreIds.admin,
    } });
    expect((await a.api().delete(`${base}/${other.body.id}`).set(a.as('admin'))).status).toBe(204);
    expect(await a.prismaAdmin.campContractAmendment.findUnique({ where: { id: history.id } })).toBeNull();
  }, 60_000);
});
