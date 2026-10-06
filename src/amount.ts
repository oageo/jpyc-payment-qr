import { AMOUNT_FORMAT_REGEX, JPYC_DECIMALS, MAX_SAFE_AMOUNT } from './constants.js';
import { JPYCPaymentError, displayValue, previewValue, typeName } from './errors.js';
import type { Warning } from './types.js';

/**
 * number型の金額で許容する有効数字の最大桁数
 * これを超えると浮動小数点誤差（例: 0.1 + 0.2 = 0.30000000000000004）が金額に混入するおそれがある
 */
const MAX_NUMBER_SIGNIFICANT_DIGITS = 15;

/**
 * 文字列の金額の最大長
 * 最大金額（16桁）+ 小数点 + 小数18桁 = 35文字に、末尾の0などの余裕を持たせた値。
 * 巨大な入力の処理に時間がかかるのを防ぐ
 */
const MAX_AMOUNT_STRING_LENGTH = 100;

/**
 * 末尾の0を取り除く
 * （/0+$/ は0が長く続く入力で処理時間が入力長の2乗に比例するため、ループで処理する）
 */
function trimTrailingZeros(str: string): string {
    let end = str.length;
    while (end > 0 && str.charCodeAt(end - 1) === 0x30) {
        end--;
    }
    return str.slice(0, end);
}

/**
 * Number#toString() が返す指数表記（例: "1e-7", "1.5e+21"）の解析用正規表現
 */
const EXPONENTIAL_REGEX = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/;

/**
 * 形式が不正な金額文字列について、よくある原因を判定してヒントを返す（該当なしは空文字）
 * 複数該当する場合は最初に見つかったものだけを返す
 */
function amountFormatHint(amount: string): string {
    if (/[,，]/.test(amount)) {
        return '（桁区切りのカンマは使えません）';
    }
    if (/[０-９．]/.test(amount)) {
        return '（全角文字が含まれています）';
    }
    if (amount !== amount.trim()) {
        return '（前後に空白や改行があります）';
    }
    if (/\d[eE][+-]?\d/.test(amount)) {
        return '（文字列では指数表記は使えません。10進数で書いてください）';
    }
    if (/円|[¥￥]|jpy/i.test(amount)) {
        return '（通貨単位は付けないでください）';
    }
    return '';
}

/**
 * decimalsのバリデーション
 * @param decimals - トークンのdecimals
 * @throws {JPYCPaymentError} 0から18の整数でない場合
 */
export function assertValidDecimals(decimals: number): void {
    if (!isValidDecimals(decimals)) {
        throw new JPYCPaymentError(
            `decimalsは0から18の整数である必要があります: ${displayValue(decimals)}`,
            'INVALID_DECIMALS'
        );
    }
}

/**
 * decimalsが有効（0から18の整数）かどうか
 * @param decimals - 検証する値
 * @returns 有効な場合true
 */
export function isValidDecimals(decimals: unknown): decimals is number {
    return (
        typeof decimals === 'number' &&
        Number.isInteger(decimals) &&
        decimals >= 0 &&
        decimals <= 18
    );
}

/**
 * 10進数文字列（AMOUNT_FORMAT_REGEXに一致するもの）を正規形に整える
 * 整数部の先頭の0と小数部の末尾の0を除去する（例: ".50" → "0.5"、"007." → "7"）
 */
function canonicalize(decimalStr: string): string {
    const [intPart = '', decPart = ''] = decimalStr.split('.');
    const intNorm = intPart.replace(/^0+/, '') || '0';
    const decNorm = trimTrailingZeros(decPart);
    return decNorm ? `${intNorm}.${decNorm}` : intNorm;
}

/**
 * 非負の有限なnumberを、最短表現に基づく通常の10進数文字列に変換する
 * 指数表記は文字列操作のみで展開する（浮動小数点演算は行わない）
 */
