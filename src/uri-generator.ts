import { CHAIN_CONFIGS, DEFAULT_NETWORK, JPYC_DECIMALS } from './constants.js';
import { encodeEIP681, jpyToWei } from './encoder.js';
import { JPYCPaymentError } from './errors.js';
import type { PaymentURIOptions, PaymentURIResult } from './types.js';
import { validateGenerateOptions } from './validator.js';

/**
 * JPYC支払い用のURIを生成
 * @param options - URI生成オプション
 * @returns URI生成結果
 * @throws {JPYCPaymentError} バリデーションまたは生成に失敗した場合
 */
export function generatePaymentURI(options: PaymentURIOptions): PaymentURIResult {
    // バリデーション
    const validation = validateGenerateOptions(options);
    if (!validation.valid) {
        throw new JPYCPaymentError(
            `バリデーションに失敗しました: ${validation.errors.join(', ')}`,
            'VALIDATION_FAILED',
            { errors: validation.errors }
        );
    }

    // デフォルト値の設定
    const network = options.network ?? DEFAULT_NETWORK;
    const chainConfig = CHAIN_CONFIGS[network];
    if (!chainConfig) {
        throw new JPYCPaymentError(
            `サポートされていないネットワークです: ${network}`,
            'INVALID_NETWORK'
        );
    }

    const jpycAddress = options.jpycContractAddress ?? chainConfig.jpycAddress;
    const decimals = options.decimals ?? JPYC_DECIMALS;

    // Wei変換
    const amountWei = jpyToWei(options.amount, decimals);

    // URI生成
    const uri = encodeEIP681(jpycAddress, options.merchantAddress, amountWei, chainConfig.chainId);

    return {
        uri,
        chainId: chainConfig.chainId,
        network,
        jpycContractAddress: jpycAddress,
        amountWei,
        amountJPY: options.amount.toString(),
        decimals,
        warnings: validation.warnings,
    };
}
