---
name: theypaid
description: راهنمای استفاده از ابزارهای MCP برای راه‌اندازی TheyPaid، مدیریت فروشگاه و کیف‌پول‌های پشتیبانی‌شده، بررسی اعتبار خدماتی، ساخت فاکتور و لینک پرداخت و پیگیری وضعیت پرداخت.
---

# راهنمای عامل برای TheyPaid

برای عملیات واقعی حساب، فروشگاه، کیف‌پول، اعتبار و پرداخت از ابزارهای MCP همین پروژه استفاده کن. موفقیت هر عملیات را فقط بر اساس پاسخ ابزار گزارش بده. زیرساخت TheyPaid شبکه‌های بلاک‌چین را پایش می‌کند، تراکنش‌ها را تشخیص می‌دهد و وضعیت فاکتور را به‌روزرسانی می‌کند. نتیجهٔ پرداخت را از وضعیت فاکتور در TheyPaid بگیر.

## اتصال یا ساخت حساب

- گذرواژهٔ کاربر را در گفت‌وگو یا ورودی ابزار نخواه. سرور، مقادیر THEYPAID_ACCOUNT_EMAIL و THEYPAID_ACCOUNT_PASSWORD را از محیط امن میزبان MCP می‌خواند.
- برای حساب موجود، theypaid_connect_account را اجرا کن. اگر ورود دومرحله‌ای لازم است، کد تازه را از کاربر بگیر و پس از استفاده آن را تکرار یا ذخیره نکن.
- برای ساخت حساب، theypaid_register_account را اجرا کن. TheyPaid ایمیل تأیید می‌فرستد؛ از کاربر بخواه ایمیل را باز کند و ثبت‌نام را تأیید کند. تا پیش از تأیید، نگو حساب فعال شده است.
- theypaid_disconnect_account نشست حساب و کلیدهای موقت همین فرایند MCP را پاک می‌کند.

## راه‌اندازی فروشگاه

1. با theypaid_list_stores و theypaid_get_store وضعیت حساب و فروشگاه‌های موجود را بررسی کن.
2. اگر فروشگاه لازم است، theypaid_setup_store را با نام درخواستی کاربر اجرا کن.
3. با theypaid_get_asset_catalog فهرست دارایی‌های TheyPaid را بگیر. شناسهٔ دارایی را حدس نزن و از شبکهٔ دیگری استفاده نکن.
4. برای کیف‌پول موجود، فقط نشانی عمومی یا کلید عمومی توسعه‌یافته را بگیر. برای ساخت کیف‌پول جدید، theypaid_create_wallet را اجرا کن؛ اطلاعات بازیابی به‌صورت محلی و رمزگذاری‌شده ذخیره می‌شود.
5. پیش از ثبت کیف‌پول، شبکه، فروشگاه و نشانی عمومی را به کاربر نشان بده و تأیید صریح بگیر. سپس theypaid_connect_wallet را با confirm: true اجرا کن. TheyPaid دادهٔ عمومی را اعتبارسنجی و به فروشگاه وصل می‌کند.
6. با theypaid_create_store_api_key کلید فروشگاه بساز. ابزار فقط ماسک کلید را نشان می‌دهد و کلید در حافظهٔ فرایند می‌ماند.
7. برای ویرایش اطلاعات فروشگاه از theypaid_update_store استفاده کن. تغییر وضعیت فروشگاه، دارایی، کلید یا حذف فروشگاه باید با تأیید روشن کاربر باشد. حذف فروشگاه برگشت‌پذیر نیست و نام دقیق آن لازم است.

هرگز کلید خصوصی یا عبارت بازیابی نخواه و ارسال نکن. دارایی‌های UTXO مانند BTC، BCH، LTC، BSV و DOGE با xpub کار می‌کنند؛ دارایی‌های حساب‌محور با نشانی عمومی. فقط برای دارایی‌های موجود در فهرست TheyPaid کیف‌پول بساز.

## اعتبار خدماتی TheyPaid

- برای موجودی تأییدشده از theypaid_get_credit یا theypaid_get_account استفاده کن.
- آن را «اعتبار خدماتی/کارمزد TheyPaid» بنام. این اعتبار رمزارز داخل کیف‌پول پذیرنده نیست.
- اعتبار خوش‌آمدگویی ۱۰ دلاری به حساب‌های واجد شرایط تعلق می‌گیرد. واجدشرایط‌بودن یا اعطای اعتبار را حدس نزن؛ فقط موجودی گزارش‌شده از TheyPaid را اعلام کن.
- برای شارژ، مبلغ و دارایی را با کاربر روشن کن و تأیید صریح بگیر. سپس theypaid_topup_credit را با confirm: true اجرا کن. این کار فاکتور پرداخت TheyPaid می‌سازد.
- برای پیگیری از theypaid_recheck_credit_topup استفاده کن. فقط وقتی وضعیت برگشتی PAID است، پرداخت را تأییدشده گزارش کن.

## دریافت وجه از مشتری

1. دارایی‌های فعال فروشگاه را با theypaid_get_supported_assets بگیر و فقط از assetId برگشتی TheyPaid استفاده کن.
2. فقط به درخواست صریح کاربر فاکتور بساز. اگر مبلغ، دارایی یا توضیح مبهم است، پیش از ایجاد فاکتور سؤال کن.
3. برای لینک میزبانی‌شدهٔ فروشگاه، مبلغ، دارایی و توضیح را با کاربر تأیید کن و سپس theypaid_create_payment_link را با confirm: true اجرا کن. برای فاکتور Merchant API از theypaid_create_invoice استفاده کن. لینک پرداخت برگشتی را همان‌طور که هست به کاربر بده.
4. پرداخت مشتری را خودت ارسال نکن. TheyPaid شبکه را پایش می‌کند، تراکنش را تشخیص می‌دهد و وضعیت فاکتور را به‌روز می‌کند.
5. برای بررسی از theypaid_get_invoice، theypaid_check_payment، theypaid_recheck_invoice یا theypaid_wait_for_payment استفاده کن. PAID یعنی TheyPaid پرداخت را تأیید کرده است؛ WAITING، INSUFFICIENT و EXPIRED به معنی پرداخت موفق نیستند.
6. اگر ساخت فاکتور timeout شد، پیش از تلاش دوباره فهرست و جزئیات فاکتور را بررسی کن.

برای اعلام پرداخت، پاسخ وضعیت فاکتور TheyPaid را بخوان. برای تکرار نکردن یک اقدام تجاری، شناسهٔ فاکتور را همراه کاربر یا جریان کاری نگه دار.

## ابزارهای MCP

theypaid_register_account، theypaid_connect_account، theypaid_complete_two_factor، theypaid_disconnect_account، theypaid_get_account، theypaid_list_stores، theypaid_get_store، theypaid_setup_store، theypaid_update_store، theypaid_select_store، theypaid_set_store_active، theypaid_delete_store، theypaid_get_asset_catalog، theypaid_connect_wallet، theypaid_update_wallet، theypaid_set_asset_status، theypaid_remove_store_asset، theypaid_create_store_api_key، theypaid_revoke_store_api_key، theypaid_get_credit، theypaid_topup_credit، theypaid_recheck_credit_topup، theypaid_check_connection، theypaid_get_supported_assets، theypaid_create_invoice، theypaid_create_payment_link، theypaid_get_invoice، theypaid_check_payment، theypaid_list_invoices، theypaid_recheck_invoice، theypaid_wait_for_payment، theypaid_validate_wallet و theypaid_create_wallet.
