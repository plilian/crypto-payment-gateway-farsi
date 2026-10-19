import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createSupportedWallet,
  decryptWalletMnemonic,
  isValidWalletValue,
  THEYPAID_ASSETS,
} from '../src/wallet/wallet.js';

const PASSWORD = 'a-strong-test-password-123';

describe('کیف‌پول‌های محلی سازگار با TheyPaid', () => {
    it.each(THEYPAID_ASSETS)('برای %s اطلاعات کیف‌پول رمزگذاری‌شده می‌سازد و عبارت بازیابی را بازنمی‌گرداند', async (asset) => {
    const directory = await mkdtemp(join(tmpdir(), 'theypaid-wallet-test-'));
    try {
      const result = await createSupportedWallet({ asset, password: PASSWORD, directory });
      const publicValue = result.address ?? result.extendedPublicKey;
      expect(publicValue).toBeTruthy();
      expect(isValidWalletValue(asset, publicValue!)).toBe(true);
      expect(result.compatibleTheyPaidAssets).toContain(asset);
      expect(result.keystorePath.startsWith(directory)).toBe(true);
      expect(result).not.toHaveProperty('mnemonic');
      expect(result).not.toHaveProperty('privateKey');

      const encoded = await readFile(result.keystorePath, 'utf8');
      const walletFile = JSON.parse(encoded) as Parameters<typeof decryptWalletMnemonic>[0];
      expect(encoded).not.toMatch(/mnemonic|privateKey|secretKey/i);
      const phrase = await decryptWalletMnemonic(walletFile, PASSWORD);
      expect(phrase.trim().split(/\s+/).length).toBeGreaterThanOrEqual(12);
      expect(encoded).not.toContain(phrase);
      await expect(decryptWalletMnemonic(walletFile, 'wrong-password-is-strong')).rejects.toThrow('گذرواژه درست نیست');

      if (['BTC', 'BCH', 'LTC', 'BSV', 'DOGE'].includes(asset)) {
        expect(result.walletFormat).toBe('extended-public-key');
        if (asset === 'BTC') expect(result.extendedPublicKey).toMatch(/^zpub/);
        if (asset === 'LTC') expect(result.extendedPublicKey).toMatch(/^xpub/);
        if (['BCH', 'BSV', 'DOGE'].includes(asset)) expect(result.extendedPublicKey).toMatch(/^xpub/);
      } else {
        expect(result.walletFormat).toBe('address');
        expect(result.address).toBeTruthy();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('شبکهٔ مشترک دارایی‌های بومی و توکن‌ها را مشخص می‌کند', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'theypaid-wallet-test-'));
    try {
      for (const [asset, compatible] of [
        ['ETH', ['ETH', 'ETH_USDC']],
        ['BNB', ['BNB', 'BSC_USDT']],
        ['TRX', ['TRX', 'TRON_USDT']],
        ['GRAM', ['GRAM', 'TON_USDT']],
      ] as const) {
        const wallet = await createSupportedWallet({ asset, password: PASSWORD, directory });
        expect(wallet.compatibleTheyPaidAssets).toEqual(compatible);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('گذرواژهٔ ضعیف و دارایی خارج از فهرست TheyPaid را نمی‌پذیرد', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'theypaid-wallet-test-'));
    try {
      await expect(createSupportedWallet({ asset: 'ETH', password: 'short', directory })).rejects.toThrow('دست‌کم 16 نویسه');
      await expect(createSupportedWallet({ asset: 'SOL' as never, password: PASSWORD, directory })).rejects.toThrow('دارایی‌های پشتیبانی‌شده');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('مقدار نامعتبر کیف‌پول عمومی را رد می‌کند', () => {
    expect(isValidWalletValue('ETH', 'not-an-address')).toBe(false);
    expect(isValidWalletValue('TRX', 'T111111111111111111111111111111111')).toBe(false);
    expect(isValidWalletValue('BTC', 'xpub-not-valid')).toBe(false);
    expect(isValidWalletValue('GRAM', 'not-a-ton-address')).toBe(false);
  });
});
