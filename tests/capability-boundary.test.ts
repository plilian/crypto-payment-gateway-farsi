import { describe, expect, it } from 'vitest';
import { REGISTERED_TOOLS } from '../mcp/server.js';

describe('قابلیت‌های سرور MCP', () => {
  it('جریان حساب، فروشگاه، کیف‌پول، اعتبار، فاکتور و لینک پرداخت را ثبت می‌کند', () => {
    expect(REGISTERED_TOOLS).toEqual(expect.arrayContaining([
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
    ]));
    expect(new Set(REGISTERED_TOOLS).size).toBe(REGISTERED_TOOLS.length);
  });
});
