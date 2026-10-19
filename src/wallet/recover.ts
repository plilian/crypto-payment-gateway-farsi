#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decryptWalletMnemonic } from './wallet.js';

async function main() {
  const filePath = process.argv[2];
  const password = process.env.THEYPAID_WALLET_PASSWORD;
  if (!filePath || !password) {
    process.stderr.write('روش استفاده: THEYPAID_WALLET_PASSWORD=<secret> theypaid-wallet-recover <wallet-file>\n');
    process.stderr.write('این فرمان را فقط در ترمینال محلی امن اجرا کنید؛ هرگز آن را از طریق عامل هوش مصنوعی یا ابزار MCP اجرا نکنید.\n');
    process.exitCode = 2;
    return;
  }
  try {
    const absolutePath = resolve(filePath);
    const details = await stat(absolutePath);
    if (!details.isFile() || details.size > 32_768) throw new Error('فایل کیف‌پول معتبر نیست.');
    const walletFile = JSON.parse(await readFile(absolutePath, 'utf8'));
    const phrase = await decryptWalletMnemonic(walletFile, password);
    process.stdout.write(`${phrase}\n`);
  } catch {
    process.stderr.write('رمزگشایی فایل کیف‌پول ممکن نشد. فایل و گذرواژهٔ THEYPAID_WALLET_PASSWORD را بررسی کنید.\n');
    process.exitCode = 1;
  }
}

void main();
