import { getTheyPaidAsset, THEYPAID_ASSET_CATALOG } from './catalog.js';
import type { TheyPaidAsset } from '../wallet/wallet.js';

const DASHBOARD_ORIGIN = 'https://dashboard.theypaid.io';

// این شناسه‌ها، Server Actionهای فعلی داشبوردند که در بستهٔ عمومی سمت کاربر
// و درخواست‌های ۲۰۲۶/۱۰/۱۵ مشاهده شدند. این‌ها API منتشرشده نیستند.
export const DASHBOARD_ACTIONS = {
  apiFetch: '60f6285d9f5e6ff5e3642083f2a2ab7d5141654f56',
  login: '40aab13487d589e48fff829ef50bf5029862c06551',
  verifyLogin2FA: '600634ad08128bb2a4098eb9ce31eebb3a3cabc2e0',
  signUp: '4080c2080078fb7bc06ba68f0da14bd94232258615',
  validateWallet: '408ceb4ddef58946c627b9b28fc79108a5f29909c0',
  addStoreAsset: '40ef4526f3904e3c5bd1d2e6467294f023cebbc4f8',
  setStoreAsset: '40ef4526f3904e3c5bd1d2e6467294f023cebbc4f8',
  removeStoreAsset: '40829f4a5654e3a391bdd8205a80d20ecaef626b02',
  disableStoreAsset: '403b474734644e80ad1af24c94f6471e1d85e1d2dc',
  enableStoreAsset: '40f5a8eec6a1e3c4adb854b773f4d012e0c4be7ad0',
  createStoreInvoice: '40e3b02c1e4f1b8175b4426749a265e6c8305b8564',
  revokeStoreApiKey: '40692081a7b7d8cb5f6ab8071bb5d6093e3a35f005',
  activateStore: '40fc16c65b2d4ef73f04f7cc2ca770d35cd4ffedb4',
  deactivateStore: '406fe5a4883e33be553f4b61c785ae71a4f9a3cf18',
  deleteStore: '70fdf2b5abf8434650fbf993bf3116ed3ec80ab00',
  recheckInvoice: '60f6f3c19e32081a74adc72d2fa399cee289f52111',
  createStoreApiKey: '406e70224650b318ceae288e31e34d2e94c038c1fa',
  storeApiKeyMask: '40681aece2f950cd7ee7c9f1c4bc45f1245181ff5b',
  createCreditInvoice: '4077845396ecb404526b206544fa6afe01d0fdc56e',
} as const;

type JsonObject = Record<string, unknown>;
type FetchLike = typeof fetch;

export interface DashboardClientOptions {
  email?: string | undefined;
  password?: string | undefined;
  accessToken?: string | undefined;
  twoFactorCode?: string | undefined;
  baseUrl?: string | undefined;
  fetch?: FetchLike | undefined;
}

export interface DashboardStore {
  id: string;
  name: string;
  website?: string | null | undefined;
  industry?: string | null | undefined;
  description?: string | null | undefined;
  active?: boolean | undefined;
  createdAt?: string | undefined;
  assets?: Array<{
    assetId: string;
    symbol: string;
    network: string;
    type?: string | undefined;
    available?: boolean | undefined;
  }> | undefined;
  availableAssetIds?: string[] | undefined;
}

export interface AccountConnectionResult {
  connected: boolean;
  email?: string;
  needsTwoFactor?: boolean;
  accountActive?: boolean;
}

export class TheyPaidDashboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TheyPaidDashboardError';
  }
}

/**
 * آداپتور عملیات حساب و فروشگاه از طریق داشبورد احراز هویت‌شده.
 * کوکی مرورگر را نمی‌خواند؛ ورود با اطلاعات ارائه‌شده انجام می‌شود و
 * نشست تازهٔ داشبورد با NextAuth برقرار می‌گردد.
 */
