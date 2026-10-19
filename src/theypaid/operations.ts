import {
  TheyPaidPollTimeout,
  type CreateInvoiceParams,
  type InvoiceDetails,
} from 'theypaid-sdk';
import type { TheyPaidClient } from './client.js';

export async function listSupportedAssets(client: TheyPaidClient) {
  const assets = await client.store.assets();
  return assets.map(({ assetId, symbol, network, priceUsdt }) => ({
    assetId,
    symbol,
    network,
    priceUsdt,
  }));
}

export async function createInvoice(
  client: TheyPaidClient,
  params: CreateInvoiceParams,
) {
  const invoice = await client.invoices.create(params);
  return {
    invoiceId: invoice.id,
    amountInTether: params.amountInTether,
    asset: {
      symbol: invoice.asset.symbol,
      network: invoice.asset.network,
    },
    amount: invoice.amount,
    address: invoice.address,
    tag: invoice.tag,
    expiresAt: invoice.expiresAt,
    status: invoice.status,
    paymentLink: invoice.paymentLink,
  };
}

export async function getInvoice(client: TheyPaidClient, invoiceId: string) {
  const invoice = await client.invoices.get(invoiceId);
  return invoiceSummary(invoice);
}

export async function checkPayment(
  client: TheyPaidClient,
  options: {
    invoiceId: string;
    expectedAssetId?: string;
    expectedAmountInTether?: number;
  },
) {
  const invoice = await client.invoices.get(options.invoiceId);
  const assetMatches = options.expectedAssetId
    ? invoice.asset.id === options.expectedAssetId
    : undefined;
  const amountMatches = options.expectedAmountInTether !== undefined
    ? Number(invoice.amountInTether) === options.expectedAmountInTether
    : undefined;
  const expectedChecks = [assetMatches, amountMatches].filter(
    (value): value is boolean => value !== undefined,
  );
  const expectedDetailsMatch = expectedChecks.length === 0
    ? undefined
    : expectedChecks.every(Boolean);
  return {
    invoiceId: invoice.id,
    status: invoice.status,
    paymentDetected: invoice.paymentDetected ?? false,
    paidAmount: invoice.paidAmount,
    amount: invoice.amount,
    amountInTether: invoice.amountInTether,
    asset: { assetId: invoice.asset.id, symbol: invoice.asset.symbol, network: invoice.asset.network },
    expectedAssetMatches: assetMatches,
    expectedAmountMatches: amountMatches,
    expectedDetailsMatch,
    // نتیجه از TheyPaid خوانده می‌شود؛ این عملیات سفارش را تکمیل نمی‌کند.
    confirmedByTheyPaid: invoice.status === 'PAID',
    matchesExpectedPayment: expectedDetailsMatch === undefined
      ? undefined
      : invoice.status === 'PAID' && expectedDetailsMatch,
  };
}

export async function listInvoices(
  client: TheyPaidClient,
  options: { offset: number; limit: number },
) {
  return client.invoices.list(options);
}

export async function recheckInvoice(client: TheyPaidClient, invoiceId: string) {
  const recheck = await client.invoices.recheck(invoiceId);
  const invoice = await client.invoices.get(invoiceId);
  return {
    recheckAccepted: recheck.ok,
    ...invoiceSummary(invoice),
  };
}

export async function waitForInvoice(
  client: TheyPaidClient,
  options: { invoiceId: string; intervalMs: number; timeoutMs: number },
) {
  try {
    const invoice = await client.invoices.poll(options.invoiceId, {
      interval: options.intervalMs,
      timeout: options.timeoutMs,
    });
    return { timedOut: false, ...invoiceSummary(invoice) };
  } catch (error) {
    if (!(error instanceof TheyPaidPollTimeout)) throw error;
    const latest = await client.invoices.get(options.invoiceId);
    return { timedOut: true, ...invoiceSummary(latest) };
  }
}

function invoiceSummary(invoice: InvoiceDetails) {
  return {
    invoiceId: invoice.id,
    status: invoice.status,
    paymentDetected: invoice.paymentDetected ?? false,
    amount: invoice.amount,
    amountInTether: invoice.amountInTether,
    paidAmount: invoice.paidAmount,
    asset: {
      assetId: invoice.asset.id,
      symbol: invoice.asset.symbol,
      network: invoice.asset.network,
    },
    address: invoice.address,
    tag: invoice.tag,
    expiresAt: invoice.expiredAt,
    paymentLink: invoice.paymentLink,
    txs: invoice.txs.map(({ txid, status, amount, confirmations }) => ({
      txid,
      status,
      amount,
      confirmations,
    })),
  };
}
