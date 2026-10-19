import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import { TheyPaidApiError } from 'theypaid-sdk';
import { createMcpServer } from '../mcp/server.js';
import type { TheyPaidClient } from '../src/theypaid/client.js';
import type { TheyPaidDashboardClient } from '../src/theypaid/dashboard.js';

describe('پروتکل MCP', () => {
  it('ابزارها را معرفی و عملیات دارایی TheyPaid را از طریق MCP اجرا می‌کند', async () => {
    const walletDirectory = await mkdtemp(join(tmpdir(), 'theypaid-mcp-wallet-test-'));
    const apiClient = {
      invoices: {
        create: vi.fn(),
        get: vi.fn(),
        recheck: vi.fn(),
        list: vi.fn(),
        poll: vi.fn(),
      },
      store: {
        assets: vi.fn(async () => [{
          assetId: 'bc6061b7-846a-4ca2-8c69-4b6515951fe2',
        symbol: 'BTC',
        network: 'Bitcoin',
          priceUsdt: 1,
          addressOrPubkey: 'private-store-configuration',
        }]),
      },
    } as unknown as TheyPaidClient;
    const server = createMcpServer({
      client: apiClient,
      walletPassword: 'a-strong-test-password-123',
      walletDirectory,
    });
    const client = new Client({ name: 'theypaid-test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const listed = await client.listTools();
      expect(listed.tools.map(({ name }) => name)).toContain('theypaid_create_invoice');
      expect(listed.tools.map(({ name }) => name)).toContain('theypaid_validate_wallet');
      expect(listed.tools.map(({ name }) => name)).toContain('theypaid_create_payment_link');
      expect(listed.tools.map(({ name }) => name)).toContain('theypaid_connect_wallet');
      const result = await client.callTool({
        name: 'theypaid_get_supported_assets',
        arguments: {},
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual({
        items: [{
          assetId: 'bc6061b7-846a-4ca2-8c69-4b6515951fe2',
          symbol: 'BTC',
          network: 'Bitcoin',
          priceUsdt: 1,
        }],
      });
      expect(JSON.stringify(result)).not.toContain('private-store-configuration');

      const wallet = await client.callTool({
        name: 'theypaid_validate_wallet',
        arguments: { asset: 'ETH', publicValue: '0x000000000000000000000000000000000000dEaD' },
      });
      expect(wallet.isError).not.toBe(true);
      expect(wallet.structuredContent).toMatchObject({ asset: 'ETH', valid: true, registration: 'use_theypaid_connect_wallet_after_user_approval' });

      const createdWallet = await client.callTool({
        name: 'theypaid_create_wallet',
        arguments: { asset: 'ETH' },
      });
      expect(createdWallet.isError).not.toBe(true);
      expect(createdWallet.structuredContent).toMatchObject({ asset: 'ETH', walletFormat: 'address' });
      expect(createdWallet.structuredContent).not.toHaveProperty('mnemonic');
      expect(createdWallet.structuredContent).not.toHaveProperty('privateKey');
      const unsupportedWallet = await client.callTool({ name: 'theypaid_create_wallet', arguments: { asset: 'SOL' } });
      expect(unsupportedWallet.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
      await rm(walletDirectory, { recursive: true, force: true });
    }
  });

  it('اطلاعات نامعتبر فروشگاه را در مرز MCP پاک‌سازی می‌کند', async () => {
    const apiClient = {
      invoices: { create: vi.fn(), get: vi.fn(), recheck: vi.fn(), list: vi.fn(), poll: vi.fn() },
      store: { assets: vi.fn(async () => { throw new TheyPaidApiError('apiKey=private-test-key', 401, { apiKey: 'private-test-key' }); }) },
    } as unknown as TheyPaidClient;
    const server = createMcpServer({ client: apiClient });
    const client = new Client({ name: 'theypaid-invalid-key-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({ name: 'theypaid_check_connection', arguments: {} });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain('HTTP 401');
      expect(JSON.stringify(result)).not.toContain('private-test-key');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('پیش از ساخت فاکتور، شناسهٔ دارایی را با فروشگاه فعال تطبیق می‌دهد', async () => {
    const invoices = { create: vi.fn(), get: vi.fn(), recheck: vi.fn(), list: vi.fn(), poll: vi.fn() };
    const apiClient = {
      invoices,
      store: { assets: vi.fn(async () => [{ assetId: 'bc6061b7-846a-4ca2-8c69-4b6515951fe2', symbol: 'BTC', network: 'Bitcoin', priceUsdt: 1 }]) },
    } as unknown as TheyPaidClient;
    const server = createMcpServer({ client: apiClient });
    const client = new Client({ name: 'theypaid-asset-guard-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({
        name: 'theypaid_create_invoice',
        arguments: {
          assetId: '00000000-0000-4000-8000-000000000000',
          amountInTether: 25,
          acceptToleranceInTether: 0,
        },
      });
      expect(result.isError).toBe(true);
      expect(invoices.create).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('کلید API فروشگاه را به فراخوانندهٔ MCP برنمی‌گرداند', async () => {
    const secret = 'theypaid-private-store-api-key-fixture';
    const dashboard = {
      selectedStoreId: undefined,
      listStores: vi.fn(async () => [{ id: '6cf6d4c6-0228-48e1-82d9-aa8aafa2f76e', name: 'Merchant test store' }]),
      createStoreApiKeySecret: vi.fn(async () => ({ apiKey: secret, mask: 'tp_****abcd' })),
      selectStore: vi.fn(),
    } as unknown as TheyPaidDashboardClient;
    const server = createMcpServer({ dashboard });
    const client = new Client({ name: 'theypaid-key-redaction-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({
        name: 'theypaid_create_store_api_key',
        arguments: { storeId: '6cf6d4c6-0228-48e1-82d9-aa8aafa2f76e' },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ mask: 'tp_****abcd', activeForThisMcpSession: true });
      expect(JSON.stringify(result)).not.toContain(secret);
      expect(dashboard.createStoreApiKeySecret).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('پیش از خواندن تنظیمات، فروشگاه متعلق به حساب دیگر را رد می‌کند', async () => {
    const ownedStoreId = '6cf6d4c6-0228-48e1-82d9-aa8aafa2f76e';
    const dashboard = {
      listStores: vi.fn(async () => [{ id: ownedStoreId, name: 'Owned store' }]),
      getStore: vi.fn(),
    } as unknown as TheyPaidDashboardClient;
    const server = createMcpServer({ dashboard });
    const client = new Client({ name: 'theypaid-cross-store-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({
        name: 'theypaid_get_store',
        arguments: { storeId: '7eacf2f6-89dc-4956-a4d2-221c5dc55e87' },
      });
      expect(result.isError).toBe(true);
      expect(dashboard.getStore).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('فقط با تأیید صریح برای دارایی فعال فروشگاه لینک پرداخت می‌سازد', async () => {
    const dashboard = {
      listStores: vi.fn(async () => [{ id: '6cf6d4c6-0228-48e1-82d9-aa8aafa2f76e', name: 'Merchant test store' }]),
      getStoreAssets: vi.fn(async () => [{ assetId: 'bc6061b7-846a-4ca2-8c69-4b6515951fe2', symbol: 'BTC', network: 'Bitcoin', available: true }]),
      createPaymentLink: vi.fn(async () => ({ id: 'invoice_fixture', paymentLink: 'https://pay.theypaid.io/invoice/invoice_fixture' })),
    } as unknown as TheyPaidDashboardClient;
    const server = createMcpServer({ dashboard });
    const client = new Client({ name: 'theypaid-payment-link-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const args = {
        storeId: '6cf6d4c6-0228-48e1-82d9-aa8aafa2f76e',
        assetId: 'bc6061b7-846a-4ca2-8c69-4b6515951fe2',
        amountInTether: 25,
        confirm: true,
      };
      const result = await client.callTool({ name: 'theypaid_create_payment_link', arguments: args });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ paymentLink: 'https://pay.theypaid.io/invoice/invoice_fixture' });
      expect(dashboard.createPaymentLink).toHaveBeenCalledWith(args.storeId, args.assetId, 25, undefined);
      const unapproved = await client.callTool({ name: 'theypaid_create_payment_link', arguments: { ...args, confirm: false } });
      expect(unapproved.isError).toBe(true);
      expect(dashboard.createPaymentLink).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await server.close();
    }
  });
});
