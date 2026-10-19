import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { Address } from '@ton/core';
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';
import { HDKey } from '@scure/bip32';
import { base58 } from '@scure/base';
import { mnemonicToSeed, generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { computeAddress, hexlify, isAddress, SigningKey } from 'ethers';

const WALLET_FORMAT = 'theypaid-ai-wallet-v1';
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const MIN_PASSWORD_LENGTH = 16;

export const THEYPAID_ASSETS = [
  'BTC', 'BCH', 'LTC', 'BSV', 'GRAM', 'DOGE', 'TON_USDT', 'TRX', 'TRON_USDT',
  'BNB', 'BSC_USDT', 'ETH', 'ETH_USDC',
] as const;

export type TheyPaidAsset = (typeof THEYPAID_ASSETS)[number];
type WalletNetwork = 'Bitcoin' | 'Bitcoin Cash' | 'Litecoin' | 'Bitcoin SV' | 'TON' | 'Dogecoin' | 'Tron' | 'BNB Smart Chain' | 'Ethereum';

type UtxoConfig = {
  kind: 'utxo';
  network: WalletNetwork;
  assets: TheyPaidAsset[];
  path: string;
  publicVersion?: number;
  privateVersion?: number;
  publicPrefix: 'xpub' | 'zpub' | 'Ltub';
  note?: string;
};

type AddressConfig = {
  kind: 'address';
  network: WalletNetwork;
  assets: TheyPaidAsset[];
  path: string;
};

type TonConfig = {
  kind: 'ton';
  network: WalletNetwork;
  assets: TheyPaidAsset[];
  path: 'TON WalletContractV4 R2';
};

type AssetConfig = UtxoConfig | AddressConfig | TonConfig;

const ASSET_CONFIG: Record<TheyPaidAsset, AssetConfig> = {
  BTC: { kind: 'utxo', network: 'Bitcoin', assets: ['BTC'], path: "m/84'/0'/0'", publicVersion: 0x04b24746, privateVersion: 0x04b2430c, publicPrefix: 'zpub', note: 'xpub حساب SegWit بومی طبق استاندارد BIP84 (zpub).' },
  BCH: { kind: 'utxo', network: 'Bitcoin Cash', assets: ['BCH'], path: "m/44'/145'/0'", publicPrefix: 'xpub', note: 'xpub حساب BIP44؛ مستندات TheyPaid فیلد xpub را معرفی می‌کند، اما مسیر مشتق‌سازی را مشخص نکرده است.' },
  LTC: { kind: 'utxo', network: 'Litecoin', assets: ['LTC'], path: "m/44'/2'/0'", publicPrefix: 'xpub', note: 'xpub استاندارد در مسیر حساب Litecoin از نوع BIP44. اعتبارسنج TheyPaid قالب Ltub را نپذیرفت و xpub استاندارد را قبول کرد.' },
  BSV: { kind: 'utxo', network: 'Bitcoin SV', assets: ['BSV'], path: "m/44'/236'/0'", publicPrefix: 'xpub', note: 'xpub حساب BIP44؛ مستندات TheyPaid فیلد xpub را معرفی می‌کند، اما مسیر مشتق‌سازی را مشخص نکرده است.' },
  GRAM: { kind: 'ton', network: 'TON', assets: ['GRAM', 'TON_USDT'], path: 'TON WalletContractV4 R2' },
  DOGE: { kind: 'utxo', network: 'Dogecoin', assets: ['DOGE'], path: "m/44'/3'/0'", publicPrefix: 'xpub', note: 'xpub حساب BIP44؛ مستندات TheyPaid فیلد xpub را معرفی می‌کند، اما مسیر مشتق‌سازی را مشخص نکرده است.' },
  TON_USDT: { kind: 'ton', network: 'TON', assets: ['GRAM', 'TON_USDT'], path: 'TON WalletContractV4 R2' },
  TRX: { kind: 'address', network: 'Tron', assets: ['TRX', 'TRON_USDT'], path: "m/44'/195'/0'/0/0" },
  TRON_USDT: { kind: 'address', network: 'Tron', assets: ['TRX', 'TRON_USDT'], path: "m/44'/195'/0'/0/0" },
  BNB: { kind: 'address', network: 'BNB Smart Chain', assets: ['BNB', 'BSC_USDT'], path: "m/44'/60'/0'/0/0" },
  BSC_USDT: { kind: 'address', network: 'BNB Smart Chain', assets: ['BNB', 'BSC_USDT'], path: "m/44'/60'/0'/0/0" },
  ETH: { kind: 'address', network: 'Ethereum', assets: ['ETH', 'ETH_USDC'], path: "m/44'/60'/0'/0/0" },
  ETH_USDC: { kind: 'address', network: 'Ethereum', assets: ['ETH', 'ETH_USDC'], path: "m/44'/60'/0'/0/0" },
};

export interface CreateWalletOptions {
  asset: TheyPaidAsset;
  password: string;
  directory?: string;
}

export interface CreatedWallet {
  asset: TheyPaidAsset;
  network: WalletNetwork;
  compatibleTheyPaidAssets: TheyPaidAsset[];
  walletFormat: 'address' | 'extended-public-key';
  address?: string;
  extendedPublicKey?: string;
  derivationPath: string;
  keystorePath: string;
  backup: string;
  note?: string;
}

interface EncryptedWalletFile {
  format: typeof WALLET_FORMAT;
  asset: TheyPaidAsset;
  network: WalletNetwork;
  derivationPath: string;
  walletFormat: CreatedWallet['walletFormat'];
  publicValue: string;
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  cipher: { name: 'aes-256-gcm'; iv: string; authTag: string; ciphertext: string };
}

export function isTheyPaidAsset(value: string): value is TheyPaidAsset {
  return (THEYPAID_ASSETS as readonly string[]).includes(value);
}

export function getWalletAssetInfo(asset: TheyPaidAsset) {
  const config = ASSET_CONFIG[asset];
  return {
    asset,
    network: config.network,
    compatibleTheyPaidAssets: [...config.assets],
    walletFormat: config.kind === 'utxo' ? 'extended-public-key' as const : 'address' as const,
    derivationPath: config.path,
  };
}

export function isValidWalletValue(asset: TheyPaidAsset, value: string): boolean {
  const config = ASSET_CONFIG[asset];
  if (config.kind === 'address') {
    if (config.network === 'Tron') return isValidTronAddress(value);
    return isAddress(value);
  }
  if (config.kind === 'ton') {
    try { Address.parse(value); return true; } catch { return false; }
  }
  try {
    const versions = config.publicVersion && config.privateVersion
      ? { public: config.publicVersion, private: config.privateVersion }
      : undefined;
    const hd = HDKey.fromExtendedKey(value, versions);
    return !hd.privateKey && value.startsWith(config.publicPrefix);
  } catch {
    return false;
  }
}

export async function createSupportedWallet(options: CreateWalletOptions): Promise<CreatedWallet> {
  if (options.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`گذرواژهٔ THEYPAID_WALLET_PASSWORD باید دست‌کم ${MIN_PASSWORD_LENGTH} نویسه باشد.`);
  }
  if (!isTheyPaidAsset(options.asset)) throw new Error('یکی از دارایی‌های پشتیبانی‌شدهٔ TheyPaid را انتخاب کنید.');

  const config = ASSET_CONFIG[options.asset];
  let mnemonic: string;
  let publicValue: string;
  let walletFormat: CreatedWallet['walletFormat'];
  let mnemonicType: 'bip39-english' | 'ton';

  if (config.kind === 'ton') {
    mnemonic = (await mnemonicNew(24)).join(' ');
    mnemonicType = 'ton';
    const pair = await mnemonicToPrivateKey(mnemonic.split(' '));
    const wallet = WalletContractV4.create({ workchain: 0, publicKey: pair.publicKey, walletId: 0x29a9a317 });
    publicValue = wallet.address.toString({ urlSafe: true, bounceable: false });
    pair.secretKey.fill(0);
    walletFormat = 'address';
  } else {
    mnemonic = generateMnemonic(wordlist, 256);
    mnemonicType = 'bip39-english';
    if (config.kind === 'utxo') {
      const seed = await mnemonicToSeed(mnemonic);
      const versions = config.publicVersion && config.privateVersion
        ? { public: config.publicVersion, private: config.privateVersion }
        : undefined;
      const root = HDKey.fromMasterSeed(seed, versions);
      seed.fill(0);
      const account = root.derive(config.path);
      publicValue = account.publicExtendedKey;
      account.wipePrivateData();
      root.wipePrivateData();
      walletFormat = 'extended-public-key';
    } else {
      const seed = await mnemonicToSeed(mnemonic);
      const root = HDKey.fromMasterSeed(seed);
      seed.fill(0);
      const child = root.derive(config.path);
      const publicKey = SigningKey.computePublicKey(hexlify(child.publicKey!), false);
      const evmAddress = computeAddress(publicKey);
      publicValue = config.network === 'Tron' ? tronAddressFromEvmAddress(evmAddress) : evmAddress;
      child.wipePrivateData();
      root.wipePrivateData();
      walletFormat = 'address';
    }
  }

  const directory = resolve(options.directory ?? join(homedir(), '.theypaid-ai', 'wallets'));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') await chmod(directory, 0o700);

  const encrypted = await encryptSecret(options.password, {
    format: WALLET_FORMAT,
    asset: options.asset,
    network: config.network,
    derivationPath: config.path,
    mnemonicType,
    mnemonic,
  });
  const file: EncryptedWalletFile = {
    format: WALLET_FORMAT,
    asset: options.asset,
    network: config.network,
    derivationPath: config.path,
    walletFormat,
    publicValue,
    kdf: encrypted.kdf,
    cipher: encrypted.cipher,
  };
  const fileName = `theypaid-${options.asset.toLowerCase()}-${createHash('sha256').update(publicValue).digest('hex').slice(0, 12)}.wallet.json`;
  const keystorePath = join(directory, fileName);
  await writeFile(keystorePath, `${JSON.stringify(file, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx', mode: 0o600,
  });

  return {
    asset: options.asset,
    network: config.network,
    compatibleTheyPaidAssets: [...config.assets],
    walletFormat,
    ...(walletFormat === 'address' ? { address: publicValue } : { extendedPublicKey: publicValue }),
    derivationPath: config.path,
    keystorePath,
    backup: 'از فایل رمزگذاری‌شدهٔ کیف‌پول و گذرواژهٔ THEYPAID_WALLET_PASSWORD جداگانه نسخهٔ پشتیبان بگیرید. فایل عبارت بازیابی را رمزگذاری‌شده نگه می‌دارد؛ عبارت و کلید خصوصی به عامل داده نمی‌شوند.',
    ...('note' in config && config.note ? { note: config.note } : {}),
  };
}

export async function decryptWalletMnemonic(input: unknown, password: string): Promise<string> {
  if (!isEncryptedWalletFile(input)) {
    throw new Error('فایل کیف‌پول نامعتبر است یا گذرواژه درست نیست.');
  }
  const file = input;
  const payload = await decryptSecret(password, file.kdf, file.cipher);
  let secret: { format: string; asset: string; network: string; derivationPath: string; mnemonicType: string; mnemonic: string };
  try {
    secret = JSON.parse(payload) as typeof secret;
  } catch {
    throw new Error('فایل کیف‌پول نامعتبر است یا گذرواژه درست نیست.');
  }
  if (
    secret.format !== WALLET_FORMAT || secret.asset !== file.asset || secret.network !== file.network ||
    secret.derivationPath !== file.derivationPath || typeof secret.mnemonic !== 'string' ||
    !['bip39-english', 'ton'].includes(secret.mnemonicType)
  ) {
    throw new Error('فایل کیف‌پول نامعتبر است یا گذرواژه درست نیست.');
  }
  return secret.mnemonic;
}

function isEncryptedWalletFile(value: unknown): value is EncryptedWalletFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<EncryptedWalletFile>;
  if (file.format !== WALLET_FORMAT || typeof file.asset !== 'string' || !isTheyPaidAsset(file.asset)) return false;
  const config = ASSET_CONFIG[file.asset];
  const expectedFormat = config.kind === 'utxo' ? 'extended-public-key' : 'address';
  if (file.network !== config.network || file.derivationPath !== config.path || file.walletFormat !== expectedFormat) return false;
  if (typeof file.publicValue !== 'string' || !isValidWalletValue(file.asset, file.publicValue)) return false;
  if (!file.kdf || file.kdf.name !== 'scrypt' || file.kdf.N !== SCRYPT_N || file.kdf.r !== SCRYPT_R || file.kdf.p !== SCRYPT_P) return false;
  if (!file.cipher || file.cipher.name !== 'aes-256-gcm') return false;
  return isBase64OfLength(file.kdf.salt, 16) && isBase64OfLength(file.cipher.iv, 12) &&
    isBase64OfLength(file.cipher.authTag, 16) && isBase64AtMost(file.cipher.ciphertext, 8192);
}

function isBase64OfLength(value: unknown, length: number): value is string {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === length && decoded.toString('base64') === value;
}

function isBase64AtMost(value: unknown, maxLength: number): value is string {
  if (typeof value !== 'string' || value.length > Math.ceil(maxLength / 3) * 4) return false;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  const decoded = Buffer.from(value, 'base64');
  return decoded.length > 0 && decoded.length <= maxLength && decoded.toString('base64') === value;
}

function tronAddressFromEvmAddress(evmAddress: string): string {
  const payload = Buffer.from(`41${evmAddress.slice(2)}`, 'hex');
  const first = createHash('sha256').update(payload).digest();
  const checksum = createHash('sha256').update(first).digest().subarray(0, 4);
  return base58.encode(Buffer.concat([payload, checksum]));
}

function isValidTronAddress(value: string): boolean {
  try {
    const decoded = Buffer.from(base58.decode(value));
    if (decoded.length !== 25 || decoded[0] !== 0x41) return false;
    const payload = decoded.subarray(0, 21);
    const first = createHash('sha256').update(payload).digest();
    const expected = createHash('sha256').update(first).digest().subarray(0, 4);
    return expected.equals(decoded.subarray(21));
  } catch {
    return false;
  }
}

async function encryptSecret(password: string, secret: Record<string, unknown>) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt);
  const plaintext = Buffer.from(JSON.stringify(secret), 'utf8');
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      kdf: { name: 'scrypt' as const, N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, salt: salt.toString('base64') },
      cipher: { name: 'aes-256-gcm' as const, iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') },
    };
  } finally {
    key.fill(0);
    plaintext.fill(0);
  }
}

async function decryptSecret(
  password: string,
  kdf: EncryptedWalletFile['kdf'],
  cipherData: EncryptedWalletFile['cipher'],
): Promise<string> {
  if (kdf.name !== 'scrypt' || kdf.N !== SCRYPT_N || kdf.r !== SCRYPT_R || kdf.p !== SCRYPT_P || cipherData.name !== 'aes-256-gcm') {
    throw new Error('قالب فایل رمزگذاری‌شدهٔ کیف‌پول پشتیبانی نمی‌شود.');
  }
  const key = await deriveKey(password, Buffer.from(kdf.salt, 'base64'));
  const ciphertext = Buffer.from(cipherData.ciphertext, 'base64');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(cipherData.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(cipherData.authTag, 'base64'));
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('فایل کیف‌پول نامعتبر است یا گذرواژه درست نیست.');
  } finally {
    key.fill(0);
    ciphertext.fill(0);
  }
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 32, {
      N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 128 * 1024 * 1024,
    }, (error, key) => error ? reject(error) : resolve(key as Buffer));
  });
}
