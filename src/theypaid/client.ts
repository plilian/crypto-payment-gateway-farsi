import { TheyPaid } from 'theypaid-sdk';

export type TheyPaidClient = Pick<TheyPaid, 'invoices' | 'store'>;

export function createTheyPaidClient(apiKey: string): TheyPaidClient {
  return new TheyPaid({
    apiKey,
    timeout: 10_000,
    // SDK پس از خطای شبکه یا ۵xx درخواست POST را تکرار می‌کند. چون API عمومی
    // کلید جلوگیری از تکرار را مستند نکرده، فقط یک بار تلاش می‌کنیم.
    retries: 0,
    debug: false,
  });
}

export function readApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.THEYPAID_API_KEY?.trim();
  return value || undefined;
}

export function requireApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const apiKey = readApiKey(env);
  if (!apiKey) {
    throw new Error(
      'کلید API فروشگاه TheyPaid را در THEYPAID_API_KEY تنظیم کنید. کلید را در گفت‌وگو نفرستید.',
    );
  }
  return apiKey;
}
