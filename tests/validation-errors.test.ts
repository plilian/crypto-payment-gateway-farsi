import { describe, expect, it } from 'vitest';
import {
  checkPaymentSchema,
  createInvoiceSchema,
  invoiceIdSchema,
  listInvoicesSchema,
  waitOptionsSchema,
} from '../src/shared/validation.js';
import { safeErrorMessage } from '../src/shared/errors.js';
import { TheyPaidApiError } from 'theypaid-sdk';

describe('اعتبارسنجی ورودی', () => {
  it('شناسهٔ UUID دارایی، مبلغ مثبت و تلورانس صریح را لازم می‌داند', () => {
    expect(createInvoiceSchema.safeParse({
      assetId: 'bc6061b7-846a-4ca2-8c69-4b6515951fe2',
      amountInTether: 10,
      acceptToleranceInTether: 0,
    }).success).toBe(true);
    expect(createInvoiceSchema.safeParse({ assetId: 'fake', amountInTether: -1 }).success).toBe(false);
  });

  it('شناسهٔ ناامن فاکتور و نشانی نامعتبر را رد می‌کند', () => {
    expect(invoiceIdSchema.safeParse('invoice/other-store').success).toBe(false);
    expect(createInvoiceSchema.safeParse({
      assetId: 'bc6061b7-846a-4ca2-8c69-4b6515951fe2',
      amountInTether: 10,
      acceptToleranceInTether: 1,
      redirectUrl: 'javascript:alert(1)',
    }).success).toBe(false);
  });

  it('برای صفحه‌بندی و زمان انتظار محدوده تعیین می‌کند', () => {
    expect(listInvoicesSchema.parse({})).toEqual({ offset: 0, limit: 20 });
    expect(listInvoicesSchema.safeParse({ offset: -1, limit: 101 }).success).toBe(false);
    expect(waitOptionsSchema.safeParse({ intervalMs: 100, timeoutMs: 1000 }).success).toBe(false);
  });

  it('انتخاب حساب یا کلید API را در ورودی فاکتور نمی‌پذیرد', () => {
    const parsed = createInvoiceSchema.safeParse({
      assetId: 'bc6061b7-846a-4ca2-8c69-4b6515951fe2',
      amountInTether: 10,
      acceptToleranceInTether: 0,
      merchantId: 'different-merchant',
      apiKey: 'never-in-tool-input',
    });
    expect(parsed.success).toBe(false);
  });

  it('فیلدهای اختیاری پرداخت موردانتظار را اعتبارسنجی می‌کند', () => {
    expect(checkPaymentSchema.safeParse({ invoiceId: 'inv_1', expectedAmountInTether: 0 }).success).toBe(false);
  });
});

describe('پیام‌های خطای امن', () => {
  it('متن دلخواه خطای API یا اطلاعات محرمانه را منتقل نمی‌کند', () => {
    expect(safeErrorMessage(new Error('apiKey=secret-value response body'))).toBe(
      'عملیات TheyPaid ناموفق بود. اتصال سرور و تنظیمات را بررسی کنید.',
    );
  });

  it('برای اعتبارنامهٔ نامعتبر فروشگاه پیام امن و کاربردی می‌سازد', () => {
    const apiError = new TheyPaidApiError('key=do-not-leak', 401, { apiKey: 'do-not-leak' });
    expect(safeErrorMessage(apiError)).toBe(
      'TheyPaid این کلید API فروشگاه را نپذیرفت (HTTP 401). کلید را در داشبورد بررسی یا تعویض کنید.',
    );
    expect(safeErrorMessage(apiError)).not.toContain('do-not-leak');
  });

  it('خطای سرویس را بدون نمایش محتوای پاسخ گزارش می‌کند', () => {
    const apiError = new TheyPaidApiError('private server response', 503, { trace: 'secret' });
    expect(safeErrorMessage(apiError)).toBe('TheyPaid موقتاً در دسترس نیست (HTTP 503).');
  });
});