function numberToDecimalString(n: number): string {
    const str = String(n);
    const match = str.match(EXPONENTIAL_REGEX);
    if (!match) {
        return str;
    }

    const [, intDigits = '', fracDigits = '', expStr = '0'] = match;
    const digits = intDigits + fracDigits;
    // 仮数部の小数点を指数分だけ移動した位置（digitsの先頭からの桁数）
    const pointPos = intDigits.length + Number.parseInt(expStr, 10);

    if (pointPos <= 0) {
        return `0.${'0'.repeat(-pointPos)}${digits}`;
    }
    if (pointPos >= digits.length) {
        return digits + '0'.repeat(pointPos - digits.length);
    }
    return `${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`;
}

/**
 * 金額を正規化された10進数文字列に変換する
 *
 * - 文字列: 非負の10進数形式（例: "100", "0.5", ".5", "5."）のみ許可。符号・指数表記・空白は不可
 * - 数値: 有限かつ非負のみ許可。指数表記（1e-7, 1e21など）は正確に10進数へ展開する。
 *   有効数字が15桁を超える数値は浮動小数点誤差を含むおそれがあるため拒否する
 *
 * @param amount - 金額（数値または文字列）
 * @returns 正規化された10進数文字列（例: ".50" → "0.5"、1e-7 → "0.0000001"）
 * @throws {JPYCPaymentError} 無効な金額の場合（code: INVALID_AMOUNT）
 */
export function normalizeAmount(amount: number | string): string {
    if (typeof amount === 'string') {
        if (amount.length > MAX_AMOUNT_STRING_LENGTH) {
            throw new JPYCPaymentError(
                `金額の文字列が長すぎます（最大${MAX_AMOUNT_STRING_LENGTH}文字、入力は${amount.length}文字）`,
                'INVALID_AMOUNT',
                { amount: previewValue(amount) }
            );
        }
        if (!AMOUNT_FORMAT_REGEX.test(amount)) {
            if (amount === '') {
                throw new JPYCPaymentError(
                    '金額が空です。半角数字で指定してください（例: "1000"、"0.5"）',
                    'INVALID_AMOUNT',
                    { amount: previewValue(amount) }
                );
            }
            // "-100" のように符号以外は正しい形式の場合は、負の数である旨を伝える
            if (amount.startsWith('-') && AMOUNT_FORMAT_REGEX.test(amount.slice(1))) {
                throw new JPYCPaymentError(
                    `金額は正の数である必要があります: ${displayValue(amount)}`,
                    'INVALID_AMOUNT',
                    { amount: previewValue(amount) }
                );
            }
            throw new JPYCPaymentError(
                `金額は半角数字と小数点のみで指定してください（例: "1000"、"0.5"）${amountFormatHint(amount)}: ${displayValue(amount)}`,
                'INVALID_AMOUNT',
                { amount: previewValue(amount) }
            );
        }
        return canonicalize(amount);
    }

    if (typeof amount !== 'number') {
        // 呼び出し側のオブジェクトの toString 等を実行しないよう、型名のみを示す
        throw new JPYCPaymentError(
            `金額は数値または文字列で指定してください（${typeName(amount)}が渡されました）`,
            'INVALID_AMOUNT',
            { amount: previewValue(amount) }
        );
    }

    if (!Number.isFinite(amount)) {
        throw new JPYCPaymentError(
            `金額は通常の数値で指定してください（NaN や Infinity は使えません）: ${amount}`,
            'INVALID_AMOUNT',
            { amount: previewValue(amount) }
        );
    }

    if (amount < 0) {
        throw new JPYCPaymentError(
            `金額は正の数である必要があります: ${amount}`,
            'INVALID_AMOUNT',
            { amount: previewValue(amount) }
        );
    }

    // -0 は String() で "0" になるため、そのまま0として扱われる
    const decimalStr = canonicalize(numberToDecimalString(amount));

    // 有効数字の桁数（先頭・末尾の0と小数点を除いた桁数）を確認
    const significantDigits = trimTrailingZeros(
        decimalStr.replace('.', '').replace(/^0+/, '')
    ).length;
    if (significantDigits > MAX_NUMBER_SIGNIFICANT_DIGITS) {
        throw new JPYCPaymentError(
            `数値で渡された金額 ${String(amount)} は、計算誤差を含んでいる可能性があります（有効数字${MAX_NUMBER_SIGNIFICANT_DIGITS}桁まで）。金額は文字列で指定してください（例: "0.3"）`,
            'INVALID_AMOUNT',
            { amount: previewValue(amount) }
        );
    }

    return decimalStr;
}

