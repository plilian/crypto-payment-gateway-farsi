import { describe, expect, it, vi } from 'vitest';
import { TheyPaidPollTimeout } from 'theypaid-sdk';
import type { TheyPaidClient } from '../src/theypaid/client.js';
import {
  checkPayment,
  createInvoice,
  getInvoice,
  listInvoices,
  listSupportedAssets,
  recheckInvoice,
  waitForInvoice,
} from '../src/theypaid/operations.js';

const asset = {
  assetId: 'bc6061b7-846a-4ca2-8c69-4b6515951fe2',
  symbol: 'USDT',
  network: 'Ethereum',
  priceUsdt: 1,
  addressOrPubkey: 'must-not-be-returned',
};

function invoice(status = 'WAITING') {
  return {
    id: 'inv_123',
    status,
    paymentDetected: status === 'WAITING',
    amount: '25.0000',
    amountInTether: '25',
    paidAmount: status === 'PAID' ? '25' : '0',
    asset: { id: asset.assetId, symbol: 'USDT', network: 'Ethereum' },
    address: '0x1111111111111111111111111111111111111111',
    tag: null,
    expiredAt: '2026-10-14T20:00:00.000Z',
    paymentLink: 'https://theypaid.io/pay/inv_123',
    txs: [],
  };
}

function fakeClient(overrides: Record<string, unknown> = {}) {
  const invoices = {
    create: vi.fn(async () => ({ ...invoice(), expiresAt: '2026-10-14T20:00:00.000Z' })),
    get: vi.fn(async () => invoice()),
    recheck: vi.fn(async () => ({ ok: true })),
    list: vi.fn(async () => ({ items: [], total: 0 })),
    poll: vi.fn(async () => invoice('PAID')),
    ...((overrides.invoices as object | undefined) ?? {}),
  };
  const store = {
    assets: vi.fn(async () => [asset]),
    ...((overrides.store as object | undefined) ?? {}),
  };
  return { invoices, store } as unknown as TheyPaidClient & { invoices: typeof invoices; store: typeof store };
}

describe('عملیات TheyPaid', () => {
  it('فقط اطلاعات عمومی دارایی‌های فعال را می‌گیرد و کلید کیف‌پول را برنمی‌گرداند', async () => {
    const client = fakeClient();
    const result = await listSupportedAssets(client);
    expect(result).toEqual([{ assetId: asset.assetId, symbol: asset.symbol, network: asset.network, priceUsdt: 1 }]);
    expect(JSON.stringify(result)).not.toContain('must-not-be-returned');
  });

  it('با SDK فاکتور و لینک واقعی پرداخت می‌سازد و فیلد اضافی نمی‌فرستد', async () => {
    const client = fakeClient();
    const params = {
      assetId: asset.assetId,
      amountInTether: 50,
      acceptToleranceInTether: 0,
      description: 'consulting',
    };
    const result = await createInvoice(client, params);
    expect(client.invoices.create).toHaveBeenCalledWith(params);
    expect(result.paymentLink).toBe('https://theypaid.io/pay/inv_123');
    expect(result.invoiceId).toBe('inv_123');
    expect(result).not.toHaveProperty('apiKey');
  });

  it.each(['PAID', 'WAITING', 'INSUFFICIENT', 'EXPIRED'])('reports %s only as returned by TheyPaid', async (status) => {
    const client = fakeClient({ invoices: { get: vi.fn(async () => invoice(status)) } });
    const result = await checkPayment(client, { invoiceId: 'inv_123' });
    expect(result.status).toBe(status);
    expect(result.confirmedByTheyPaid).toBe(status === 'PAID');
    if (status === 'WAITING') expect(result.paymentDetected).toBe(true);
  });

  it('دارایی و مبلغ موردانتظار را می‌سنجد و وضعیت گزارش‌شدهٔ API را تغییر نمی‌دهد', async () => {
    const client = fakeClient({ invoices: { get: vi.fn(async () => invoice('PAID')) } });
    const mismatch = await checkPayment(client, {
      invoiceId: 'inv_123',
      expectedAssetId: '00000000-0000-4000-8000-000000000000',
      expectedAmountInTether: 26,
    });
    expect(mismatch.status).toBe('PAID');
    expect(mismatch.expectedDetailsMatch).toBe(false);
    expect(mismatch.matchesExpectedPayment).toBe(false);

    const match = await checkPayment(client, {
      invoiceId: 'inv_123',
      expectedAssetId: asset.assetId,
      expectedAmountInTether: 25,
    });
    expect(match.expectedDetailsMatch).toBe(true);
    expect(match.matchesExpectedPayment).toBe(true);
  });

  it('بررسی تکراری پرداخت را فقط‌خواندنی نگه می‌دارد', async () => {
    const client = fakeClient({ invoices: { get: vi.fn(async () => invoice('PAID')) } });
    const first = await checkPayment(client, { invoiceId: 'inv_123' });
    const duplicate = await checkPayment(client, { invoiceId: 'inv_123' });
    expect(first.confirmedByTheyPaid).toBe(true);
    expect(duplicate.confirmedByTheyPaid).toBe(true);
    expect(client.invoices.get).toHaveBeenCalledTimes(2);
    expect(client.invoices.create).not.toHaveBeenCalled();
  });

  it('با متدهای SDK فاکتورهای فروشگاه را می‌خواند و فهرست می‌کند', async () => {
    const client = fakeClient();
    await getInvoice(client, 'inv_123');
    await listInvoices(client, { offset: 20, limit: 10 });
    expect(client.invoices.get).toHaveBeenCalledWith('inv_123');
    expect(client.invoices.list).toHaveBeenCalledWith({ offset: 20, limit: 10 });
  });

  it('از TheyPaid درخواست بررسی دوباره می‌کند و فاکتور به‌روز را می‌گیرد', async () => {
    const client = fakeClient();
    const result = await recheckInvoice(client, 'inv_123');
    expect(client.invoices.recheck).toHaveBeenCalledWith('inv_123');
    expect(client.invoices.get).toHaveBeenCalledWith('inv_123');
    expect(result.recheckAccepted).toBe(true);
  });

  it('وضعیت نهایی یا آخرین وضعیت پیش از پایان مهلت را برمی‌گرداند', async () => {
    const client = fakeClient();
    const paid = await waitForInvoice(client, { invoiceId: 'inv_123', intervalMs: 5000, timeoutMs: 10000 });
    expect(paid.timedOut).toBe(false);
    expect(paid.status).toBe('PAID');

    const timeoutClient = fakeClient({
      invoices: {
        poll: vi.fn(async () => { throw new TheyPaidPollTimeout(); }),
        get: vi.fn(async () => invoice('WAITING')),
      },
    });
    const timedOut = await waitForInvoice(timeoutClient, { invoiceId: 'inv_123', intervalMs: 5000, timeoutMs: 10000 });
    expect(timedOut.timedOut).toBe(true);
    expect(timedOut.status).toBe('WAITING');
    expect(timeoutClient.invoices.get).toHaveBeenCalledWith('inv_123');
  });
});
