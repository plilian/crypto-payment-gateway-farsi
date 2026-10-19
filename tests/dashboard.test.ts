import { describe, expect, it, vi } from 'vitest';
import { DASHBOARD_ACTIONS, TheyPaidDashboardClient } from '../src/theypaid/dashboard.js';

const EMAIL = 'merchant@example.test';
const PASSWORD = 'Never-return-this-password-1';
const TOKEN = 'private-access-token-fixture';
const STORE_ID = '6cf6d4c6-0228-48e1-82d9-aa8aafa2f76e';

function actionResponse(value: unknown): Response {
  return new Response(`1:${JSON.stringify(value)}\n`, {
    status: 200,
    headers: { 'content-type': 'text/x-component' },
  });
}

function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

describe('آداپتور داشبورد TheyPaid', () => {
  it('ثبت‌نام را انجام می‌دهد و اطلاعات ورود را در پاسخ برنمی‌گرداند', async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, init);
      expect(request.headers.get('next-action')).toBe(DASHBOARD_ACTIONS.signUp);
      const body = await request.text();
      expect(body).toContain(EMAIL);
      expect(body).toContain(PASSWORD);
      return actionResponse({ ok: true });
    });
    const dashboard = new TheyPaidDashboardClient({ email: EMAIL, password: PASSWORD, fetch: fetchImpl });

    const result = await dashboard.registerAccount();

    expect(result).toEqual({ submitted: true, email: EMAIL, emailVerificationRequired: true });
    expect(JSON.stringify(result)).not.toContain(PASSWORD);
  });

  it('نشست داشبورد را برقرار می‌کند، توکن را محرمانه نگه می‌دارد و اعتبار را می‌خواند', async () => {
    const seen: Array<{ path: string; cookie: string; action?: string; body?: string }> = [];
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      const url = requestUrl(input);
      const request = new Request(input, init);
      const text = request.method === 'POST' ? await request.clone().text() : undefined;
      seen.push({
        path: url.pathname,
        cookie: request.headers.get('cookie') ?? '',
        ...(request.headers.get('next-action') ? { action: request.headers.get('next-action')! } : {}),
        ...(text ? { body: text } : {}),
      });
      if (url.pathname === '/login') {
        return actionResponse({ ok: true, user: { token: TOKEN, email: EMAIL, accountActive: true } });
      }
      if (url.pathname === '/api/auth/csrf') {
        return Response.json({ csrfToken: 'csrf-fixture' }, { headers: { 'set-cookie': 'csrf-token=csrf-cookie; Path=/' } });
      }
      if (url.pathname === '/api/auth/callback/credentials-token') {
        return new Response('', { status: 302, headers: { 'set-cookie': 'session-token=session-cookie; Path=/; HttpOnly' } });
      }
      if (url.pathname === '/api/auth/session') return Response.json({ accessToken: TOKEN });
      if (request.headers.get('next-action') === DASHBOARD_ACTIONS.apiFetch) {
        return actionResponse({ ok: true, data: { balance: 10 } });
      }
      throw new Error(`Unexpected request ${request.method} ${url.pathname}`);
    });
    const dashboard = new TheyPaidDashboardClient({ email: EMAIL, password: PASSWORD, fetch: fetchImpl });

    const connected = await dashboard.connectAccount();
    const credit = await dashboard.getCreditBalance();

    expect(connected).toEqual({ connected: true, email: EMAIL, accountActive: true });
    expect(credit).toEqual({ balance: 10, unit: 'USDT', purpose: 'service-fee-credit' });
    expect(seen.find((item) => item.path === '/api/auth/session')?.cookie).toContain('session-token=session-cookie');
    expect(seen.find((item) => item.action === DASHBOARD_ACTIONS.apiFetch)?.body).toContain(TOKEN);
    expect(JSON.stringify({ connected, credit })).not.toContain(TOKEN);
    expect(JSON.stringify({ connected, credit })).not.toContain(PASSWORD);
  });

  it('خطای امن ورود را بدون نمایش گذرواژه یا پاسخ سرور برمی‌گرداند', async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => actionResponse({ ok: false, error: { description: 'password rejected: secret server detail' } }));
    const dashboard = new TheyPaidDashboardClient({ email: EMAIL, password: PASSWORD, fetch: fetchImpl });

    const error = await dashboard.connectAccount().catch((reason: unknown) => reason);
    expect(error).toMatchObject({ message: 'ورود به TheyPaid انجام نشد. تأیید ایمیل، فعال‌بودن حساب و درستی اطلاعات ورود را بررسی کنید.' });
    expect(JSON.stringify(error)).not.toContain(PASSWORD);
  });

  it('از عملیات فروشگاه لینک پرداخت با انقضای ۳۰ دقیقه‌ای می‌سازد', async () => {
    let submittedBody = '';
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, init);
      submittedBody = await request.text();
      expect(request.headers.get('next-action')).toBe(DASHBOARD_ACTIONS.createStoreInvoice);
      return actionResponse({ ok: true, data: { id: 'invoice_fixture', status: 'WAITING', amountInTether: 25 } });
    });
    const dashboard = new TheyPaidDashboardClient({ accessToken: TOKEN, fetch: fetchImpl });

    const invoice = await dashboard.createPaymentLink(
      STORE_ID,
      'bc6061b7-846a-4ca2-8c69-4b6515951fe2',
      25,
      'Consulting service',
    );

    expect(invoice).toMatchObject({
      id: 'invoice_fixture',
      status: 'WAITING',
      amountInTether: 25,
      paymentLink: 'https://pay.theypaid.io/invoice/invoice_fixture',
      expiresMins: 30,
    });
    expect(submittedBody).toContain('"acceptToleranceInTether":0');
    expect(submittedBody).toContain('"requiredConfirmations":0');
    expect(submittedBody).toContain('"expiresMins":30');
    expect(submittedBody).toContain('"description":"Consulting service"');
    expect(submittedBody).not.toContain(TOKEN);
    expect(JSON.stringify(invoice)).not.toContain(TOKEN);
  });

  it('مدیریت دارایی فروشگاه را از TheyPaid انجام می‌دهد و کد دومرحله‌ای را بازنمی‌گرداند', async () => {
    const codes: string[] = [];
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(input, init);
      const args = JSON.parse(await request.text()) as unknown[];
      const payload = args[0] as { code?: string };
      if (payload.code) codes.push(payload.code);
      return actionResponse({ ok: true, data: {} });
    });
    const dashboard = new TheyPaidDashboardClient({ accessToken: TOKEN, fetch: fetchImpl });

    await dashboard.setStoreAssetEnabled(STORE_ID, 'BTC', false, '123456');
    await dashboard.removeStoreAsset(STORE_ID, 'BTC', '654321');
    await dashboard.revokeStoreApiKey(STORE_ID, '112233');

    expect(codes).toEqual(['123456', '654321', '112233']);
    expect(JSON.stringify({ storeId: STORE_ID, asset: 'BTC' })).not.toMatch(/123456|654321|112233/);
  });
});
