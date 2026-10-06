import { normalizeAmount } from './amount.js';
import { normalizeAddress } from './checksum.js';
import { CHAIN_CONFIGS, DEFAULT_NETWORK, JPYC_DECIMALS } from './constants.js';
import { encodeEIP681, jpyToWei } from './encoder.js';
import { JPYCPaymentError } from './errors.js';
import type { PaymentURIOptions, PaymentURIResult } from './types.js';
import { snapshotOptions, validateGenerateOptions } from './validator.js';

/**
 * JPYC支払い用のURIを生成
 * @param options - URI生成オプション
 * @returns URI生成結果
 * @throws {JPYCPaymentError} バリデーションまたは生成に失敗した場合
 */
export function generatePaymentURI(options: PaymentURIOptions): PaymentURIResult {
    // 検証とURI生成で同じ値を使うため、オプションを一度だけ読み取る
    const opts = snapshotOptions(options);

    // バリデーション
    const validation = validateGenerateOptions(opts);
    if (!validation.valid) {
        throw new JPYCPaymentError(
            `バリデーションに失敗しました（${validation.errors.length}件）: ${validation.errors.join(' / ')}`,
            'VALIDATION_FAILED',
            { errors: validation.errors, issues: validation.issues }
        );
    }

    // デフォルト値の設定（無効なネットワークは上のバリデーションで弾かれている）
    const baseNetwork = opts.network ?? DEFAULT_NETWORK;
    const chainConfig = CHAIN_CONFIGS[baseNetwork];
    // chainId指定時（jpycContractAddress必須・network同時指定不可はバリデーション済み）は'custom'として扱う
    const network = opts.chainId !== undefined ? 'custom' : baseNetwork;
    const chainId = opts.chainId ?? chainConfig.chainId;
    // 戻り値とURIの表記を揃えるため、EIP-55チェックサム形式に正規化
    const jpycAddress = normalizeAddress(opts.jpycContractAddress ?? chainConfig.jpycAddress);
    const merchantAddress = normalizeAddress(opts.merchantAddress);
    const decimals = opts.decimals ?? JPYC_DECIMALS;

    // Wei変換
    const amountWei = jpyToWei(opts.amount, decimals);

    // URI生成
    const uri = encodeEIP681(jpycAddress, merchantAddress, amountWei, chainId);

    return {
        uri,
        chainId,
        network,
        jpycContractAddress: jpycAddress,
        amountWei,
        // 文字列は指定どおり、数値は指数表記（1e-7など）を避けて10進数表記にする
        amountJPY: typeof opts.amount === 'string' ? opts.amount : normalizeAmount(opts.amount),
        decimals,
        warnings: validation.warnings,
    };
}
