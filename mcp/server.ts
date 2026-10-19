import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TheyPaidApiError } from 'theypaid-sdk';
import { createTheyPaidClient, readApiKey, requireApiKey, type TheyPaidClient } from '../src/theypaid/client.js';
import { getAssetCatalog, TheyPaidDashboardClient } from '../src/theypaid/dashboard.js';
import { getTheyPaidAsset } from '../src/theypaid/catalog.js';
import {
  checkPayment,
  createInvoice,
  getInvoice,
  listInvoices,
  listSupportedAssets,
  recheckInvoice,
  waitForInvoice,
} from '../src/theypaid/operations.js';
import { safeErrorMessage } from '../src/shared/errors.js';
import {
  checkPaymentSchema,
  createInvoiceSchema,
  invoiceIdSchema,
  listInvoicesSchema,
  theyPaidAssetSchema,
  waitOptionsSchema,
  walletValidationSchema,
  storeCreateSchema,
  storeIdSchema,
  storeSelectionSchema,
  storeUpdateSchema,
  walletConnectionSchema,
  twoFactorCodeSchema,
  topupCreditSchema,
  walletUpdateSchema,
  storeAssetStatusSchema,
  removeStoreAssetSchema,
  storeApiKeyRevokeSchema,
  storeStatusSchema,
  deleteStoreSchema,
  createPaymentLinkSchema,
} from '../src/shared/validation.js';
import {
  createSupportedWallet,
  getWalletAssetInfo,
  isValidWalletValue,
  THEYPAID_ASSETS,
  type TheyPaidAsset,
} from '../src/wallet/wallet.js';

export const REGISTERED_TOOLS = [
  'theypaid_register_account',
  'theypaid_connect_account',
  'theypaid_complete_two_factor',
  'theypaid_disconnect_account',
  'theypaid_get_account',
  'theypaid_list_stores',
  'theypaid_get_store',
  'theypaid_setup_store',
  'theypaid_update_store',
  'theypaid_select_store',
  'theypaid_get_asset_catalog',
  'theypaid_connect_wallet',
  'theypaid_update_wallet',
  'theypaid_set_asset_status',
  'theypaid_remove_store_asset',
  'theypaid_create_store_api_key',
  'theypaid_revoke_store_api_key',
  'theypaid_set_store_active',
  'theypaid_delete_store',
  'theypaid_get_credit',
  'theypaid_topup_credit',
  'theypaid_recheck_credit_topup',
  'theypaid_create_payment_link',
  'theypaid_check_connection',
  'theypaid_get_supported_assets',
  'theypaid_create_invoice',
  'theypaid_get_invoice',
  'theypaid_check_payment',
  'theypaid_list_invoices',
  'theypaid_recheck_invoice',
  'theypaid_wait_for_payment',
  'theypaid_validate_wallet',
  'theypaid_create_wallet',
] as const;

export interface ServerDependencies {
  client?: TheyPaidClient;
  dashboard?: TheyPaidDashboardClient;
  apiKey?: string;
  walletPassword?: string;
  walletDirectory?: string;
}

