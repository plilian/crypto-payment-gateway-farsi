import type { TheyPaidAsset } from '../wallet/wallet.js';

export interface TheyPaidAssetCatalogItem {
  asset: TheyPaidAsset;
  assetId: string;
  name: string;
  symbol: string;
  network: string;
  type: 'UTXO-Based' | 'Account-Based';
}

// شناسه‌ها و برچسب‌ها از انتخاب‌گر دارایی در راه‌انداز فروشگاه TheyPaid
// (۲۰۲۶/۱۰/۱۵) گرفته شده‌اند. API عمومی TheyPaid فقط دارایی‌های فعال فروشگاه را برمی‌گرداند.
export const THEYPAID_ASSET_CATALOG: readonly TheyPaidAssetCatalogItem[] = [
  { asset: 'BTC', assetId: 'bc6061b7-846a-4ca2-8c69-4b6515951fe2', name: 'Bitcoin', symbol: 'BTC', network: 'Bitcoin', type: 'UTXO-Based' },
  { asset: 'BCH', assetId: 'd82f5c76-32db-4d30-85af-0696db832814', name: 'Bitcoin Cash', symbol: 'BCH', network: 'Bitcoin Cash', type: 'UTXO-Based' },
  { asset: 'LTC', assetId: '333a3d08-d6ab-41f2-a565-fb93b17548c0', name: 'Litecoin', symbol: 'LTC', network: 'Litecoin', type: 'UTXO-Based' },
  { asset: 'BSV', assetId: '234273d5-fbe0-4b6e-89db-e53739fc7aab', name: 'Bitcoin SV', symbol: 'BSV', network: 'Bitcoin SV', type: 'UTXO-Based' },
  { asset: 'GRAM', assetId: '04516b72-3adf-4471-9be2-6287bbb5fe5e', name: 'TON GRAM', symbol: 'GRAM', network: 'TON', type: 'Account-Based' },
  { asset: 'DOGE', assetId: '9199fa96-c059-4151-b93d-f54ff21158df', name: 'Dogecoin', symbol: 'DOGE', network: 'Dogecoin', type: 'UTXO-Based' },
  { asset: 'TON_USDT', assetId: '85268720-4b30-4119-b9ac-985bb13d06cb', name: 'TON USDT', symbol: 'USDT', network: 'TON', type: 'Account-Based' },
  { asset: 'TRX', assetId: '8a1296d5-c62c-46c3-ba40-83a0fc65befe', name: 'Tron', symbol: 'TRX', network: 'Tron', type: 'Account-Based' },
  { asset: 'TRON_USDT', assetId: '21b9b744-6697-45b8-9095-edae01d85bf1', name: 'Tron USDT', symbol: 'USDT', network: 'Tron', type: 'Account-Based' },
  { asset: 'BNB', assetId: '7c4e2a11-6b3d-4f8a-9c21-0d5e8a7b6c41', name: 'BNB Smart Chain BNB', symbol: 'BNB', network: 'BNB Smart Chain', type: 'Account-Based' },
  { asset: 'BSC_USDT', assetId: '3f9a1c88-2e47-4b6d-a1f0-8c5d7e9b2a64', name: 'BNB Smart Chain USDT', symbol: 'USDT', network: 'BNB Smart Chain', type: 'Account-Based' },
  { asset: 'ETH', assetId: '6f0c8a2e-1b47-4d93-8e15-9a0c3d7f2b61', name: 'Ethereum', symbol: 'ETH', network: 'Ethereum', type: 'Account-Based' },
  { asset: 'ETH_USDC', assetId: '8e4d1c90-6a25-4f7b-9d32-1c8b5e0a7f43', name: 'Ethereum USDC', symbol: 'USDC', network: 'Ethereum', type: 'Account-Based' },
];

export function getTheyPaidAsset(asset: TheyPaidAsset): TheyPaidAssetCatalogItem {
  const item = THEYPAID_ASSET_CATALOG.find((candidate) => candidate.asset === asset);
  if (!item) throw new Error('یکی از دارایی‌های فهرست‌شده در TheyPaid را انتخاب کنید.');
  return item;
}
