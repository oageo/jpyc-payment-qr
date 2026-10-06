import { isValidDecimals, validateAmount } from './amount.js';
import { isZeroAddress, normalizeAddress } from './checksum.js';
import { CHAIN_CONFIGS, JPYC_DECIMALS } from './constants.js';
import { JPYCPaymentError, type JPYCPaymentErrorCode, displayValue } from './errors.js';
import type { PaymentURIOptions, ValidationIssue, ValidationResult, Warning } from './types.js';

/**
 * アドレスの検証結果
 */
type AddressCheck = { kind: 'ok' } | { kind: 'checksum' } | { kind: 'format'; reason: string };

/**
 * アドレスを検証し、結果を分類する（normalizeAddressの例外を判定に変換）
 * @param address - 検証するアドレス
 * @returns 有効、チェックサム不一致、形式不正（理由付き）のいずれか
 */
function checkAddress(address: unknown): AddressCheck {
    try {
        normalizeAddress(address as string);
        return { kind: 'ok' };
    } catch (error) {
        if (error instanceof JPYCPaymentError && error.code === 'CHECKSUM_FAILED') {
            return { kind: 'checksum' };
        }
        const reason =
            error instanceof JPYCPaymentError ? error.message : 'アドレスの形式が不正です';
        return { kind: 'format', reason };
    }
}

/**
 * PaymentURIOptions のキー
 */
const OPTION_KEYS = [
    'merchantAddress',
    'amount',
    'network',
    'jpycContractAddress',
    'chainId',
    'decimals',
] as const;

/**
 * オプションの各プロパティを一度だけ読み取ったコピーを作る
 * - getterやProxyで読むたびに値が変わるオブジェクトでも、検証した値とURI生成に使う値を一致させる
 * - 自身のプロパティだけを読む（Object.prototypeが汚染されていても、省略した項目に汚染値が入らないようにする）
 * @param options - 利用者が渡したオプション
 * @returns オプションのコピー（optionsがオブジェクトでない場合はそのまま返す）
 */
export function snapshotOptions(options: PaymentURIOptions): PaymentURIOptions {
    if (typeof options !== 'object' || options === null) {
        return options;
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of OPTION_KEYS) {
        snapshot[key] = Object.prototype.hasOwnProperty.call(options, key)
            ? options[key]
            : undefined;
    }
    return snapshot as unknown as PaymentURIOptions;
}

/**
 * 値が指定されているか（undefined・null・空文字は未指定とみなす）
 */
function isPresent(value: unknown): boolean {
    return value !== undefined && value !== null && value !== '';
}

/**
 * 支払いURI生成オプションのバリデーション
 * 各エラーメッセージは「<項目名>: <内容>」の形式で、issuesには項目名とエラーコードも入る
 * @param options - バリデーションするオプション
 * @returns バリデーション結果（errorsとissuesは同じ順序で対応する）
 */