export function createMcpServer(dependencies: ServerDependencies = {}) {
  const server = new McpServer({ name: 'theypaid-ai', version: '0.1.0' });
  const dashboard = dependencies.dashboard ?? TheyPaidDashboardClient.fromEnvironment();
  let apiClient = dependencies.client;
  const apiKeysByStore = new Map<string, string>();
  const clientsByStore = new Map<string, TheyPaidClient>();
  let activeStoreId = process.env.THEYPAID_STORE_ID || undefined;

  const getClient = (): TheyPaidClient => {
    if (dependencies.client) return dependencies.client;
    const selectedStoreId = dashboard.selectedStoreId ?? activeStoreId;
    if (selectedStoreId) {
      const dynamicKey = apiKeysByStore.get(selectedStoreId);
      if (dynamicKey) {
        let selectedClient = clientsByStore.get(selectedStoreId);
        if (!selectedClient) {
          selectedClient = createTheyPaidClient(dynamicKey);
          clientsByStore.set(selectedStoreId, selectedClient);
        }
        return selectedClient;
      }
      const configuredStoreId = process.env.THEYPAID_STORE_ID;
      if (configuredStoreId && configuredStoreId !== selectedStoreId) {
        throw new Error('کلید API تنظیم‌شده به فروشگاه دیگری وصل است. برای فروشگاه انتخاب‌شده کلید جداگانه بسازید.');
      }
      if (!configuredStoreId && (dashboard.selectedStoreId || activeStoreId)) {
        throw new Error('ابتدا با ابزار theypaid_create_store_api_key برای فروشگاه انتخاب‌شده کلید API بسازید.');
      }
    }
    if (apiClient) return apiClient;
    const apiKey = dependencies.apiKey ?? requireApiKey();
    apiClient = createTheyPaidClient(apiKey);
    return apiClient;
  };

  const withClient = async <T>(operation: (client: TheyPaidClient) => Promise<T>) => {
    try {
        return success(await operation(getClient()));
    } catch (error) {
      return failure(error);
    }
  };

  const withDashboard = async <T>(operation: (client: TheyPaidDashboardClient) => Promise<T>) => {
    try {
      return success(await operation(dashboard));
    } catch (error) {
      return failure(error);
    }
  };

  const ownedStore = async (client: TheyPaidDashboardClient, requestedId?: string) => {
    const storeId = requestedId ?? client.selectedStoreId ?? activeStoreId;
    if (!storeId) throw new Error('ابتدا یک فروشگاه TheyPaid انتخاب کنید.');
    const stores = await client.listStores();
    const store = stores.find((item) => item.id === storeId);
    if (!store) throw new Error('این فروشگاه در حساب متصل TheyPaid در دسترس نیست.');
    return store;
  };

  server.registerTool(
    'theypaid_register_account',
    {
      title: 'ثبت‌نام حساب TheyPaid',
      description: 'درخواست ساخت حساب در TheyPaid را ثبت می‌کند. اطلاعات ورود فقط از متغیرهای محیطی THEYPAID_ACCOUNT_EMAIL و THEYPAID_ACCOUNT_PASSWORD خوانده می‌شوند و نباید در ورودی ابزار فرستاده شوند. برای تکمیل ثبت‌نام، ایمیل تأیید TheyPaid را تأیید کنید.',
      inputSchema: {},
    },
    async () => withDashboard((client) => client.registerAccount()),
  );

  server.registerTool(
    'theypaid_connect_account',
    {
      title: 'اتصال به حساب TheyPaid',
      description: 'با اطلاعات ورودی تنظیم‌شده در محیط امن سرور MCP وارد حساب TheyPaid می‌شود. گذرواژه و توکن دسترسی به‌عنوان ورودی ابزار پذیرفته یا در پاسخ بازگردانده نمی‌شوند. اگر ورود دومرحله‌ای فعال باشد، مرحلهٔ کد یک‌بارمصرف را جداگانه تکمیل کنید.',
      inputSchema: {},
    },
    async () => withDashboard((client) => client.connectAccount()),
  );

  server.registerTool(
    'theypaid_complete_two_factor',
    {
      title: 'تکمیل ورود دومرحله‌ای TheyPaid',
      description: 'کد شش‌رقمی فعلی را برای ورود در انتظار TheyPaid می‌فرستد. کد ذخیره یا در پاسخ بازگردانده نمی‌شود.',
      inputSchema: twoFactorCodeSchema.shape,
    },
    async ({ code }) => withDashboard((client) => client.completeTwoFactor(twoFactorCodeSchema.parse({ code }).code)),
  );

  server.registerTool(
    'theypaid_disconnect_account',
    {
      title: 'قطع اتصال حساب از این نشست MCP',
      description: 'نشست و اطلاعات حساب، فروشگاه انتخاب‌شده و کلیدهای API ذخیره‌شده در حافظهٔ همین فرایند MCP را پاک می‌کند. برای اتصال دوباره پس از راه‌اندازی مجدد، از اطلاعات امن پیکربندی‌شده استفاده کنید.',
      inputSchema: {},
    },
    async () => {
      dashboard.clear();
      activeStoreId = undefined;
      apiKeysByStore.clear();
      clientsByStore.clear();
      apiClient = dependencies.client;
      return success({ disconnected: true, remoteTokenRevocation: 'not_exposed_by_verified_interface' });
    },
  );

  server.registerTool(
    'theypaid_get_account',
    {
      title: 'نمای کلی حساب TheyPaid',
      description: 'فروشگاه‌ها و موجودی اعتبار خدماتی حساب متصل را می‌خواند. اعتبار خدماتی برای کارمزد پردازش فاکتور است و با رمزارز کیف‌پول پذیرنده تفاوت دارد.',
      inputSchema: {},
    },
    async () => withDashboard(async (client) => {
      const [stores, credit] = await Promise.all([client.listStores(), client.getCreditBalance()]);
      return { connected: true, email: process.env.THEYPAID_ACCOUNT_EMAIL, storeCount: stores.length, selectedStoreId: client.selectedStoreId, serviceCredit: credit };
    }),
  );

  server.registerTool(
    'theypaid_list_stores',
    {
      title: 'فهرست فروشگاه‌های TheyPaid',
      description: 'فروشگاه‌های حساب متصل TheyPaid را فهرست می‌کند. نشانی کیف‌پول و کلید عمومی توسعه‌یافته در پاسخ نمایش داده نمی‌شوند.',
      inputSchema: {},
    },
    async () => withDashboard((client) => client.listStores()),
  );

  server.registerTool(
    'theypaid_get_store',
    {
      title: 'نمایش فروشگاه TheyPaid',
      description: 'تنظیمات فروشگاه و اطلاعات دارایی‌های فعال را می‌خواند. نشانی کیف‌پول و کلید عمومی توسعه‌یافته در پاسخ نمایش داده نمی‌شوند.',
      inputSchema: { storeId: storeIdSchema.optional() },
    },
    async ({ storeId }) => withDashboard((client) => {
      const id = storeId ?? client.selectedStoreId ?? activeStoreId;
      if (!id) throw new Error('ابتدا یک فروشگاه TheyPaid انتخاب کنید.');
      return ownedStore(client, id).then(() => client.getStore(id));
    }),
  );

  server.registerTool(
    'theypaid_setup_store',
    {
      title: 'ساخت فروشگاه TheyPaid',
      description: 'از طریق حساب احراز هویت‌شدهٔ TheyPaid فروشگاه می‌سازد و آن را برای این نشست MCP انتخاب می‌کند. پس از ساخت، دارایی و کلید API را جداگانه تنظیم کنید.',
      inputSchema: storeCreateSchema.shape,
    },
    async (input) => withDashboard(async (client) => {
      const parsed = storeCreateSchema.parse(input);
      const store = await client.createStore({
        name: parsed.name,
        ...(parsed.website === undefined ? {} : { website: parsed.website }),
        ...(parsed.industry === undefined ? {} : { industry: parsed.industry }),
        ...(parsed.description === undefined ? {} : { description: parsed.description }),
      });
      activeStoreId = store.id;
      return store;
    }),
  );

  server.registerTool(
    'theypaid_update_store',
    {
      title: 'ویرایش فروشگاه TheyPaid',
      description: 'نام، وب‌سایت، زمینهٔ فعالیت یا توضیحات فروشگاه را در حساب احراز هویت‌شدهٔ TheyPaid تغییر می‌دهد. فقط فیلدهای ارسال‌شده ویرایش می‌شوند.',
      inputSchema: storeUpdateSchema.shape,
    },
    async (input) => withDashboard(async (client) => {
      const parsed = storeUpdateSchema.parse(input);
      const { storeId, ...changes } = parsed;
      await ownedStore(client, storeId);
      if (Object.values(changes).every((value) => value === undefined)) {
        throw new Error('برای ویرایش، دست‌کم یک فیلد فروشگاه را وارد کنید.');
      }
      return client.updateStore(storeId, {
        ...(changes.name === undefined ? {} : { name: changes.name }),
        ...(changes.website === undefined ? {} : { website: changes.website }),
        ...(changes.industry === undefined ? {} : { industry: changes.industry }),
        ...(changes.description === undefined ? {} : { description: changes.description }),
      });
    }),
  );

  server.registerTool(
    'theypaid_select_store',
    {
      title: 'انتخاب فروشگاه TheyPaid',
      description: 'عضویت فروشگاه در حساب متصل را بررسی و آن را برای تنظیم دارایی‌ها و عملیات پرداخت انتخاب می‌کند.',
      inputSchema: storeSelectionSchema.shape,
    },
    async ({ storeId }) => withDashboard(async (client) => {
      const id = storeIdSchema.parse(storeId);
      const stores = await client.listStores();
      if (!stores.some((store) => store.id === id)) throw new Error('این فروشگاه در حساب متصل TheyPaid در دسترس نیست.');
      client.selectStore(id);
      activeStoreId = id;
      return { selected: true, store: stores.find((store) => store.id === id) };
    }),
  );

  server.registerTool(
    'theypaid_get_asset_catalog',
    {
      title: 'فهرست دارایی‌های TheyPaid',
      description: 'دارایی‌های فهرست تنظیم فروشگاه TheyPaid و شناسهٔ فعلی هرکدام را نشان می‌دهد. هنگام اتصال کیف‌پول یا ساخت فاکتور از همین شناسه‌ها استفاده کنید.',
      inputSchema: {},
    },
    async () => success({ assets: getAssetCatalog(), evidence: 'dashboard_setup_selector_observed_2026-10-15' }),
  );

  server.registerTool(
    'theypaid_connect_wallet',
    {
      title: 'اتصال کیف‌پول دریافت به فروشگاه',
      description: 'نشانی عمومی یا xpub را با TheyPaid اعتبارسنجی و به فروشگاه انتخاب‌شده وصل می‌کند. کلید خصوصی یا عبارت بازیابی را وارد نکنید. فقط پس از تأیید کاربر، confirm را true قرار دهید.',
      inputSchema: walletConnectionSchema.shape,
    },
    async (input) => withDashboard(async (client) => {
      const parsed = walletConnectionSchema.parse(input);
      const storeId = parsed.storeId ?? client.selectedStoreId ?? activeStoreId;
      if (!storeId) throw new Error('پیش از اتصال کیف‌پول، یک فروشگاه TheyPaid انتخاب یا ایجاد کنید.');
      await ownedStore(client, storeId);
      const asset = getTheyPaidAsset(parsed.asset);
      const enabled = await client.getStoreAssets(storeId);
      if (enabled.some((item) => item.assetId === asset.assetId)) {
        return { connected: true, alreadyEnabled: true, storeId, asset: parsed.asset };
      }
      const validation = await client.validateStoreWallet(storeId, parsed.asset, parsed.publicValue);
      if (!validation.valid) return { connected: false, validationFailed: true, storeId, asset: parsed.asset };
      await client.addStoreWallet(storeId, parsed.asset, parsed.publicValue);
      client.selectStore(storeId);
      activeStoreId = storeId;
      return { connected: true, storeId, asset: parsed.asset, network: asset.network, firstAddresses: validation.firstAddresses };
    }),
  );

  server.registerTool(
    'theypaid_update_wallet',
    {
      title: 'تغییر کیف‌پول دریافت فروشگاه',
      description: 'نشانی عمومی یا xpub تازه را با TheyPaid اعتبارسنجی و کیف‌پول دریافت دارایی تنظیم‌شده در این فروشگاه را جایگزین می‌کند. این تغییر بر پرداخت‌های بعدی اثر می‌گذارد؛ پس از تأیید کاربر confirm را true بگذارید. ممکن است کد شش‌رقمی ورود دومرحله‌ای لازم باشد.',
      inputSchema: walletUpdateSchema.shape,
    },
    async (input) => withDashboard(async (client) => {
      const parsed = walletUpdateSchema.parse(input);
      const store = await ownedStore(client, parsed.storeId);
      const catalogAsset = getTheyPaidAsset(parsed.asset);
      const enabled = await client.getStoreAssets(store.id);
      if (!enabled.some((item) => item.assetId === catalogAsset.assetId)) {
        throw new Error('این دارایی در فروشگاه انتخاب‌شده تنظیم نشده است. پیش از تغییر کیف‌پول، آن را به فروشگاه وصل کنید.');
      }
      const result = await client.updateStoreWallet(store.id, parsed.asset, parsed.publicValue, parsed.code);
      return { updated: true, storeId: store.id, asset: parsed.asset, network: catalogAsset.network, firstAddresses: result.firstAddresses };
    }),
  );

  server.registerTool(
    'theypaid_set_asset_status',
    {
      title: 'فعال یا غیرفعال‌کردن دارایی فروشگاه',
      description: 'دارایی ثبت‌شده در فروشگاه انتخاب‌شده را از طریق TheyPaid فعال یا غیرفعال می‌کند. غیرفعال‌کردن، پذیرش پرداخت‌های تازه با آن دارایی را متوقف می‌کند و تنظیم کیف‌پول را نگه می‌دارد. تأیید صریح کاربر و گاهی کد ورود دومرحله‌ای لازم است.',
      inputSchema: storeAssetStatusSchema.shape,
    },
    async (input) => withDashboard(async (client) => {
      const parsed = storeAssetStatusSchema.parse(input);
      const store = await ownedStore(client, parsed.storeId);
      const asset = getTheyPaidAsset(parsed.asset);
      if (!(await client.getStoreAssets(store.id)).some((item) => item.assetId === asset.assetId)) {
        throw new Error('این دارایی در فروشگاه انتخاب‌شده تنظیم نشده است.');
      }
      await client.setStoreAssetEnabled(store.id, parsed.asset, parsed.enabled, parsed.code);
      return { storeId: store.id, asset: parsed.asset, enabled: parsed.enabled };
    }),
  );

  server.registerTool(
    'theypaid_remove_store_asset',
    {
      title: 'حذف دارایی از فروشگاه',
      description: 'دارایی انتخاب‌شده و تنظیم کیف‌پول دریافت آن را به‌طور دائمی از فروشگاه حذف می‌کند و ممکن است پذیرش پرداخت با آن دارایی را متوقف کند. پس از تأیید کاربر اجرا کنید؛ ممکن است کد ورود دومرحله‌ای لازم باشد.',
      inputSchema: removeStoreAssetSchema.shape,
    },
    async (input) => withDashboard(async (client) => {
      const parsed = removeStoreAssetSchema.parse(input);
      const store = await ownedStore(client, parsed.storeId);
      const asset = getTheyPaidAsset(parsed.asset);
      if (!(await client.getStoreAssets(store.id)).some((item) => item.assetId === asset.assetId)) {
        throw new Error('این دارایی در فروشگاه انتخاب‌شده تنظیم نشده است.');
      }
      await client.removeStoreAsset(store.id, parsed.asset, parsed.code);
      return { removed: true, storeId: store.id, asset: parsed.asset };
    }),
  );

  server.registerTool(
    'theypaid_create_store_api_key',
    {
      title: 'ساخت کلید API فروشگاه',
      description: 'کلید Merchant API محدود به فروشگاه را در TheyPaid می‌سازد و مقدار محرمانه را فقط در همین فرایند MCP نگه می‌دارد. ابزار فقط ماسک کلید را برمی‌گرداند. کلید برای ابزارهای فاکتور و پرداخت این نشست استفاده می‌شود.',
      inputSchema: { storeId: storeIdSchema.optional() },
    },
    async ({ storeId }) => withDashboard(async (client) => {
      const id = storeId ?? client.selectedStoreId ?? activeStoreId;
      if (!id) throw new Error('پیش از ساخت کلید API، یک فروشگاه TheyPaid انتخاب کنید.');
      await ownedStore(client, id);
      const { apiKey, mask } = await client.createStoreApiKeySecret(id);
      apiKeysByStore.set(id, apiKey);
      clientsByStore.set(id, createTheyPaidClient(apiKey));
      client.selectStore(id);
      activeStoreId = id;
      return { created: true, storeId: id, mask, activeForThisMcpSession: true };
    }),
  );

  server.registerTool(
    'theypaid_revoke_store_api_key',
    {
      title: 'لغو کلید API فروشگاه',
      description: 'کلید API فروشگاه انتخاب‌شده را در TheyPaid لغو و مقدار ذخیره‌شده در حافظهٔ این نشست را پاک می‌کند. تا ساخت کلید تازه، درخواست‌های پرداخت متوقف می‌شوند. تأیید کاربر و گاهی کد ورود دومرحله‌ای لازم است.',
      inputSchema: storeApiKeyRevokeSchema.shape,
    },
    async (input) => withDashboard(async (client) => {
      const parsed = storeApiKeyRevokeSchema.parse(input);
      const store = await ownedStore(client, parsed.storeId);
      await client.revokeStoreApiKey(store.id, parsed.code);
      apiKeysByStore.delete(store.id);
      clientsByStore.delete(store.id);
      if (activeStoreId === store.id && process.env.THEYPAID_STORE_ID !== store.id) activeStoreId = undefined;
      return { revoked: true, storeId: store.id, paymentApiKeyActiveForThisSession: false };
    }),
  );

  server.registerTool(
    'theypaid_set_store_active',
    {
      title: 'فعال یا غیرفعال‌کردن فروشگاه',
      description: 'وضعیت فعال فروشگاه را در TheyPaid تغییر می‌دهد. غیرفعال‌کردن، پذیرش پرداخت تازه برای فروشگاه را متوقف می‌کند. تأیید کاربر و گاهی کد ورود دومرحله‌ای لازم است.',
      inputSchema: storeStatusSchema.shape,
    },
    async (input) => withDashboard(async (client) => {
      const parsed = storeStatusSchema.parse(input);
      const store = await ownedStore(client, parsed.storeId);
      if (store.active === parsed.active) return { storeId: store.id, active: store.active, changed: false };
      await client.setStoreActive(store.id, parsed.active, parsed.code);
      const updated = await client.getStore(store.id);
      return { storeId: updated.id, active: updated.active ?? parsed.active, changed: true };
    }),
  );

  server.registerTool(
    'theypaid_delete_store',
    {
      title: 'حذف فروشگاه TheyPaid',
      description: 'فروشگاه و تنظیمات آن را به‌طور دائمی در TheyPaid حذف می‌کند. این کار برگشت‌پذیر نیست و تأیید نام دقیق فعلی فروشگاه و گاهی کد ورود دومرحله‌ای لازم است.',
      inputSchema: deleteStoreSchema.shape,
    },
    async (input) => withDashboard(async (client) => {
      const parsed = deleteStoreSchema.parse(input);
      const store = await ownedStore(client, parsed.storeId);
      if (parsed.confirmStoreName !== store.name) throw new Error('نام تأییدشده با نام فروشگاه یکسان نیست؛ چیزی حذف نشد.');
      await client.deleteStore(store.id, parsed.code);
      apiKeysByStore.delete(store.id);
      clientsByStore.delete(store.id);
      if (activeStoreId === store.id) activeStoreId = undefined;
      if (client.selectedStoreId === store.id) client.selectStore(undefined);
      return { deleted: true, storeId: store.id };
    }),
  );

  server.registerTool(
    'theypaid_get_credit',
    {
      title: 'مشاهدهٔ اعتبار خدماتی TheyPaid',
      description: 'موجودی اعتباری را که در TheyPaid برای کارمزد پردازش فاکتور در دسترس است می‌خواند. این موجودی رمزارز داخل کیف‌پول پذیرنده نیست.',
      inputSchema: {},
    },
    async () => withDashboard((client) => client.getCreditBalance()),
  );

  server.registerTool(
    'theypaid_topup_credit',
    {
      title: 'ساخت فاکتور شارژ اعتبار خدماتی',
      description: 'از مسیر شارژ اعتبار خود TheyPaid فاکتور واقعی می‌سازد. پس از تأیید مبلغ و دارایی توسط کاربر اجرا کنید؛ سپس فاکتور برگشتی TheyPaid را برای پرداخت در اختیار او بگذارید.',
      inputSchema: topupCreditSchema.shape,
    },
    async (input) => withDashboard(async (client) => {
      const parsed = topupCreditSchema.parse(input);
      const invoice = await client.createCreditTopupInvoice(parsed.amountInTether, parsed.asset);
      return { invoice, purpose: 'theypaid_service_fee_credit', fundsSent: false };
    }),
  );

  server.registerTool(
    'theypaid_recheck_credit_topup',
    {
      title: 'بررسی دوبارهٔ فاکتور شارژ اعتبار',
      description: 'از TheyPaid می‌خواهد فاکتور حساب را دوباره بررسی کند و سپس موجودی اعتبار خدماتی را می‌خواند. فقط وضعیت PAID به‌معنی پرداخت تأییدشده است؛ اعتبار از موجودی کیف‌پول پذیرنده جداست.',
      inputSchema: { invoiceId: invoiceIdSchema },
    },
    async ({ invoiceId }) => withDashboard(async (client) => {
      const id = invoiceIdSchema.parse(invoiceId);
      const [invoice, serviceCredit] = await Promise.all([
        client.recheckAccountInvoice(id),
        client.getCreditBalance(),
      ]);
      return { invoice, confirmedByTheyPaid: invoice.status === 'PAID', serviceCredit };
    }),
  );

  server.registerTool(
    'theypaid_create_payment_link',
    {
      title: 'ساخت لینک پرداخت TheyPaid',
      description: 'از مسیر لینک پرداخت فروشگاه در TheyPaid فاکتور می‌سازد و لینک واقعی pay.theypaid.io را برمی‌گرداند. مبلغ amountInTether معادل دلاری فاکتور است؛ دارایی باید در فروشگاه فعال باشد و نرخ تبدیل داشته باشد. فاکتور پس از ۳۰ دقیقه منقضی می‌شود. پیش از اجرا، مبلغ و دارایی را با کاربر تأیید کنید.',
      inputSchema: createPaymentLinkSchema.shape,
    },
    async (input) => withDashboard(async (client) => {
      const parsed = createPaymentLinkSchema.parse(input);
      const store = await ownedStore(client, parsed.storeId);
      const asset = (await client.getStoreAssets(store.id)).find((item) => item.assetId === parsed.assetId && item.available !== false);
      if (!asset) throw new Error('دارایی فعالی را انتخاب کنید که نرخ تبدیل آن در TheyPaid برای این فروشگاه موجود باشد.');
      const invoice = await client.createPaymentLink(store.id, parsed.assetId, parsed.amountInTether, parsed.description);
      return { ...invoice, storeId: store.id, asset: { assetId: asset.assetId, symbol: asset.symbol, network: asset.network } };
    }),
  );

  server.registerTool(
    'theypaid_check_connection',
    {
      title: 'بررسی اتصال به TheyPaid',
      description:
        'با دریافت فهرست دارایی‌های فعال فروشگاه بررسی می‌کند که کلید API تنظیم‌شده کار می‌کند.',
      inputSchema: {},
    },
    async () =>
      withClient(async (client) => {
        const assets = await listSupportedAssets(client);
        return { connected: true, enabledAssetCount: assets.length, assets };
      }),
  );

  server.registerTool(
    'theypaid_get_supported_assets',
    {
      title: 'فهرست دارایی‌های فعال فروشگاه',
      description:
        'دارایی‌های فعال فروشگاه انتخاب‌شده را نشان می‌دهد. برای ساخت فاکتور از assetId دقیقِ پاسخ استفاده کنید.',
      inputSchema: {},
    },
    async () => withClient((client) => listSupportedAssets(client)),
  );

  server.registerTool(
    'theypaid_create_invoice',
    {
      title: 'ساخت فاکتور در TheyPaid',
      description:
        'از Merchant API در TheyPaid یک فاکتور می‌سازد و paymentLink واقعی آن را برمی‌گرداند. فقط با درخواست صریح کاربر اجرا کنید و ابتدا assetId را از دارایی‌های فعال فروشگاه بردارید. اگر درخواست timeout شد، پیش از تلاش دوباره فهرست و جزئیات فاکتورها را بررسی کنید.',
      inputSchema: createInvoiceSchema.shape,
    },
    async (input) =>
      withClient(async (client) => {
        const parsed = createInvoiceSchema.parse(input);
        const assets = await listSupportedAssets(client);
        if (!assets.some((asset) => asset.assetId === parsed.assetId)) {
          throw new Error('این assetId برای فروشگاه انتخاب‌شده فعال نیست. با ابزار theypaid_get_supported_assets فهرست را بگیرید و یکی از شناسه‌ها را انتخاب کنید.');
        }
        return createInvoice(client, {
          assetId: parsed.assetId,
          amountInTether: parsed.amountInTether,
          acceptToleranceInTether: parsed.acceptToleranceInTether,
          ...(parsed.requiredConfirmations === undefined
            ? {}
            : { requiredConfirmations: parsed.requiredConfirmations }),
          ...(parsed.description === undefined ? {} : { description: parsed.description }),
          ...(parsed.redirectUrl === undefined ? {} : { redirectUrl: parsed.redirectUrl }),
        });
      }),
  );

  server.registerTool(
    'theypaid_get_invoice',
    {
      title: 'نمایش فاکتور TheyPaid',
      description: 'جزئیات و وضعیت فعلی فاکتور را با شناسهٔ آن از TheyPaid می‌خواند.',
      inputSchema: { invoiceId: invoiceIdSchema },
    },
    async ({ invoiceId }) => withClient((client) => getInvoice(client, invoiceId)),
  );

  server.registerTool(
    'theypaid_check_payment',
    {
      title: 'بررسی وضعیت پرداخت در TheyPaid',
      description:
        'وضعیت فاکتور را دوباره از TheyPaid می‌خواند. فقط وقتی پاسخ PAID باشد پرداخت را تأییدشده اعلام کنید. در صورت ارسال، دارایی و مبلغ مورد انتظار نیز با فاکتور مقایسه می‌شوند.',
      inputSchema: checkPaymentSchema.shape,
    },
    async (input) =>
      withClient((client) => {
        const parsed = checkPaymentSchema.parse(input);
        return checkPayment(client, {
          invoiceId: parsed.invoiceId,
          ...(parsed.expectedAssetId === undefined
            ? {}
            : { expectedAssetId: parsed.expectedAssetId }),
          ...(parsed.expectedAmountInTether === undefined
            ? {}
            : { expectedAmountInTether: parsed.expectedAmountInTether }),
        });
      }),
  );

  server.registerTool(
    'theypaid_list_invoices',
    {
      title: 'فهرست فاکتورهای TheyPaid',
      description: 'فاکتورهای فروشگاه تنظیم‌شده را با صفحه‌بندی offset و limit فهرست می‌کند.',
      inputSchema: listInvoicesSchema.shape,
    },
    async (input) =>
      withClient((client) => listInvoices(client, listInvoicesSchema.parse(input))),
  );

  server.registerTool(
    'theypaid_recheck_invoice',
    {
      title: 'درخواست بررسی دوبارهٔ فاکتور',
      description:
        'بررسی دوبارهٔ فاکتور را در TheyPaid اجرا و تازه‌ترین وضعیت ثبت‌شدهٔ آن را برمی‌گرداند.',
      inputSchema: { invoiceId: invoiceIdSchema },
    },
    async ({ invoiceId }) => withClient((client) => recheckInvoice(client, invoiceId)),
  );

  server.registerTool(
    'theypaid_wait_for_payment',
    {
      title: 'انتظار برای وضعیت پرداخت TheyPaid',
      description:
        'وضعیت فاکتور را از TheyPaid می‌خواند تا به PAID، INSUFFICIENT یا EXPIRED برسد یا زمان انتظار تمام شود؛ سپس آخرین وضعیت را برمی‌گرداند.',
      inputSchema: {
        invoiceId: invoiceIdSchema,
        intervalMs: waitOptionsSchema.shape.intervalMs,
        timeoutMs: waitOptionsSchema.shape.timeoutMs,
      },
    },
    async (input) =>
      withClient((client) =>
        waitForInvoice(client, {
          invoiceId: invoiceIdSchema.parse(input.invoiceId),
          ...waitOptionsSchema.parse({
            intervalMs: input.intervalMs,
            timeoutMs: input.timeoutMs,
          }),
        }),
      ),
  );

  server.registerTool(
    'theypaid_validate_wallet',
    {
      title: 'اعتبارسنجی اطلاعات عمومی کیف‌پول',
      description:
        'قالب نشانی عمومی دریافت یا xpub را برای یک دارایی پشتیبانی‌شده بررسی می‌کند. برای اعتبارسنجی در TheyPaid و اتصال به فروشگاه، از theypaid_connect_wallet استفاده کنید. کلید خصوصی یا عبارت بازیابی را وارد نکنید.',
      inputSchema: walletValidationSchema.shape,
    },
    async (input) => {
      try {
        const parsed = walletValidationSchema.parse(input);
        const info = getWalletAssetInfo(parsed.asset as TheyPaidAsset);
        const valid = isValidWalletValue(parsed.asset as TheyPaidAsset, parsed.publicValue);
        return success({
          ...info,
          valid,
          registration: 'use_theypaid_connect_wallet_after_user_approval',
          note: valid
            ? 'قالب داده درست است. پس از تأیید فروشگاه و دارایی از سوی کاربر، TheyPaid آن را با ابزار theypaid_connect_wallet بررسی و ثبت می‌کند.'
            : 'قالب این داده با نشانی عمومی مورد انتظار برای این دارایی در TheyPaid سازگار نیست.',
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'theypaid_create_wallet',
    {
      title: 'ساخت کیف‌پول رمزگذاری‌شده برای دارایی TheyPaid',
      description:
        `برای یکی از دارایی‌های فهرست فروشگاه TheyPaid (${THEYPAID_ASSETS.join(', ')})، کیف‌پول غیرامانی محلی می‌سازد. برای دارایی‌های UTXO کلید عمومی توسعه‌یافته و برای دارایی‌های حساب‌محور نشانی دریافت می‌دهد. عبارت بازیابی و کلید خصوصی در فایل محلی رمزگذاری می‌شوند و بازگردانده نمی‌شوند. متغیر THEYPAID_WALLET_PASSWORD باید در محیط امن سرور MCP تنظیم شده باشد. پس از تأیید کاربر، با ابزار theypaid_connect_wallet کیف‌پول را اعتبارسنجی و به فروشگاه وصل کنید.`,
      inputSchema: { asset: theyPaidAssetSchema },
    },
    async ({ asset }) => {
      try {
        const password = dependencies.walletPassword ?? process.env.THEYPAID_WALLET_PASSWORD;
        const walletDirectory = dependencies.walletDirectory ?? process.env.THEYPAID_WALLET_DIR;
        if (!password) {
        throw new Error(
          'پیش از ساخت کیف‌پول، THEYPAID_WALLET_PASSWORD را در محیط امن سرور MCP تنظیم کنید. آن را در گفت‌وگو نفرستید.',
        );
        }
        const wallet = await createSupportedWallet({
          asset: asset as TheyPaidAsset,
          password,
          ...(walletDirectory ? { directory: walletDirectory } : {}),
        });
        return success({
          ...wallet,
          note: 'این کیف‌پول فعلاً فقط به‌صورت محلی ساخته شده و هنوز به فروشگاه TheyPaid وصل نیست. پس از تأیید فروشگاه و دارایی از سوی کاربر، با ابزار theypaid_connect_wallet آن را ثبت کنید.',
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}

function success(value: unknown) {
  const json: unknown = JSON.parse(JSON.stringify(value));
  const structuredContent = Array.isArray(json)
    ? { items: json }
    : json !== null && typeof json === 'object'
      ? json as Record<string, unknown>
      : { value: json };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(json, null, 2) }],
    structuredContent,
  };
}

function failure(error: unknown) {
  const text = error instanceof TheyPaidApiError || error instanceof Error
    ? safeErrorMessage(error)
    : 'عملیات TheyPaid ناموفق بود.';
  return {
    isError: true,
    content: [{ type: 'text' as const, text }],
  };
}
