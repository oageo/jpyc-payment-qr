import { isValidAddressFormat } from './checksum.js';
import { ADDRESS_REGEX, CHAIN_CONFIGS, MAX_SAFE_AMOUNT } from './constants.js';
import type { PaymentURIOptions, ValidationResult, Warning } from './types.js';

/**
 * 支払いURI生成オプションのバリデーション
 * @param options - バリデーションするオプション
 * @returns バリデーション結果
 */
export function validateGenerateOptions(options: PaymentURIOptions): ValidationResult {
    const errors: string[] = [];
    const warnings: Warning[] = [];

    // merchantAddressの検証
    if (!options.merchantAddress) {
        errors.push('merchantAddressは必須です');
    } else if (!isValidAddressFormat(options.merchantAddress)) {
        errors.push(
            `無効な加盟店アドレス形式です: ${options.merchantAddress}。0xで始まる42文字の16進数である必要があります`
        );
    }

    // amountの検証
    if (options.amount === undefined || options.amount === null || options.amount === '') {
        errors.push('amountは必須です');
    } else {
        const amountNum =
            typeof options.amount === 'string' ? Number.parseFloat(options.amount) : options.amount;

        if (Number.isNaN(amountNum)) {
            errors.push(`無効な金額形式です: ${options.amount}`);
        } else if (amountNum <= 0) {
            errors.push(`金額は正の数である必要があります: ${amountNum}`);
        } else if (!Number.isFinite(amountNum)) {
            errors.push('金額は有限の数値である必要があります');
        } else if (amountNum > MAX_SAFE_AMOUNT) {
            errors.push(`金額が大きすぎます: ${amountNum}。最大値は ${MAX_SAFE_AMOUNT} JPYです`);
        }

        // 小額の警告
        if (amountNum < 1 && amountNum > 0) {
            warnings.push({
                code: 'SMALL_AMOUNT',
                message: `金額が1 JPY未満です: ${amountNum}。意図した金額か確認してください`,
            });
        }

        // 高額の警告
        if (amountNum > 1000000) {
            warnings.push({
                code: 'LARGE_AMOUNT',
                message: `金額が100万JPYを超えています: ${amountNum}。意図した金額か確認してください`,
            });
        }
    }

    // networkの検証
    if (options.network !== undefined) {
        if (!CHAIN_CONFIGS[options.network]) {
            errors.push(
                `サポートされていないネットワークです: ${options.network}。` +
                    `サポートされているネットワーク: ${Object.keys(CHAIN_CONFIGS).join(', ')}`
            );
        }
    }

    // jpycContractAddressの検証
    if (options.jpycContractAddress !== undefined) {
        if (!isValidAddressFormat(options.jpycContractAddress)) {
            errors.push(
                `無効なコントラクトアドレス形式です: ${options.jpycContractAddress}。0xで始まる42文字の16進数である必要があります`
            );
        } else {
            warnings.push({
                code: 'CUSTOM_CONTRACT',
                message:
                    'カスタムコントラクトアドレスが指定されています。' +
                    '正しいJPYCコントラクトアドレスであることを確認してください',
            });
        }
    }

    // decimalsの検証
    if (options.decimals !== undefined) {
        if (!Number.isInteger(options.decimals) || options.decimals < 0 || options.decimals > 18) {
            errors.push(`decimalsは0から18の整数である必要があります: ${options.decimals}`);
        }

        // decimalsはカスタムコントラクトアドレス指定時のみ有効
        if (!options.jpycContractAddress) {
            errors.push('decimalsはjpycContractAddressと併用する場合のみ指定できます');
        }

        // 標準の18以外は警告
        if (options.decimals !== 18) {
            warnings.push({
                code: 'CUSTOM_DECIMALS',
                message: `非標準のdecimalsが指定されています: ${options.decimals}。コントラクトと一致することを確認してください`,
            });
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Ethereumアドレスの検証（エイリアス関数）
 * @param address - 検証するアドレス
 * @returns アドレスが有効かどうか
 */
export function isValidAddress(address: string): boolean {
    return ADDRESS_REGEX.test(address);
}

/**
 * 金額の検証
 * @param amount - 検証する金額
 * @returns 金額が有効かどうか
 */
export function isValidAmount(amount: number | string): boolean {
    const amountNum = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
    return (
        !Number.isNaN(amountNum) &&
        Number.isFinite(amountNum) &&
        amountNum > 0 &&
        amountNum <= MAX_SAFE_AMOUNT
    );
}
