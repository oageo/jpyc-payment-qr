/**
 * JPYC支払いエラーのエラーコード
 */
export type JPYCPaymentErrorCode =
    | 'INVALID_ADDRESS'
    | 'INVALID_AMOUNT'
    | 'INVALID_NETWORK'
    | 'INVALID_DECIMALS'
    | 'VALIDATION_FAILED'
    | 'ENCODING_FAILED'
    | 'QR_GENERATION_FAILED'
    | 'CHECKSUM_FAILED';

/**
 * エラーメッセージ・detailsに埋め込む値の最大文字数
 */
export const MAX_VALUE_PREVIEW_LENGTH = 100;

/**
 * 見えない・表示を乱す文字の判定用正規表現
 * 制御文字（Cc）、書式文字（Cf: ゼロ幅文字・双方向制御文字・BOM・タグ文字など）、孤立サロゲート（Cs）、
 * 行・段落区切り（Zl, Zp）、半角スペース以外の空白（Zs: 全角スペース・ノーブレークスペースなど）、
 * 既定で無視される文字（ソフトハイフン・異体字セレクタ・ハングルフィラーなど）
 */
const INVISIBLE_CHAR_REGEX =
    /^[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Zs}\p{Default_Ignorable_Code_Point}]$/u;

/**
 * 見えない・表示を乱す文字かどうか（半角スペースは見えるものとして扱う）
 */
function isInvisibleChar(char: string): boolean {
    return char !== ' ' && INVISIBLE_CHAR_REGEX.test(char);
}

/**
 * 見えない文字を \n や U+200B のような見える表記に置き換える
 */
function escapeInvisibleChars(value: string): string {
    let result = '';
    // for...of はサロゲートペアを1文字として扱うため、補助面の文字（タグ文字など）も判定できる
    for (const char of value) {
        if (!isInvisibleChar(char)) {
            result += char;
        } else if (char === '\n') {
            result += '\\n';
        } else if (char === '\r') {
            result += '\\r';
        } else if (char === '\t') {
            result += '\\t';
        } else {
            const code = (char.codePointAt(0) ?? 0).toString(16).toUpperCase();
            result += code.length <= 4 ? `\\u${code.padStart(4, '0')}` : `\\u{${code}}`;
        }
    }
    return result;
}

/**
 * 文字列を最大文字数で切り詰める（切り詰めた場合は全体の文字数を付記する）
 */
function truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }
    // サロゲートペアの途中で切らない
    const lastCode = value.charCodeAt(maxLength - 1);
    const end = lastCode >= 0xd800 && lastCode <= 0xdbff ? maxLength - 1 : maxLength;
    return `${value.slice(0, end)}…（全${value.length}文字）`;
}

/**
 * エラーメッセージ用の型名（nullは 'null' とする）
 */
export function typeName(value: unknown): string {
    return value === null ? 'null' : typeof value;
}

/**
 * 任意の値をエラーメッセージ・details用に安全に文字列化する
 * - オブジェクト・関数は呼び出し側のtoString等を実行しないよう型名のみにする
 * - 改行などの見えない文字は \n や U+200B のように表示する（ログの改行や表示の偽装を防ぐ）
 * - 長い値は切り詰める
 * @param value - 文字列化する値
 * @param maxLength - 最大文字数
 * @returns 表示用の文字列
 */
export function previewValue(value: unknown, maxLength: number = MAX_VALUE_PREVIEW_LENGTH): string {
    if ((typeof value === 'object' && value !== null) || typeof value === 'function') {
        return `[${typeof value}]`;
    }
    if (typeof value !== 'string') {
        return truncate(String(value), maxLength);
    }
    // 巨大な入力の全体を変換しないよう、先に切り詰めてから見えない文字を置き換える
    return escapeInvisibleChars(truncate(value, maxLength));
}

/**
 * エラーメッセージに埋め込む値の表示（previewValueに加え、空文字は「（空）」と表示する）
 * @param value - 表示する値
 * @returns 表示用の文字列
 */
export function displayValue(value: unknown): string {
    const preview = previewValue(value);
    return preview === '' ? '（空）' : preview;
}

/**
 * JPYC支払い操作用のカスタムエラークラス
 */
export class JPYCPaymentError extends Error {
    public readonly code: JPYCPaymentErrorCode;
    public readonly details?: unknown;

    constructor(message: string, code: JPYCPaymentErrorCode, details?: unknown) {
        super(message);
        this.name = 'JPYCPaymentError';
        this.code = code;
        this.details = details;

        // エラーが投げられた場所のスタックトレースを維持（V8でのみ利用可能）
        Error.captureStackTrace?.(this, JPYCPaymentError);
    }

    /**
     * エラーをJSONオブジェクトに変換
     */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            details: this.details,
        };
    }
}