export class TheyPaidDashboardClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly cookies = new Map<string, string>();
  private accessToken: string | undefined;
  private email: string | undefined;
  private accountPassword: string | undefined;
  private pendingTwoFactorToken: string | undefined;
  private pendingUser: JsonObject | undefined;
  private authenticated = false;
  private activeStoreId: string | undefined;
  private twoFactorCode: string | undefined;

  constructor(options: DashboardClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DASHBOARD_ORIGIN).replace(/\/$/, '');
    this.fetchImpl = options.fetch ?? fetch;
    this.email = options.email?.trim().toLowerCase() || undefined;
    this.accountPassword = options.password || undefined;
    this.accessToken = options.accessToken || undefined;
    this.authenticated = Boolean(this.accessToken);
    this.twoFactorCode = options.twoFactorCode;
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): TheyPaidDashboardClient {
    return new TheyPaidDashboardClient({
      ...(env.THEYPAID_ACCOUNT_EMAIL ? { email: env.THEYPAID_ACCOUNT_EMAIL } : {}),
      ...(env.THEYPAID_ACCOUNT_PASSWORD ? { password: env.THEYPAID_ACCOUNT_PASSWORD } : {}),
      ...(env.THEYPAID_ACCESS_TOKEN ? { accessToken: env.THEYPAID_ACCESS_TOKEN } : {}),
      ...(env.THEYPAID_2FA_CODE ? { twoFactorCode: env.THEYPAID_2FA_CODE } : {}),
    });
  }

  get selectedStoreId(): string | undefined {
    return this.activeStoreId;
  }

  selectStore(storeId: string | undefined): void {
    this.activeStoreId = storeId;
  }

  clear(): void {
    this.accessToken = undefined;
    this.email = undefined;
    this.accountPassword = undefined;
    this.twoFactorCode = undefined;
    this.pendingTwoFactorToken = undefined;
    this.pendingUser = undefined;
    this.authenticated = false;
    this.activeStoreId = undefined;
    this.cookies.clear();
  }

  async registerAccount(): Promise<{ submitted: boolean; email?: string; emailVerificationRequired: true }> {
    const { email, password } = this.requireCredentials();
    const result = await this.callAction(DASHBOARD_ACTIONS.signUp, [{ email, password }], '/register');
    if (result.ok !== true) {
      throw new TheyPaidDashboardError('TheyPaid درخواست ثبت‌نام را نپذیرفت. ایمیل و شرایط گذرواژه را بررسی کنید.');
    }
    return { submitted: true, ...(email ? { email } : {}), emailVerificationRequired: true };
  }

  async connectAccount(twoFactorCode?: string): Promise<AccountConnectionResult> {
    if (this.accessToken && !this.accountPassword) {
      this.authenticated = true;
      return { connected: true, ...(this.email ? { email: this.email } : {}) };
    }

    const { email, password } = this.requireCredentials();
    const result = await this.callAction(DASHBOARD_ACTIONS.login, [{ email, password }], '/login');
    if (result.ok !== true) {
      const user = isObject(result.user) ? result.user : {};
      const tempToken = stringValue(user.tempToken) || stringValue(result.tempToken);
      if (tempToken) {
        this.pendingTwoFactorToken = tempToken;
        this.pendingUser = user;
        const code = twoFactorCode || this.twoFactorCode;
        if (code) return this.completeTwoFactor(code);
        return { connected: false, needsTwoFactor: true, email };
      }
      throw new TheyPaidDashboardError('ورود به TheyPaid انجام نشد. تأیید ایمیل، فعال‌بودن حساب و درستی اطلاعات ورود را بررسی کنید.');
    }

    const user = isObject(result.user) ? result.user : isObject(result.data) ? result.data : {};
    const auth = readAuthTokens(user);
    if (!auth.token) {
      const tempToken = stringValue(user.tempToken) || stringValue(result.tempToken);
      if (tempToken) {
        this.pendingTwoFactorToken = tempToken;
        this.pendingUser = user;
        const code = twoFactorCode || this.twoFactorCode;
        if (code) return this.completeTwoFactor(code);
        return { connected: false, needsTwoFactor: true, email };
      }
      throw new TheyPaidDashboardError('ورود به TheyPaid بدون توکن دسترسی کامل شد. ممکن است فرایند احراز هویت داشبورد تغییر کرده باشد.');
    }
    await this.establishDashboardSession(auth.token, auth.user);
    this.accessToken = auth.token;
    this.authenticated = true;
    this.email = email;
    this.twoFactorCode = undefined;
    const accountActive = booleanValue(auth.user.accountActive);
    return { connected: true, email, ...(accountActive === undefined ? {} : { accountActive }) };
  }

  async completeTwoFactor(code: string): Promise<AccountConnectionResult> {
    if (!this.pendingTwoFactorToken) {
      throw new TheyPaidDashboardError('ورود دومرحله‌ای معلقی برای TheyPaid وجود ندارد. اتصال حساب را دوباره آغاز کنید.');
    }
    if (!/^\d{6}$/.test(code.trim())) {
      throw new TheyPaidDashboardError('کد شش‌رقمی ورود دومرحله‌ای TheyPaid را وارد کنید.');
    }
    const result = await this.callAction(
      DASHBOARD_ACTIONS.verifyLogin2FA,
      [this.pendingTwoFactorToken, code.trim()],
      '/login',
    );
    if (result.error || result.ok === false) {
      throw new TheyPaidDashboardError('TheyPaid کد دومرحله‌ای را نپذیرفت. اتصال حساب را دوباره آغاز و کد تازه‌ای وارد کنید.');
    }
    const auth = readAuthTokens(result);
    if (!auth.token) {
      throw new TheyPaidDashboardError('پاسخ تأیید دومرحله‌ای TheyPaid توکن دسترسی نداشت.');
    }
    await this.establishDashboardSession(auth.token, auth.user);
    this.accessToken = auth.token;
    this.authenticated = true;
    this.twoFactorCode = undefined;
    this.pendingTwoFactorToken = undefined;
    this.pendingUser = undefined;
    return { connected: true, ...(this.email ? { email: this.email } : {}) };
  }

  async listStores(): Promise<DashboardStore[]> {
    const value = await this.apiFetch<unknown>('/store/list', 'GET');
    if (!Array.isArray(value)) throw new TheyPaidDashboardError('قالب فهرست فروشگاه‌های برگشتی از TheyPaid قابل انتظار نبود.');
    return value.map(parseStore);
  }

  async getStore(storeId: string): Promise<DashboardStore> {
    return parseStore(await this.apiFetch<unknown>(`/store/${encodeURIComponent(storeId)}`, 'GET'));
  }

  async createStore(input: { name: string; website?: string; industry?: string; description?: string }): Promise<DashboardStore> {
    const store = parseStore(await this.apiFetch<unknown>('/store', 'POST', {
      name: input.name,
      website: input.website ?? '',
      industry: input.industry ?? '',
      description: input.description ?? '',
    }));
    this.activeStoreId = store.id;
    return store;
  }

  async updateStore(storeId: string, patch: { name?: string; website?: string; industry?: string; description?: string }): Promise<DashboardStore> {
    const current = await this.getStore(storeId);
    const body = {
      name: patch.name ?? current.name,
      website: patch.website ?? current.website ?? '',
      industry: patch.industry ?? current.industry ?? '',
      description: patch.description ?? current.description ?? '',
    };
    await this.apiFetch<unknown>(`/store/${encodeURIComponent(storeId)}`, 'POST', body);
    return this.getStore(storeId);
  }

  async getStoreAssets(storeId: string): Promise<Array<{ assetId: string; symbol: string; network: string; type?: string; available?: boolean }>> {
    const value = await this.apiFetch<unknown>(`/store/${encodeURIComponent(storeId)}/assets`, 'GET');
    if (!Array.isArray(value)) throw new TheyPaidDashboardError('قالب فهرست دارایی‌های فروشگاه برگشتی از TheyPaid قابل انتظار نبود.');
    return value.filter(isObject).map((asset) => ({
      assetId: stringValue(asset.assetId) ?? '',
      symbol: stringValue(asset.symbol) ?? '',
      network: stringValue(asset.network) ?? '',
      ...(stringValue(asset.type) ? { type: stringValue(asset.type)! } : {}),
      ...(typeof asset.available === 'boolean' ? { available: asset.available } : {}),
    }));
  }

  async getCreditBalance(): Promise<{ balance: number; unit: 'USDT'; purpose: 'service-fee-credit' }> {
    const result = await this.apiFetch<unknown>('/credit/balance', 'GET');
    if (!isObject(result) || typeof result.balance !== 'number' || !Number.isFinite(result.balance)) {
      throw new TheyPaidDashboardError('قالب موجودی اعتبار خدماتی برگشتی از TheyPaid قابل انتظار نبود.');
    }
    return { balance: result.balance, unit: 'USDT', purpose: 'service-fee-credit' };
  }

  async validateStoreWallet(storeId: string, asset: TheyPaidAsset, addressOrPubkey: string): Promise<{ valid: boolean; firstAddresses: string[] }> {
    const item = getTheyPaidAsset(asset);
    const result = await this.callAction(DASHBOARD_ACTIONS.validateWallet, [{
      assetId: item.assetId,
      addressOrPubkey,
      authToken: await this.requireAccessToken(),
    }], `/store/${encodeURIComponent(storeId)}/setup`);
    if (result.ok !== true || !isObject(result.data)) {
      return { valid: false, firstAddresses: [] };
    }
    const firstAddresses = Array.isArray(result.data.firstAddresses)
      ? result.data.firstAddresses.filter((value): value is string => typeof value === 'string').slice(0, 5)
      : [];
    return { valid: true, firstAddresses };
  }

  async addStoreWallet(storeId: string, asset: TheyPaidAsset, addressOrPubkey: string): Promise<void> {
    const item = getTheyPaidAsset(asset);
    const result = await this.callAction(DASHBOARD_ACTIONS.addStoreAsset, [{
      storeId,
      assetId: item.assetId,
      addressOrPubkey,
      authToken: await this.requireAccessToken(),
    }], `/store/${encodeURIComponent(storeId)}/setup`);
    if (result.ok !== true) {
      throw new TheyPaidDashboardError('TheyPaid این دارایی را به فروشگاه انتخاب‌شده اضافه نکرد. اطلاعات عمومی کیف‌پول و تنظیمات فروشگاه را بررسی کنید.');
    }
  }

  async updateStoreWallet(storeId: string, asset: TheyPaidAsset, addressOrPubkey: string, code?: string): Promise<{ firstAddresses: string[] }> {
    const item = getTheyPaidAsset(asset);
    const validation = await this.validateStoreWallet(storeId, asset, addressOrPubkey);
    if (!validation.valid) throw new TheyPaidDashboardError('TheyPaid اطلاعات عمومی این کیف‌پول را برای دارایی انتخاب‌شده نپذیرفت.');
    const result = await this.callAction(DASHBOARD_ACTIONS.setStoreAsset, [{
      storeId,
      assetId: item.assetId,
      addressOrPubkey,
      authToken: await this.requireAccessToken(),
      ...(code ? { code } : {}),
      update: true,
    }], `/store/${encodeURIComponent(storeId)}`);
    if (result.ok !== true) throw new TheyPaidDashboardError('TheyPaid نشانی دریافت این دارایی فروشگاه را به‌روز نکرد.');
    return { firstAddresses: validation.firstAddresses };
  }

  async setStoreAssetEnabled(storeId: string, asset: TheyPaidAsset, enabled: boolean, code?: string): Promise<void> {
    const item = getTheyPaidAsset(asset);
    const actionId = enabled ? DASHBOARD_ACTIONS.enableStoreAsset : DASHBOARD_ACTIONS.disableStoreAsset;
    const result = await this.callAction(actionId, [{
      storeId,
      assetId: item.assetId,
      authToken: await this.requireAccessToken(),
      ...(code ? { code } : {}),
    }], `/store/${encodeURIComponent(storeId)}`);
    if (result.ok !== true) throw new TheyPaidDashboardError(`TheyPaid ${enabled ? 'این دارایی فروشگاه را فعال نکرد' : 'این دارایی فروشگاه را غیرفعال نکرد'}.`);
  }

  async removeStoreAsset(storeId: string, asset: TheyPaidAsset, code?: string): Promise<void> {
    const item = getTheyPaidAsset(asset);
    const result = await this.callAction(DASHBOARD_ACTIONS.removeStoreAsset, [{
      storeId,
      assetId: item.assetId,
      authToken: await this.requireAccessToken(),
      ...(code ? { code } : {}),
    }], `/store/${encodeURIComponent(storeId)}`);
    if (result.ok !== true) throw new TheyPaidDashboardError('TheyPaid این دارایی را از فروشگاه حذف نکرد.');
  }

  async revokeStoreApiKey(storeId: string, code?: string): Promise<void> {
    const result = await this.callAction(DASHBOARD_ACTIONS.revokeStoreApiKey, [{
      storeId,
      authToken: await this.requireAccessToken(),
      ...(code ? { code } : {}),
    }], `/store/${encodeURIComponent(storeId)}`);
    if (result.ok !== true) throw new TheyPaidDashboardError('TheyPaid کلید API فروشگاه را لغو نکرد.');
  }

  async setStoreActive(storeId: string, active: boolean, code?: string): Promise<void> {
    const result = await this.callAction(active ? DASHBOARD_ACTIONS.activateStore : DASHBOARD_ACTIONS.deactivateStore, [{
      storeId,
      authToken: await this.requireAccessToken(),
      ...(code ? { code } : {}),
    }], `/store/${encodeURIComponent(storeId)}`);
    if (result.ok !== true) throw new TheyPaidDashboardError(`TheyPaid ${active ? 'فروشگاه را فعال نکرد' : 'فروشگاه را غیرفعال نکرد'}.`);
  }

  async deleteStore(storeId: string, code?: string): Promise<void> {
    const result = await this.callAction(DASHBOARD_ACTIONS.deleteStore, [{
      storeId,
      authToken: await this.requireAccessToken(),
      ...(code ? { code } : {}),
    }], `/store/${encodeURIComponent(storeId)}`);
    if (result.ok !== true) throw new TheyPaidDashboardError('TheyPaid فروشگاه را حذف نکرد.');
  }

  /** کلید یک‌بارمصرف را فقط به کد مورداعتماد همین فرایند می‌دهد؛ فراخوان MCP آن را دریافت نمی‌کند. */
  async createStoreApiKeySecret(storeId: string): Promise<{ apiKey: string; mask: string }> {
    const result = await this.callAction(DASHBOARD_ACTIONS.createStoreApiKey, [{
      storeId,
      authToken: await this.requireAccessToken(),
    }], `/store/${encodeURIComponent(storeId)}`);
    const key = isObject(result.data) ? stringValue(result.data.apiKey) : undefined;
    if (result.ok !== true || !key) throw new TheyPaidDashboardError('TheyPaid کلید API فروشگاه را نساخت.');
    const maskResult = await this.callAction(DASHBOARD_ACTIONS.storeApiKeyMask, [{
      storeId,
      authToken: await this.requireAccessToken(),
    }], `/store/${encodeURIComponent(storeId)}`).catch(() => ({} as JsonObject));
    const mask = isObject(maskResult.data) ? stringValue(maskResult.data.mask) : undefined;
    return { apiKey: key, mask: mask ?? `${key.slice(0, 4)}…${key.slice(-4)}` };
  }

  async createCreditTopupInvoice(amountInTether: number, asset: TheyPaidAsset): Promise<JsonObject> {
    const item = getTheyPaidAsset(asset);
    const result = await this.callAction(DASHBOARD_ACTIONS.createCreditInvoice, [{
      amountInTether,
      assetId: item.assetId,
      authToken: await this.requireAccessToken(),
    }], '/billing');
    if (result.ok !== true || !isObject(result.data)) {
      throw new TheyPaidDashboardError('TheyPaid فاکتور شارژ اعتبار خدماتی را نساخت.');
    }
    return filterInvoice(result.data);
  }

  async createPaymentLink(storeId: string, assetId: string, amountInTether: number, description?: string): Promise<JsonObject> {
    const result = await this.callAction(DASHBOARD_ACTIONS.createStoreInvoice, [{
      storeId,
      assetId,
      amountInTether,
      acceptToleranceInTether: 0,
      requiredConfirmations: 0,
      expiresMins: 30,
      ...(description?.trim() ? { description: description.trim() } : {}),
    }], `/store/${encodeURIComponent(storeId)}`);
    if (result.ok !== true || !isObject(result.data) || !stringValue(result.data.id)) {
      throw new TheyPaidDashboardError('TheyPaid فاکتور لینک پرداخت فروشگاه را نساخت.');
    }
    return {
      ...filterInvoice(result.data),
      paymentLink: `https://pay.theypaid.io/invoice/${encodeURIComponent(stringValue(result.data.id)!)}`,
      expiresMins: 30,
    };
  }

  async recheckAccountInvoice(invoiceId: string): Promise<JsonObject> {
    const result = await this.callAction(DASHBOARD_ACTIONS.recheckInvoice, [invoiceId], '/invoice');
    if (result.ok !== true || !isObject(result.data)) {
      throw new TheyPaidDashboardError('TheyPaid وضعیت به‌روزشدهٔ فاکتور را برنگرداند.');
    }
    return filterInvoice(result.data);
  }

  async apiFetch<T>(path: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: JsonObject): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('..')) {
      throw new TheyPaidDashboardError('مسیر درخواست API داشبورد TheyPaid معتبر نیست.');
    }
    const request: JsonObject = {
      method,
      authToken: await this.requireAccessToken(),
      ...(body ? { body } : {}),
    };
    const result = await this.callAction(DASHBOARD_ACTIONS.apiFetch, [path, request], '/store');
    if (result.ok !== true) {
      const status = typeof result.status === 'number' ? ` (HTTP ${result.status})` : '';
      throw new TheyPaidDashboardError(`درخواست داشبورد TheyPaid ناموفق بود${status}.`);
    }
    return result.data as T;
  }

  private async requireAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    if (this.email && this.accountPassword) {
      const result = await this.connectAccount();
      if (result.connected && this.accessToken) return this.accessToken;
      if (result.needsTwoFactor) {
        throw new TheyPaidDashboardError('TheyPaid تأیید دومرحله‌ای می‌خواهد. با کد شش‌رقمی تازه آن را تکمیل کنید.');
      }
    }
    throw new TheyPaidDashboardError('ابتدا با تنظیم THEYPAID_ACCOUNT_EMAIL و THEYPAID_ACCOUNT_PASSWORD به حساب TheyPaid وصل شوید.');
  }

  private requireCredentials(): { email: string; password: string } {
    if (!this.email || !this.accountPassword) {
      throw new TheyPaidDashboardError('THEYPAID_ACCOUNT_EMAIL و THEYPAID_ACCOUNT_PASSWORD را در محیط امن فرایند MCP تنظیم کنید. گذرواژه را در گفت‌وگو ننویسید.');
    }
    return { email: this.email, password: this.accountPassword };
  }

  private async establishDashboardSession(token: string, user: JsonObject): Promise<void> {
    const csrfResponse = await this.request('/api/auth/csrf', { method: 'GET' });
    if (!csrfResponse.ok) throw new TheyPaidDashboardError('شروع نشست داشبورد TheyPaid ممکن نشد.');
    const csrfData = await csrfResponse.json() as JsonObject;
    const csrfToken = stringValue(csrfData.csrfToken);
    if (!csrfToken) throw new TheyPaidDashboardError('TheyPaid توکن نشست داشبورد را برنگرداند.');

    const form = new URLSearchParams({
      csrfToken,
      token,
      refreshToken: stringValue(user.refreshToken) ?? '',
      expiresAt: String(user.expiresAt ?? ''),
      email: stringValue(user.email) ?? this.email ?? '',
      enabled2FA: String(user.enabled2FA ?? false),
      createdAt: stringValue(user.createdAt) ?? '',
      accountActive: String(user.accountActive ?? true),
      redirect: 'false',
      callbackUrl: `${this.baseUrl}/overview`,
      json: 'true',
    });
    const callback = await this.request('/api/auth/callback/credentials-token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: this.baseUrl,
        referer: `${this.baseUrl}/login`,
      },
      body: form.toString(),
      redirect: 'manual',
    });
    if (callback.status < 200 || callback.status >= 400) {
      throw new TheyPaidDashboardError('برقراری نشست احراز هویت‌شدهٔ داشبورد TheyPaid ممکن نشد.');
    }
    await callback.arrayBuffer();
    const sessionResponse = await this.request('/api/auth/session', { method: 'GET' });
    const session = sessionResponse.ok ? await sessionResponse.json() as JsonObject : {};
    if (!stringValue(session.accessToken)) {
      throw new TheyPaidDashboardError('TheyPaid نشست احراز هویت‌شدهٔ داشبورد را تأیید نکرد.');
    }
  }

  private async callAction(actionId: string, args: unknown[], route: string): Promise<JsonObject> {
    const response = await this.request(route, {
      method: 'POST',
      headers: {
        accept: 'text/x-component',
        'content-type': 'text/plain;charset=UTF-8',
        'next-action': actionId,
        origin: this.baseUrl,
        referer: `${this.baseUrl}${route}`,
      },
      body: JSON.stringify(args),
      redirect: 'manual',
    });
    const text = await response.text();
    if (response.status < 200 || response.status >= 400) {
      throw new TheyPaidDashboardError(`اجرای عملیات داشبورد TheyPaid ناموفق بود (HTTP ${response.status}).`);
    }
    const value = parseFlightActionResult(text);
    if (!value) throw new TheyPaidDashboardError('پاسخ عملیات داشبورد TheyPaid خوانا نبود.');
    return value;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookie = this.cookieHeader();
    if (cookie) headers.set('cookie', cookie);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new TheyPaidDashboardError('داشبورد TheyPaid در دسترس نیست. اتصال شبکه را بررسی و دوباره تلاش کنید.');
    }
    this.captureCookies(response);
    return response;
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  private captureCookies(response: Response): void {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const values = headers.getSetCookie?.() ?? splitSetCookie(headers.get('set-cookie') ?? '');
    for (const cookie of values) {
      const [pair, ...attributes] = cookie.split(';');
      if (!pair) continue;
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const maxAge = attributes.find((part) => /^\s*max-age=/i.test(part));
      const expired = maxAge ? Number(maxAge.split('=')[1]) <= 0 : /expires=Thu, 01 Jan 1970/i.test(cookie);
      if (expired || !value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

export function sanitizeStore(store: DashboardStore): DashboardStore {
  return {
    id: store.id,
    name: store.name,
    ...(store.website === undefined ? {} : { website: store.website }),
    ...(store.industry === undefined ? {} : { industry: store.industry }),
    ...(store.description === undefined ? {} : { description: store.description }),
    ...(store.active === undefined ? {} : { active: store.active }),
    ...(store.createdAt === undefined ? {} : { createdAt: store.createdAt }),
    ...(store.assets ? { assets: store.assets.map(({ assetId, symbol, network, type, available }) => ({ assetId, symbol, network, ...(type ? { type } : {}), ...(available === undefined ? {} : { available }) })) } : {}),
    ...(store.availableAssetIds ? { availableAssetIds: [...store.availableAssetIds] } : {}),
  };
}

export function getAssetCatalog() {
  return THEYPAID_ASSET_CATALOG.map((asset) => ({ ...asset }));
}

function parseFlightActionResult(text: string): JsonObject | undefined {
  const parsed: unknown[] = [];
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    try { parsed.push(JSON.parse(line.slice(separator + 1)) as unknown); } catch { /* بخش Flight است، نه JSON. */ }
  }
  for (let index = parsed.length - 1; index >= 0; index -= 1) {
    const item = parsed[index];
    if (isObject(item) && ('ok' in item || 'user' in item || 'error' in item || 'data' in item)) return item;
  }
  return undefined;
}

function parseStore(value: unknown): DashboardStore {
  if (!isObject(value) || !stringValue(value.id) || !stringValue(value.name)) {
    throw new TheyPaidDashboardError('قالب اطلاعات فروشگاه برگشتی از TheyPaid قابل انتظار نبود.');
  }
  const rawAssets = Array.isArray(value.assets) ? value.assets.filter(isObject) : undefined;
  return sanitizeStore({
    id: stringValue(value.id)!,
    name: stringValue(value.name)!,
    ...(typeof value.website === 'string' || value.website === null ? { website: value.website } : {}),
    ...(typeof value.industry === 'string' || value.industry === null ? { industry: value.industry } : {}),
    ...(typeof value.description === 'string' || value.description === null ? { description: value.description } : {}),
    ...(typeof value.active === 'boolean' ? { active: value.active } : {}),
      ...(stringValue(value.createdAt) ? { createdAt: stringValue(value.createdAt)! } : {}),
    ...(rawAssets ? { assets: rawAssets.map((asset) => ({
      assetId: stringValue(asset.assetId) ?? '',
      symbol: stringValue(asset.symbol) ?? '',
      network: stringValue(asset.network) ?? '',
      ...(stringValue(asset.type) ? { type: stringValue(asset.type)! } : {}),
      ...(typeof asset.available === 'boolean' ? { available: asset.available } : {}),
    })) } : {}),
    ...(Array.isArray(value.availableAssetIds) ? { availableAssetIds: value.availableAssetIds.filter((id): id is string => typeof id === 'string') } : {}),
  });
}

function filterInvoice(value: JsonObject): JsonObject {
  const keep = ['id', 'status', 'amount', 'amountInTether', 'address', 'tag', 'expiresAt', 'expiredAt', 'paymentLink', 'paymentDetected', 'paidAmount', 'asset'];
  const invoice: JsonObject = {};
  for (const key of keep) {
    if (value[key] === undefined) continue;
    invoice[key] = key === 'asset' && isObject(value.asset)
      ? { symbol: value.asset.symbol, network: value.asset.network }
      : value[key];
  }
  return invoice;
}

function readAuthTokens(user: JsonObject): { token?: string; user: JsonObject } {
  const raw = isObject(user.user) ? user.user : user;
  const token = stringValue(raw.token) ?? stringValue(raw.accessToken);
  return {
    ...(token ? { token } : {}),
    user: raw,
  };
}

function splitSetCookie(header: string): string[] {
  if (!header) return [];
  return header.split(/,(?=\s*[^;,\s]+=)/g).map((value) => value.trim());
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
