import {
  TheyPaidApiError,
  TheyPaidPollTimeout,
  TheyPaidTimeoutError,
} from 'theypaid-sdk';
import { TheyPaidDashboardError } from '../theypaid/dashboard.js';

export function safeErrorMessage(error: unknown): string {
  if (error instanceof TheyPaidDashboardError) return error.message;

  if (error instanceof Error) {
    const safeLocalMessages = new Set([
      'کلید API فروشگاه TheyPaid را در THEYPAID_API_KEY تنظیم کنید. کلید را در گفت‌وگو نفرستید.',
      'پیش از ساخت کیف‌پول، THEYPAID_WALLET_PASSWORD را در محیط امن سرور MCP تنظیم کنید. آن را در گفت‌وگو نفرستید.',
      'گذرواژهٔ THEYPAID_WALLET_PASSWORD باید دست‌کم 16 نویسه باشد.',
    ]);
    if (safeLocalMessages.has(error.message)) return error.message;
  }

  if (error instanceof TheyPaidApiError) {
    switch (error.statusCode) {
      case 400:
        return 'TheyPaid درخواست را نپذیرفت (HTTP 400). دارایی و فیلدهای فاکتور را بررسی کنید.';
      case 401:
      case 403:
        return `TheyPaid این کلید API فروشگاه را نپذیرفت (HTTP ${error.statusCode}). کلید را در داشبورد بررسی یا تعویض کنید.`;
      case 404:
        return 'TheyPaid فاکتور یا فروشگاه موردنظر را پیدا نکرد (HTTP 404). شناسه و فروشگاه را بررسی کنید.';
      case 429:
        return 'تعداد درخواست‌ها از محدودیت TheyPaid بیشتر شد (HTTP 429). کمی صبر کنید و دوباره تلاش کنید.';
      default:
        if (error.statusCode >= 500) {
          return `TheyPaid موقتاً در دسترس نیست (HTTP ${error.statusCode}).`;
        }
        return `درخواست به TheyPaid ناموفق بود (HTTP ${error.statusCode}).`;
    }
  }

  if (error instanceof TheyPaidTimeoutError) {
    return 'درخواست به TheyPaid بیش از حد طول کشید. پیش از تلاش دوباره برای ساخت فاکتور، فهرست فاکتورها را بررسی کنید.';
  }
  if (error instanceof TheyPaidPollTimeout) {
    return 'زمان انتظار تمام شد و فاکتور هنوز به وضعیت نهایی نرسیده است.';
  }

  // بدنهٔ پاسخ SDK یا متن دلخواه خطا را وارد بافت مدل نکن.
  return 'عملیات TheyPaid ناموفق بود. اتصال سرور و تنظیمات را بررسی کنید.';
}
