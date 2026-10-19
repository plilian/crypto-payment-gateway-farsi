import { z } from 'zod';
import { THEYPAID_ASSETS } from '../wallet/wallet.js';

export const theyPaidAssetSchema = z.enum(THEYPAID_ASSETS);

export const walletValidationSchema = z.object({
  asset: theyPaidAssetSchema,
  publicValue: z.string().trim().min(1).max(200),
}).strict();

export const invoiceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'شناسهٔ فاکتور دارای نویسهٔ پشتیبانی‌نشده است');

export const createInvoiceSchema = z.object({
  assetId: z.string().uuid(),
  amountInTether: z.number().finite().positive(),
  acceptToleranceInTether: z.number().finite().nonnegative(),
  requiredConfirmations: z.number().int().nonnegative().optional(),
  description: z.string().trim().optional(),
  redirectUrl: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === 'https:', 'نشانی redirectUrl باید از HTTPS استفاده کند')
    .optional(),
}).strict();

export const listInvoicesSchema = z.object({
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(20),
}).strict();

export const waitOptionsSchema = z.object({
  intervalMs: z.number().int().min(5_000).max(60_000).default(5_000),
  timeoutMs: z.number().int().min(5_000).max(3_600_000).default(300_000),
}).strict();

export const checkPaymentSchema = z.object({
  invoiceId: invoiceIdSchema,
  expectedAssetId: z.string().uuid().optional(),
  expectedAmountInTether: z.number().finite().positive().optional(),
}).strict();

export const storeIdSchema = z.string().uuid();

export const storeCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  website: z.string().trim().max(2048).optional(),
  industry: z.string().trim().max(100).optional(),
  description: z.string().trim().max(1000).optional(),
}).strict();

export const storeSelectionSchema = z.object({
  storeId: storeIdSchema,
}).strict();

export const storeUpdateSchema = z.object({
  storeId: storeIdSchema,
  name: z.string().trim().min(1).max(100).optional(),
  website: z.string().trim().max(2048).optional(),
  industry: z.string().trim().max(100).optional(),
  description: z.string().trim().max(1000).optional(),
}).strict();

export const walletConnectionSchema = z.object({
  storeId: storeIdSchema.optional(),
  asset: theyPaidAssetSchema,
  publicValue: z.string().trim().min(1).max(200),
  confirm: z.literal(true),
}).strict();

const confirmSchema = z.literal(true);
const optionalTwoFactorCodeSchema = z.string().trim().regex(/^\d{6}$/).optional();

export const walletUpdateSchema = z.object({
  storeId: storeIdSchema.optional(),
  asset: theyPaidAssetSchema,
  publicValue: z.string().trim().min(1).max(200),
  confirm: confirmSchema,
  code: optionalTwoFactorCodeSchema,
}).strict();

export const storeAssetStatusSchema = z.object({
  storeId: storeIdSchema.optional(),
  asset: theyPaidAssetSchema,
  enabled: z.boolean(),
  confirm: confirmSchema,
  code: optionalTwoFactorCodeSchema,
}).strict();

export const removeStoreAssetSchema = z.object({
  storeId: storeIdSchema.optional(),
  asset: theyPaidAssetSchema,
  confirm: confirmSchema,
  code: optionalTwoFactorCodeSchema,
}).strict();

export const storeApiKeyRevokeSchema = z.object({
  storeId: storeIdSchema.optional(),
  confirm: confirmSchema,
  code: optionalTwoFactorCodeSchema,
}).strict();

export const storeStatusSchema = z.object({
  storeId: storeIdSchema.optional(),
  active: z.boolean(),
  confirm: confirmSchema,
  code: optionalTwoFactorCodeSchema,
}).strict();

export const deleteStoreSchema = z.object({
  storeId: storeIdSchema.optional(),
  confirmStoreName: z.string().trim().min(1).max(100),
  code: optionalTwoFactorCodeSchema,
}).strict();

export const createPaymentLinkSchema = z.object({
  storeId: storeIdSchema.optional(),
  assetId: z.string().uuid(),
  amountInTether: z.number().finite().positive().max(100000000),
  description: z.string().trim().max(255).optional(),
  confirm: confirmSchema,
}).strict();

export const twoFactorCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/),
}).strict();

export const topupCreditSchema = z.object({
  amountInTether: z.number().finite().positive().max(1000000),
  asset: theyPaidAssetSchema,
  confirm: z.literal(true),
}).strict();
