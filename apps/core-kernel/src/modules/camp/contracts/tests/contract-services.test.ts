import { beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { setup, setActor } from '../../common/tests/camp-test-utils';
import { CAMP_PERMISSIONS as P } from '../../common/camp-permissions';
import { ContractsService } from '../contracts.service';
import { ContractPricingService } from '../contract-pricing.service';
import { ContractCatalogService } from '../contract-catalog.service';
import { ExchangeRatesService } from '../../../core/exchange-rates/exchange-rates.service';

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const decimal = (value: string) => new Prisma.Decimal(value);
const contract = (status = 'DRAFT') => ({
  id: 'contract', campId: 'camp', contractNo: 'C1', title: 'Contract', organizationId: 'org',
  customerOrganizationId: null, startDate: date('2026-01-01'), endDate: date('2026-12-31'),
  status, terminatedAt: null, currency: 'MNT', paymentCurrency: 'MNT', vatRate: decimal('10'),
  ratePolicy: 'NONE', fixedRate: null, paymentTerms: [], note: null,
  organization: { name: 'Org' }, customer: null, _count: { items: 0 }, items: [], amendments: [],
});

describe('contract services', () => {
  let s: ReturnType<typeof setup>;
  let contracts: ContractsService;
  let pricing: ContractPricingService;
  let catalog: ContractCatalogService;
  let rates: ExchangeRatesService;

  beforeEach(() => {
    s = setup();
    setActor(s.tx, { roles: [{ campId: 'camp', perms: [P.CONTRACT_MANAGE] }] });
    s.tx.camp.findFirst.mockResolvedValue({ id: 'camp', code: 'C', name: 'Camp', isActive: true });
    contracts = new ContractsService(s.prisma as never, s.access);
    pricing = new ContractPricingService(s.prisma as never, s.access);
    catalog = new ContractCatalogService(s.prisma as never, s.access);
    rates = new ExchangeRatesService(s.prisma as never, s.access);
  });

  it('DRAFT updates freely, ACTIVE locks changed fields, TERMINATED cannot update', async () => {
    s.tx.campContract.findFirst.mockResolvedValue(contract());
    await contracts.update('tenant', 'auth', 'camp', 'contract', { contractNo: 'C2' });
    expect(s.tx.campContract.update).toHaveBeenCalledWith(expect.objectContaining({ data: { contractNo: 'C2' } }));
    s.tx.campContract.findFirst.mockResolvedValue(contract('ACTIVE'));
    await expect(contracts.update('tenant', 'auth', 'camp', 'contract', { contractNo: 'C2' }))
      .rejects.toMatchObject({ code: 'camp.err.contract.10' });
    s.tx.campContract.findFirst.mockResolvedValue(contract('TERMINATED'));
    await expect(contracts.update('tenant', 'auth', 'camp', 'contract', { title: 'X' }))
      .rejects.toMatchObject({ code: 'camp.err.contract.2' });
  });

  it('ACTIVE terms changes create TERMS history, unchanged terms do not', async () => {
    s.tx.campContract.findFirst.mockResolvedValue(contract('ACTIVE'));
    await contracts.update('tenant', 'auth', 'camp', 'contract', { vatRate: '11', documentNo: 'doc' });
    expect(s.tx.campContractAmendment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amendmentType: 'TERMS', documentNo: 'doc', note: 'vatRate' }),
    }));
    s.tx.campContractAmendment.create.mockClear();
    await contracts.update('tenant', 'auth', 'camp', 'contract', { vatRate: '10.00' });
    expect(s.tx.campContractAmendment.create).not.toHaveBeenCalled();
  });

  it('activate requires DRAFT and a price for every item on the start date', async () => {
    s.tx.campContract.findFirst.mockResolvedValue(contract());
    await expect(contracts.activate('tenant', 'auth', 'camp', 'contract')).rejects.toMatchObject({ code: 'camp.err.contract.18' });
    s.tx.campContract.findFirst.mockResolvedValue(contract('ACTIVE'));
    await expect(contracts.activate('tenant', 'auth', 'camp', 'contract')).rejects.toMatchObject({ code: 'camp.err.contract.2' });
  });

  it('activate accepts a priced item and an active contractor', async () => {
    const row = { ...contract(), items: [{
      id: 'item', serviceTypeId: 'type', unitId: 'unit', quantityRule: 'TOTAL_DIV_N',
      quantityDivisor: decimal('3'), mealType: null, description: null,
      serviceType: { code: 'MEAL', quantitySource: 'MEAL_ORDER' }, unit: { code: 'PERSON_DAY' },
      prices: [{ id: 'price', effectiveFrom: date('2026-01-01'), unitPrice: decimal('20'),
        vatIncluded: false, currency: 'MNT', note: null, amendmentId: null, createdAt: date('2026-01-01') }],
    }] };
    s.tx.campContract.findFirst.mockResolvedValue(row);
    s.tx.coreOrganization.findFirst.mockResolvedValue({ isActive: true });
    await contracts.activate('tenant', 'auth', 'camp', 'contract');
    expect(s.tx.campContract.update).toHaveBeenCalledWith({ where: { id: 'contract' }, data: { status: 'ACTIVE' } });
  });

  it('delete is only allowed in DRAFT', async () => {
    s.tx.campContract.findFirst.mockResolvedValue({ status: 'DRAFT' });
    await contracts.remove('tenant', 'auth', 'camp', 'contract');
    expect(s.tx.campContract.delete).toHaveBeenCalledWith({ where: { id: 'contract' } });
    s.tx.campContract.findFirst.mockResolvedValue({ status: 'ACTIVE' });
    await expect(contracts.remove('tenant', 'auth', 'camp', 'contract')).rejects.toMatchObject({ code: 'camp.err.contract.2' });
  });

  it('ACTIVE price creates PRICE_CHANGE history and links the price', async () => {
    s.tx.campContract.findFirst.mockResolvedValue(contract('ACTIVE'));
    s.tx.campContractItem.findFirst.mockResolvedValue({});
    s.tx.campContractAmendment.create.mockResolvedValue({ id: 'amendment' });
    s.tx.campContractItemPrice.create.mockResolvedValue({
      id: 'price', effectiveFrom: date('2026-02-01'), unitPrice: decimal('20'), vatIncluded: false,
      currency: 'MNT', note: null, amendmentId: 'amendment', createdAt: date('2026-01-01'),
    });
    await contracts.addPrice('tenant', 'auth', 'camp', 'contract', 'item', { effectiveFrom: '2026-02-01', unitPrice: '20', vatIncluded: false });
    expect(s.tx.campContractAmendment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amendmentType: 'PRICE_CHANGE' }) }));
    expect(s.tx.campContractItemPrice.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amendmentId: 'amendment' }) }));
  });

  it('termination writes TERMINATION history and rejects non-ACTIVE contracts', async () => {
    s.tx.campContract.findFirst.mockResolvedValue(contract('ACTIVE'));
    await contracts.terminate('tenant', 'auth', 'camp', 'contract', { terminatedAt: '2026-06-01', note: 'end' });
    expect(s.tx.campContractAmendment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amendmentType: 'TERMINATION' }) }));
    s.tx.campContract.findFirst.mockResolvedValue(contract());
    await expect(contracts.terminate('tenant', 'auth', 'camp', 'contract', { terminatedAt: '2026-06-01', note: 'end' }))
      .rejects.toMatchObject({ code: 'camp.err.contract.2' });
  });

  it('extension must advance a finite end date', async () => {
    s.tx.campContract.findFirst.mockResolvedValue(contract('ACTIVE'));
    await expect(contracts.addAmendment('tenant', 'auth', 'camp', 'contract', {
      amendmentType: 'EXTENSION', effectiveDate: '2026-06-01', newEndDate: '2026-12-31',
    })).rejects.toMatchObject({ code: 'camp.err.contract.19' });
  });

  it('valid extension updates the end date and records EXTENSION', async () => {
    const row = { ...contract('ACTIVE'), amendments: [{
      id: 'new-id', amendmentType: 'EXTENSION', effectiveDate: date('2026-06-01'),
      previousEndDate: date('2026-12-31'), newEndDate: date('2027-12-31'), documentNo: 'doc',
      note: null, createdBy: 'cu-actor', createdAt: date('2026-06-01'), createdByUser: { fullName: 'Actor', email: 'a@example.com' },
    }] };
    s.tx.campContract.findFirst.mockResolvedValue(row);
    const result = await contracts.addAmendment('tenant', 'auth', 'camp', 'contract', {
      amendmentType: 'EXTENSION', effectiveDate: '2026-06-01', newEndDate: '2027-12-31', documentNo: 'doc',
    });
    expect(s.tx.campContract.update).toHaveBeenCalledWith({ where: { id: 'contract' }, data: { endDate: date('2027-12-31') } });
    expect(result).toMatchObject({ amendmentType: 'EXTENSION', newEndDate: '2027-12-31', documentNo: 'doc' });
  });

  it('MONTHLY_MANUAL selects direct first, then inverse, and errors if missing', async () => {
    s.tx.campContract.findFirst.mockResolvedValue({ ratePolicy: 'MONTHLY_MANUAL', fixedRate: null });
    s.tx.coreExchangeRate.findMany.mockResolvedValue([{ baseCurrency: 'MNT', rate: decimal('0.002') }, { baseCurrency: 'CNY', rate: decimal('500') }]);
    expect((await pricing.rateFor(s.tx as never, 'tenant', 'contract', 'CNY', 'MNT', '2026-04-15')).rate.toString()).toBe('500');
    s.tx.coreExchangeRate.findMany.mockResolvedValue([{ baseCurrency: 'MNT', rate: decimal('0.002') }]);
    const inverse = await pricing.rateFor(s.tx as never, 'tenant', 'contract', 'CNY', 'MNT', '2026-04-15');
    expect(inverse.rate.toString()).toBe('500');
    expect(inverse.rateDate).toBe('2026-04-01');
    s.tx.coreExchangeRate.findMany.mockResolvedValue([]);
    await expect(pricing.rateFor(s.tx as never, 'tenant', 'contract', 'CNY', 'MNT', '2026-04-15'))
      .rejects.toMatchObject({ code: 'camp.err.contract.23' });
  });

  it('catalog seeds only when empty and protects used service quantity sources', async () => {
    await catalog.catalog('tenant', 'auth');
    expect(s.tx.$executeRaw).toHaveBeenCalledTimes(2);
    s.tx.campServiceType.findFirst.mockResolvedValue({ quantitySource: 'MEAL_ORDER' });
    s.tx.campContractItem.count.mockResolvedValue(1);
    await expect(catalog.updateServiceType('tenant', 'auth', 'service', { quantitySource: 'MANUAL' }))
      .rejects.toMatchObject({ code: 'camp.err.contractcat.2' });
  });

  it('catalog creates a service with an active default unit and rejects an inactive one', async () => {
    s.tx.coreUnit.findFirst.mockResolvedValue({ isActive: true });
    s.tx.campServiceType.create.mockResolvedValue({ id: 'type', code: 'TEST', quantitySource: 'MANUAL' });
    await catalog.createServiceType('tenant', 'auth', { code: 'TEST', nameMn: 'Test', quantitySource: 'MANUAL', defaultUnitId: 'unit' });
    expect(s.tx.campServiceType.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant', defaultUnitId: 'unit', quantitySource: 'MANUAL' }),
    }));
    s.tx.coreUnit.findFirst.mockResolvedValue({ isActive: false });
    await expect(catalog.createServiceType('tenant', 'auth', { code: 'TEST', nameMn: 'Test', quantitySource: 'MANUAL', defaultUnitId: 'unit' }))
      .rejects.toMatchObject({ code: 'camp.err.contract.12' });
  });

  it('exchange rates reject same currency and delete missing rows explicitly', async () => {
    setActor(s.tx, { roles: [{ campId: 'camp', perms: [P.EXCHANGE_RATE_MANAGE] }] });
    await expect(rates.upsert('tenant', 'auth', { rateDate: '2026-04-01', baseCurrency: 'CNY', quoteCurrency: 'CNY', rate: '1' }))
      .rejects.toMatchObject({ code: 'core.err.fx.1' });
    await expect(rates.remove('tenant', 'auth', 'missing')).rejects.toMatchObject({ code: 'core.err.fx.2' });
  });

  it('exchange rate upsert uses the tenant and date pair and returns decimal text', async () => {
    setActor(s.tx, { roles: [{ campId: 'camp', perms: [P.EXCHANGE_RATE_MANAGE] }] });
    s.tx.coreExchangeRate.upsert.mockResolvedValue({
      id: 'rate', rateDate: date('2026-04-01'), baseCurrency: 'CNY', quoteCurrency: 'MNT',
      rate: decimal('500'), sourceNote: 'source', createdAt: date('2026-04-01'),
    });
    const result = await rates.upsert('tenant', 'auth', {
      rateDate: '2026-04-01', baseCurrency: 'CNY', quoteCurrency: 'MNT', rate: '500', sourceNote: 'source',
    });
    expect(result).toMatchObject({ rateDate: '2026-04-01', rate: '500', sourceNote: 'source' });
    expect(s.tx.coreExchangeRate.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_rateDate_baseCurrency_quoteCurrency: {
        tenantId: 'tenant', rateDate: date('2026-04-01'), baseCurrency: 'CNY', quoteCurrency: 'MNT',
      } },
    }));
  });

  it('exchange rates do not accept the Camp contract permission as a substitute', async () => {
    await expect(rates.list('tenant', 'auth', {})).rejects.toMatchObject({ code: 'camp.err.access.3' });
  });
});