/**
 * 金額を最小単位（Wei）のBigIntに変換する
 * 小数部がdecimals桁を超えて0以外の数字を含む場合は、切り捨てずにエラーとする
 *
 * @param amount - 金額（数値または文字列）
 * @param decimals - トークンのdecimals（0から18の整数）
 * @returns 最小単位の金額
 * @throws {JPYCPaymentError} 無効な金額（INVALID_AMOUNT）またはdecimals（INVALID_DECIMALS）の場合
 */
export function parseAmountToWei(amount: number | string, decimals: number): bigint {
    assertValidDecimals(decimals);

    const normalized = normalizeAmount(amount);
    const [intPart = '0', decPart = ''] = normalized.split('.');

    // 正規化済みのため小数部の末尾に0はない。decimals桁を超えていれば表現できない端数がある
    if (decPart.length > decimals) {
        throw new JPYCPaymentError(
            `金額の小数点以下の桁数が多すぎます（このトークンは小数点以下${decimals}桁まで）: ${displayValue(amount)}`,
            'INVALID_AMOUNT',
            { amount: previewValue(amount), decimals }
        );
    }

    return BigInt(intPart + decPart.padEnd(decimals, '0'));
}

/**
 * 金額の検証結果
 */
export interface AmountValidationResult {
    /** エラーメッセージ（空なら有効） */
    errors: string[];
    /** 警告 */
    warnings: Warning[];
}

/**
 * 金額を検証する（validateGenerateOptions と isValidAmount の共通ロジック）
 * parseAmountToWei と同じ変換を通すため、ここでエラーがなければWei変換も必ず成功する
 *
 * @param amount - 金額（数値または文字列）
 * @param decimals - トークンのdecimals（デフォルト: 18）
 * @returns エラーと警告
 */
export function validateAmount(
    amount: number | string,
    decimals: number = JPYC_DECIMALS
): AmountValidationResult {
    const errors: string[] = [];
    const warnings: Warning[] = [];

    let wei: bigint;
    let normalized: string;
    try {
        wei = parseAmountToWei(amount, decimals);
        normalized = normalizeAmount(amount);
    } catch (error) {
        if (error instanceof JPYCPaymentError) {
            errors.push(error.message);
            return { errors, warnings };
        }
        throw error;
    }

    const unit = 10n ** BigInt(decimals);

    if (wei === 0n) {
        errors.push(`金額は正の数である必要があります: ${displayValue(normalized)}`);
    } else if (wei > BigInt(MAX_SAFE_AMOUNT) * unit) {
        errors.push(
            `金額が大きすぎます: ${displayValue(normalized)}。最大値は ${MAX_SAFE_AMOUNT} JPYです`
        );
    } else if (wei < unit) {
        // 小額の警告
        warnings.push({
            code: 'SMALL_AMOUNT',
            message: `金額が1JPYC未満です: ${normalized}。意図した金額か確認してください`,
        });
    } else if (wei > 1_000_000n * unit) {
        // 高額の警告
        warnings.push({
            code: 'LARGE_AMOUNT',
            message: `金額が100万JPYCを超えています: ${normalized}。意図した金額か確認してください`,
        });
    }

    return { errors, warnings };
}