export function validateGenerateOptions(options: PaymentURIOptions): ValidationResult {
    const issues: ValidationIssue[] = [];
    const warnings: Warning[] = [];

    const addIssue = (
        field: ValidationIssue['field'],
        code: JPYCPaymentErrorCode,
        message: string
    ): void => {
        issues.push({ field, code, message: `${field}: ${message}` });
    };

    const result = (): ValidationResult => ({
        valid: issues.length === 0,
        errors: issues.map((issue) => issue.message),
        issues,
        warnings,
    });

    // 検証は自身のプロパティを一度だけ読み取ったコピーに対して行う
    const opts = snapshotOptions(options);
    if (typeof opts !== 'object' || opts === null) {
        addIssue('options', 'VALIDATION_FAILED', 'オプションはオブジェクトで指定してください');
        return result();
    }

    const hasCustomContract = opts.jpycContractAddress !== undefined;

    // merchantAddressの検証
    if (!isPresent(opts.merchantAddress)) {
        addIssue('merchantAddress', 'INVALID_ADDRESS', '受取アドレスが指定されていません');
    } else {
        const merchantCheck = checkAddress(opts.merchantAddress);
        if (merchantCheck.kind === 'format') {
            addIssue('merchantAddress', 'INVALID_ADDRESS', merchantCheck.reason);
        } else if (merchantCheck.kind === 'checksum') {
            addIssue(
                'merchantAddress',
                'CHECKSUM_FAILED',
                `アドレスのチェックサムが一致しません。打ち間違いがないか確認してください: ${displayValue(opts.merchantAddress)}`
            );
        }
    }

    // amountの検証
    if (!isPresent(opts.amount)) {
        addIssue('amount', 'INVALID_AMOUNT', '金額が指定されていません');
    } else {
        // generatePaymentURIのWei変換と同じロジック（parseAmountToWei）で検証する。
        // decimalsは有効に使われる場合（カスタムコントラクト併用・0〜18の整数）だけ反映し、
        // それ以外はdecimals側のエラーになるため、金額は標準値で検証する（金額に余計なエラーを出さない）
        const decimals =
            hasCustomContract && isValidDecimals(opts.decimals) ? opts.decimals : JPYC_DECIMALS;
        const amountResult = validateAmount(opts.amount, decimals);
        for (const message of amountResult.errors) {
            addIssue('amount', 'INVALID_AMOUNT', message);
        }
        warnings.push(...amountResult.warnings);
    }

    // networkの検証（'toString'などのプロトタイプ由来のキーや、文字列以外の値を通さない）
    if (
        opts.network !== undefined &&
        (typeof opts.network !== 'string' ||
            !Object.prototype.hasOwnProperty.call(CHAIN_CONFIGS, opts.network))
    ) {
        addIssue(
            'network',
            'INVALID_NETWORK',
            `サポートされていないネットワークです（${Object.keys(CHAIN_CONFIGS).join(' / ')} のいずれかを小文字で指定してください）: ${displayValue(opts.network)}`
        );
    }

    // jpycContractAddressの検証
    if (hasCustomContract) {
        const contractCheck = checkAddress(opts.jpycContractAddress);
        if (contractCheck.kind === 'format') {
            addIssue('jpycContractAddress', 'INVALID_ADDRESS', contractCheck.reason);
        } else if (contractCheck.kind === 'checksum') {
            addIssue(
                'jpycContractAddress',
                'CHECKSUM_FAILED',
                `アドレスのチェックサムが一致しません。打ち間違いがないか確認してください: ${displayValue(opts.jpycContractAddress)}`
            );
        } else if (isZeroAddress(String(opts.jpycContractAddress))) {
            addIssue(
                'jpycContractAddress',
                'INVALID_ADDRESS',
                'ゼロアドレス（0x000…0）はコントラクトアドレスに指定できません。JPYCのコントラクトアドレスを指定してください'
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

    // 受取アドレスの取り違えの検証（ゼロアドレスやトークンのコントラクトに送金すると資金を取り戻せない）
    if (isPresent(opts.merchantAddress) && checkAddress(opts.merchantAddress).kind === 'ok') {
        const merchant = String(opts.merchantAddress).toLowerCase();
        const tokenContracts = Object.values(CHAIN_CONFIGS).map((config) =>
            config.jpycAddress.toLowerCase()
        );
        if (typeof opts.jpycContractAddress === 'string') {
            tokenContracts.push(opts.jpycContractAddress.toLowerCase());
        }

        if (isZeroAddress(merchant)) {
            addIssue(
                'merchantAddress',
                'INVALID_ADDRESS',
                'ゼロアドレス（0x000…0）は受取アドレスに指定できません（送金した資金を取り戻せなくなります）'
            );
        } else if (tokenContracts.includes(merchant)) {
            addIssue(
                'merchantAddress',
                'INVALID_ADDRESS',
                `トークンのコントラクトアドレスが受取アドレスに指定されています。受取アドレスとコントラクトアドレスを取り違えていないか確認してください（送金した資金を取り戻せなくなります）: ${displayValue(opts.merchantAddress)}`
            );
        }
    }

    // decimalsの検証（カスタムコントラクトアドレス指定時のみ指定可）
    if (opts.decimals !== undefined) {
        if (!hasCustomContract) {
            addIssue(
                'decimals',
                'INVALID_DECIMALS',
                'decimalsはjpycContractAddressと併用する場合のみ指定できます（JPYCのdecimalsは18で固定です）'
            );
        } else if (!isValidDecimals(opts.decimals)) {
            addIssue(
                'decimals',
                'INVALID_DECIMALS',
                `decimalsは0から18の整数で指定してください: ${displayValue(opts.decimals)}`
            );
        } else if (opts.decimals !== JPYC_DECIMALS) {
            // 標準の18以外は警告
            warnings.push({
                code: 'CUSTOM_DECIMALS',
                message: `非標準のdecimalsが指定されています: ${opts.decimals}。コントラクトと一致することを確認してください`,
            });
        }
    }

    // chainIdの検証（テストネットや独自チェーン用。カスタムコントラクトアドレス指定時のみ、networkとは排他）
    if (opts.chainId !== undefined) {
        if (!hasCustomContract) {
            addIssue(
                'chainId',
                'INVALID_NETWORK',
                'chainIdはjpycContractAddressと併用する場合のみ指定できます（メインネットはnetworkで指定してください）'
            );
        } else if (opts.network !== undefined) {
            // networkとchainIdはどちらでチェーンを決めるかが曖昧になるため同時指定不可
            addIssue(
                'chainId',
                'INVALID_NETWORK',
                'chainIdとnetworkは同時に指定できません。どちらか一方を指定してください'
            );
        } else if (!Number.isSafeInteger(opts.chainId) || opts.chainId <= 0) {
            addIssue(
                'chainId',
                'INVALID_NETWORK',
                `chainIdは1以上 ${Number.MAX_SAFE_INTEGER} 以下の整数（数値型）で指定してください: ${displayValue(opts.chainId)}`
            );
        } else {
            warnings.push({
                code: 'CUSTOM_CHAIN_ID',
                message: `カスタムチェーンIDが指定されています: ${opts.chainId}。チェーンIDとコントラクトアドレスの組み合わせが正しいか確認してください`,
            });
        }
    }

    return result();
}

/**
 * Ethereumアドレスの検証（形式 + 大文字小文字混在時のEIP-55チェックサム）
 * 全て小文字・全て大文字のアドレスはチェックサムを持たないため、形式のみ検証する。
 * 大文字小文字が混在していてチェックサムが一致しない場合はfalseを返す。
 * 形式だけを検証したい場合はisValidAddressFormatを使用
 * @param address - 検証するアドレス
 * @returns アドレスが有効かどうか
 */
export function isValidAddress(address: string): boolean {
    return checkAddress(address).kind === 'ok';
}

/**
 * isValidAmount のオプション
 */
export interface IsValidAmountOptions {
    /** トークンのdecimals（デフォルト: 18） */
    decimals?: number;
}

/**
 * 金額の検証（validateGenerateOptionsの金額検証と同じロジック）
 * 0より大きくMAX_SAFE_AMOUNT以下で、指定decimalsのWeiへ端数なく変換できる場合のみtrue
 *
 * 第2引数をオブジェクトにしているのは、JavaScriptで配列のコールバックとして直接渡したときに、
 * 要素の位置（index）がdecimalsとして解釈されないようにするため（オブジェクト以外は無視する）。
 * TypeScriptでは `amounts.every((amount) => isValidAmount(amount))` のように呼び出す
 * @param amount - 検証する金額
 * @param options - オプション（decimals）。オブジェクト以外は無視する
 * @returns 金額が有効かどうか
 */
export function isValidAmount(amount: number | string, options?: IsValidAmountOptions): boolean {
    const decimals =
        typeof options === 'object' && options !== null && options.decimals !== undefined
            ? options.decimals
            : JPYC_DECIMALS;
    return validateAmount(amount, decimals).errors.length === 0;
}
