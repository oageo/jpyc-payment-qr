import { assertValidDecimals, parseAmountToWei } from './amount.js';
import { isZeroAddress, normalizeAddress } from './checksum.js';
import { CHAIN_CONFIGS, EIP681_SCHEME, JPYC_DECIMALS, TRANSFER_FUNCTION } from './constants.js';
import {
    JPYCPaymentError,
    type JPYCPaymentErrorCode,
    displayValue,
    previewValue,
    typeName,
} from './errors.js';

/**
 * Wei金額文字列の検証用正規表現（非負の10進整数のみ。16進数・符号・空文字は不可）
 */
const WEI_AMOUNT_REGEX = /^\d+$/;

/**
 * JPY金額をWei（最小単位）に変換
 * 小数部がdecimals桁を超える端数を持つ場合は切り捨てずにエラーとする
 * @param amount - JPY金額（数値または文字列）
 * @param decimals - トークンのdecimals（デフォルト: 18）
 * @returns Wei単位の金額（文字列）
 * @throws {JPYCPaymentError} 無効な金額またはdecimalsの場合
 */
export function jpyToWei(amount: number | string, decimals: number = JPYC_DECIMALS): string {
    return parseAmountToWei(amount, decimals).toString();
}

/**
 * Wei（最小単位）をJPY金額に変換
 * @param weiAmount - Wei単位の金額（非負の10進整数の文字列）
 * @param decimals - トークンのdecimals（デフォルト: 18）
 * @returns JPY金額（文字列）
 * @throws {JPYCPaymentError} 無効なWei金額またはdecimalsの場合
 */
export function weiToJpy(weiAmount: string, decimals: number = JPYC_DECIMALS): string {
    assertValidDecimals(decimals);

    if (typeof weiAmount !== 'string') {
        throw new JPYCPaymentError(
            `Wei金額（weiAmount）は10進整数の文字列で指定してください（${typeName(weiAmount)}が渡されました）: ${displayValue(weiAmount)}`,
            'INVALID_AMOUNT',
            { weiAmount: previewValue(weiAmount) }
        );
    }
    // 巨大な入力のBigInt変換に時間がかかるのを防ぐため、形式チェックの前に長さで拒否する
    if (weiAmount.length > MAX_UINT256_DIGITS) {
        throw new JPYCPaymentError(
            `Wei金額（weiAmount）が長すぎます（最大${MAX_UINT256_DIGITS}桁、入力は${weiAmount.length}文字）: ${displayValue(weiAmount)}`,
            'INVALID_AMOUNT',
            { weiAmount: previewValue(weiAmount) }
        );
    }
    if (!WEI_AMOUNT_REGEX.test(weiAmount)) {
        throw new JPYCPaymentError(
            `Wei金額（weiAmount）は0以上の整数を半角数字のみで指定してください（小数点・符号・指数表記・16進数・空白・カンマは使えません）: ${displayValue(weiAmount)}`,
            'INVALID_AMOUNT',
            { weiAmount: previewValue(weiAmount) }
        );
    }
    const wei = BigInt(weiAmount);
    const divisor = BigInt(10) ** BigInt(decimals);

    const intPart = wei / divisor;
    const remainder = wei % divisor;

    // 小数部分を文字列に変換（前ゼロ埋め）し、末尾のゼロを削除
    const decPart = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');

    return decPart ? `${intPart}.${decPart}` : intPart.toString();
}

/**
 * uint256の最大値（2^256 - 1）
 */
const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * uint256の最大値の10進桁数（2^256-1 は78桁。79桁以上は必ず範囲外）
 */
const MAX_UINT256_DIGITS = 78;

/**
 * EIP-681 URIに埋め込むWei金額の検証用正規表現（先頭ゼロなしの10進整数）
 */
const EIP681_AMOUNT_REGEX = /^(0|[1-9]\d*)$/;

/**
 * デコードエラーの details.uri に含めるURIの最大文字数
 */
const MAX_URI_PREVIEW_LENGTH = 256;

/**
 * エラーメッセージ用の値の表示（空文字は分かるように表示する）
 */
function display(preview: string): string {
    return preview === '' ? '（空）' : preview;
}

/**
 * encodeEIP681 の引数名
 */
export type EIP681EncodeField = 'contractAddress' | 'recipientAddress' | 'amount' | 'chainId';

/**
 * encodeEIP681 が投げる JPYCPaymentError の details
 */
export interface EIP681EncodeErrorDetails {
    /** 不正だった引数名 */
    field: EIP681EncodeField;
    /** 不正だった値（安全に文字列化し、切り詰め済み） */
    value: string;
}

/**
 * encodeEIP681 のエラーを生成
 */
function encodeError(
    message: string,
    code: JPYCPaymentErrorCode,
    field: EIP681EncodeField,
    value: string
): JPYCPaymentError {
    const details: EIP681EncodeErrorDetails = { field, value };
    return new JPYCPaymentError(message, code, details);
}

/**
 * encodeEIP681 の引数のアドレスを検証し、チェックサム形式に正規化
 * @throws {JPYCPaymentError} 無効なアドレス（INVALID_ADDRESS / CHECKSUM_FAILED）の場合
 */
function encodeAddress(
    address: string,
    field: 'contractAddress' | 'recipientAddress',
    label: string
): string {
    try {
        return normalizeAddress(address);
    } catch (error) {
        const value = previewValue(address);
        if (error instanceof JPYCPaymentError) {
            // normalizeAddress のメッセージは原因・直し方・入力値を含む
            throw encodeError(
                `${label}（${field}）が不正です。${error.message}`,
                error.code,
                field,
                value
            );
        }
        throw encodeError(
            `${label}（${field}）が不正です: ${display(value)}`,
            'INVALID_ADDRESS',
            field,
            value
        );
    }
}

/**
 * EIP-681フォーマットのURIをエンコード
 * @param contractAddress - トークンコントラクトアドレス
 * @param recipientAddress - 受取アドレス
 * @param amount - 金額（Wei単位、先頭ゼロなしの10進整数文字列。1以上 2^256-1 以下）
 * @param chainId - チェーンID（1以上 Number.MAX_SAFE_INTEGER 以下の整数）
 * @returns EIP-681フォーマットのURI（アドレスはEIP-55チェックサム形式）
 * @throws {JPYCPaymentError} 無効なアドレス（INVALID_ADDRESS / CHECKSUM_FAILED）、
 * 無効な金額（INVALID_AMOUNT）、無効なチェーンID（INVALID_NETWORK）の場合。
 * details は {@link EIP681EncodeErrorDetails}（不正な引数名と、切り詰め済みの値）
 */
export function encodeEIP681(
    contractAddress: string,
    recipientAddress: string,
    amount: string,
    chainId: number
): string {
    // アドレスを検証し、チェックサム形式に正規化
    const checksummedContract = encodeAddress(
        contractAddress,
        'contractAddress',
        'コントラクトアドレス'
    );
    const checksummedRecipient = encodeAddress(
        recipientAddress,
        'recipientAddress',
        '受取アドレス'
    );

    // 金額の検証（クエリへのパラメータ注入を防ぐため、10進整数のみ許可）
    if (typeof amount !== 'string') {
        const value = previewValue(amount);
        throw encodeError(
            `金額（amount）はWei単位の10進整数の文字列で指定してください（${typeName(amount)}が渡されました）: ${display(value)}`,
            'INVALID_AMOUNT',
            'amount',
            value
        );
    }
    if (!EIP681_AMOUNT_REGEX.test(amount)) {
        const value = previewValue(amount);
        throw encodeError(
            `金額（amount）はWei単位の整数を半角数字のみで指定してください（先頭の0・小数点・符号・指数表記・16進数・空白は使えません）: ${display(value)}`,
            'INVALID_AMOUNT',
            'amount',
            value
        );
    }
    // 79桁以上は必ず範囲外のため、BigInt化せずに拒否する（巨大な入力でのDoS防止）
    if (amount.length > MAX_UINT256_DIGITS || amount === '0' || BigInt(amount) > MAX_UINT256) {
        const value = previewValue(amount);
        throw encodeError(
            amount === '0'
                ? `金額（amount）が0です。1以上の金額を指定してください: ${value}`
                : `金額（amount）が大きすぎます（最大は uint256 の上限 2^256-1）: ${value}`,
            'INVALID_AMOUNT',
            'amount',
            value
        );
    }

    // チェーンIDの検証
    if (typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId <= 0) {
        const value = previewValue(chainId);
        const message =
            typeof chainId === 'number'
                ? `チェーンID（chainId）は1以上 ${Number.MAX_SAFE_INTEGER} 以下の整数で指定してください: ${value}`
                : `チェーンID（chainId）は数値で指定してください（${typeName(chainId)}が渡されました）: ${display(value)}`;
        throw encodeError(message, 'INVALID_NETWORK', 'chainId', value);
    }

    // EIP-681フォーマット: ethereum:<contract>@<chainId>/transfer?address=<recipient>&uint256=<amount>
    return (
        `${EIP681_SCHEME}:${checksummedContract}@${chainId}/${TRANSFER_FUNCTION}` +
        `?address=${checksummedRecipient}&uint256=${amount}`
    );
}

/**
 * EIP-681 URIのデコード結果
 */
export interface DecodedEIP681 {
    scheme: string;
    contractAddress: string;
    chainId: number;
    functionName: string;
    recipientAddress: string;
    amount: string;
}

/**
 * decodeEIP681 の失敗の種類
 */
export type EIP681DecodeErrorKind =
    /**
     * 型・長さ・禁止文字（空白・制御文字・#・全角文字などのASCII以外の文字）・
     * 構造（区切り文字・2つ以上の ?・クエリの形式）の不正
     */
    | 'INVALID_URI'
    /** スキームが ethereum 以外（value: スキーム） */
    | 'UNSUPPORTED_SCHEME'
    /** 必須パラメータがない（name: 'chain_id' | 'address' | 'uint256'） */
    | 'MISSING_PARAM'
    /** アドレスの形式が不正（name: 'target' | 'address', value） */
    | 'INVALID_ADDRESS'
    /** 大文字小文字が混在しているがEIP-55チェックサムが一致しない（name: 'target' | 'address', value） */
    | 'CHECKSUM_MISMATCH'
    /** チェーンIDが不正（value。空・非数字・先頭ゼロ・0・安全な整数の範囲外） */
    | 'INVALID_CHAIN_ID'
    /** transfer 以外の関数（name。関数呼び出しがない場合は ''） */
    | 'UNSUPPORTED_FUNCTION'
    /** 対応していないクエリパラメータ（name） */
    | 'UNSUPPORTED_PARAM'
    /** クエリパラメータの重複（name） */
    | 'DUPLICATE_PARAM'
    /** 金額が不正（name: 'uint256', value。空・形式不正・整数でない・0・範囲外） */
    | 'INVALID_AMOUNT'
    /**
     * 送金すると資金を取り戻せなくなる受取アドレス
     * （name: 'address', value, recipientIssue: 'ZERO_ADDRESS' | 'TOKEN_CONTRACT'）
     */
    | 'UNSAFE_RECIPIENT';

/**
 * UNSAFE_RECIPIENT の詳しい原因
 * - ZERO_ADDRESS: 受取アドレスがゼロアドレス（0x000…0）
 * - TOKEN_CONTRACT: 受取アドレスがトークンのコントラクトアドレス（URIのコントラクト、またはJPYCのコントラクト）
 */
export type EIP681UnsafeRecipientIssue = 'ZERO_ADDRESS' | 'TOKEN_CONTRACT';

/**
 * decodeEIP681 が投げる JPYCPaymentError（code: 'ENCODING_FAILED'）の details
 */
export interface EIP681DecodeErrorDetails {
    /** 失敗の種類 */
    kind: EIP681DecodeErrorKind;
    /** 人間向けの説明（メッセージの「デコードに失敗しました: 」以降と同じ） */
    reason: string;
    /** 原因となったパラメータ名（切り詰め済み） */
    name?: string;
    /** 原因となった値（切り詰め済み） */
    value?: string;
    /** kind が UNSAFE_RECIPIENT の場合の詳しい原因 */
    recipientIssue?: EIP681UnsafeRecipientIssue;
    /** 入力URI（切り詰め済み。文字列以外の場合は型名等） */
    uri: string;
}

/**
 * デコード可能なURIの最大長
 */
const EIP681_MAX_URI_LENGTH = 2048;

/**
 * target_address の 'pay-' プレフィックス
 */
const EIP681_PAY_PREFIX = 'pay-';

/**
 * 16進アドレス（0x + 40桁）の検証用正規表現
 */
const HEX_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

/**
 * EIP-681のnumber構文（符号なし）の検証用正規表現
 * <整数部>[.<小数部>][e<指数>] （整数部は先頭ゼロ禁止。各部は区切り文字で分かれるため線形時間で判定できる）
 */
const EIP681_NUMBER_REGEX = /^(0|[1-9]\d*)(?:\.(\d+))?(?:[eE](\d+))?$/;

/**
 * 受け付けるクエリパラメータのキー
 */
const EIP681_ALLOWED_PARAMS = ['address', 'uint256'] as const;
type EIP681ParamKey = (typeof EIP681_ALLOWED_PARAMS)[number];

/**
 * 対応していないクエリパラメータごとの、拒否する理由
 */
const UNSUPPORTED_PARAM_REASONS: ReadonlyMap<string, string> = new Map([
    ['value', 'ネイティブ通貨の送金を伴うため'],
    ['gas', 'ガスの指定はウォレットに任せるため'],
    ['gasLimit', 'ガスの指定はウォレットに任せるため'],
    ['gasPrice', 'ガスの指定はウォレットに任せるため'],
]);

/**
 * デコード失敗の理由を表す内部エラー
 */
class EIP681DecodeError extends Error {
    readonly kind: EIP681DecodeErrorKind;
    /** 原因となったパラメータ名（Error#name と衝突しないよう別名にしている） */
    readonly param: string | undefined;
    readonly value: string | undefined;
    readonly recipientIssue: EIP681UnsafeRecipientIssue | undefined;

    constructor(
        kind: EIP681DecodeErrorKind,
        reason: string,
        {
            name,
            value,
            recipientIssue,
        }: { name?: string; value?: string; recipientIssue?: EIP681UnsafeRecipientIssue } = {}
    ) {
        super(reason);
        this.kind = kind;
        this.param = name;
        this.value = value;
        this.recipientIssue = recipientIssue;
    }
}

/**
 * 受け付けるURIの形式（エラーメッセージで正しい形を示すために使う）
 */
const EIP681_TRANSFER_FORMAT = `${EIP681_SCHEME}:<コントラクトアドレス>@<チェーンID>/${TRANSFER_FUNCTION}?address=<受取アドレス>&uint256=<Wei単位の金額>`;

/**
 * 値に '%' を含む場合に付ける説明
 */
const PERCENT_ENCODING_HINT = '（パーセントエンコードには対応していません）';

/**
 * 値に '%' を含む場合はパーセントエンコードに対応していない旨の説明を返す（含まない場合は ''）
 */
function percentHint(raw: string): string {
    return raw.includes('%') ? PERCENT_ENCODING_HINT : '';
}

/**
 * 禁止文字の分類
 * - whitespace: 空白・タブ・改行・全角スペース等
 * - invisible: 制御文字・ゼロ幅文字・双方向制御文字・BOM・不正なサロゲート
 * - fragment: #
 * - nonAscii: 全角文字などのASCII以外の文字（見た目が似た文字による取り違えを防ぐ）
 */
type ForbiddenCharCategory = 'whitespace' | 'invisible' | 'fragment' | 'nonAscii';

/**
 * 禁止文字の表示名（コードポイント → 名前。ない場合は分類ごとの既定の名前を使う）
 */
const FORBIDDEN_CHAR_LABELS: ReadonlyMap<number, string> = new Map([
    [0x00, 'NUL'],
    [0x09, 'タブ'],
    [0x0a, '改行'],
    [0x0d, '改行（CR）'],
    [0x20, '半角スペース'],
    [0x7f, 'DEL'],
    [0xa0, 'ノーブレークスペース'],
    [0x200b, 'ゼロ幅スペース'],
    [0x3000, '全角スペース'],
    [0xfeff, 'BOM（ゼロ幅ノーブレークスペース）'],
]);

/**
 * 空白・制御文字・#・ASCII以外の文字の位置を返す（含まない場合は -1）
 * 許可するのは '#' 以外の印字可能なASCII文字（0x21〜0x7E）のみ
 */
function findForbiddenChar(uri: string): number {
    for (let i = 0; i < uri.length; i++) {
        const code = uri.charCodeAt(i);
        if (code <= 0x20 || code === 0x23 || code >= 0x7f) {
            return i;
        }
    }
    return -1;
}

/**
 * 禁止文字を分類し、表示名を返す
 */
function classifyForbiddenChar(codePoint: number): {
    category: ForbiddenCharCategory;
    label: string;
} {
    const named = FORBIDDEN_CHAR_LABELS.get(codePoint);
    if (codePoint === 0x23) {
        return { category: 'fragment', label: '#' };
    }
    if (codePoint === 0xfeff) {
        return { category: 'invisible', label: named ?? 'BOM' };
    }
    if (/\s/.test(String.fromCodePoint(codePoint))) {
        return { category: 'whitespace', label: named ?? '空白文字' };
    }
    // C0制御文字・DEL・C1制御文字
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) {
        return { category: 'invisible', label: named ?? '制御文字' };
    }
    if (
        (codePoint >= 0x200e && codePoint <= 0x200f) ||
        (codePoint >= 0x202a && codePoint <= 0x202e) ||
        (codePoint >= 0x2066 && codePoint <= 0x2069)
    ) {
        return { category: 'invisible', label: '双方向制御文字' };
    }
    if ((codePoint >= 0x200b && codePoint <= 0x200d) || codePoint === 0x2060) {
        return { category: 'invisible', label: named ?? 'ゼロ幅文字' };
    }
    if (codePoint >= 0x2061 && codePoint <= 0x2065) {
        return { category: 'invisible', label: '見えない文字' };
    }
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
        return { category: 'invisible', label: '不正なサロゲート' };
    }
    return { category: 'nonAscii', label: '' };
}

/**
 * 禁止文字のエラー理由を組み立てる（何文字目の何という文字か、どう直すか）
 * @param uri - 入力URI
 * @param index - 禁止文字の位置（findForbiddenChar の戻り値。それより前はすべてASCII）
 */
function forbiddenCharReason(uri: string, index: number): string {
    const codePoint = uri.codePointAt(index) as number;
    const char = String.fromCodePoint(codePoint);
    const isFirst = index === 0;
    const isLast = index + char.length === uri.length;
    // index より前はすべてASCIIのため、index + 1 がそのまま文字数になる
    const position = `${index + 1}文字目${isFirst ? '（先頭）' : isLast ? '（末尾）' : ''}`;
    const code = `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
    const { category, label } = classifyForbiddenChar(codePoint);

    switch (category) {
        case 'whitespace': {
            const atEdge =
                index < uri.length - uri.trimStart().length || index >= uri.trimEnd().length;
            const hint = atEdge ? '前後の空白を取り除いてください' : '空白を取り除いてください';
            return `URIに空白が含まれています（${position}: ${label} ${code}）。${hint}`;
        }
        case 'invisible':
            return `URIに制御文字などの見えない文字が含まれています（${position}: ${label} ${code}）。取り除いてください`;
        case 'fragment':
            return `URIに # が含まれています（${position}）。# 以降（フラグメント）には対応していないため、取り除いてください`;
        case 'nonAscii':
            return `URIに全角文字などのASCII以外の文字が含まれています（${position}: '${previewValue(char)}' ${code}）。半角の英数字・記号で入力してください`;
    }
}

/**
 * アドレスが形式不正の場合の補足説明を返す（該当しない場合は ''）
 */
function addressHint(address: string, raw: string): string {
    if (raw.includes('%')) {
        return PERCENT_ENCODING_HINT;
    }
    if (raw.includes('.')) {
        return '（ENS名には対応していません）';
    }
    if (/^[0-9a-fA-F]{40}$/.test(address)) {
        return '（先頭に 0x を付けてください）';
    }
    if (/^0x[0-9a-fA-F]*$/.test(address)) {
        return `（0x の後が${address.length - 2}桁です）`;
    }
    if (address.startsWith('0x')) {
        return '（0x の後に16進数（0-9, a-f, A-F）以外の文字が含まれています）';
    }
    return '';
}

/**
 * アドレスを検証し、チェックサム形式に正規化
 * @param address - 検証するアドレス（'pay-' 除去後）
 * @param raw - エラー表示用の入力中の生の文字列
 * @throws {EIP681DecodeError} 形式不正（INVALID_ADDRESS）またはチェックサム不一致（CHECKSUM_MISMATCH）の場合
 */
function decodeAddress(
    address: string,
    raw: string,
    name: 'target' | 'address',
    label: string
): string {
    const value = previewValue(raw);
    if (raw === '') {
        throw new EIP681DecodeError(
            'INVALID_ADDRESS',
            `${label}が空です（0x + 40桁の16進数で指定してください）`,
            { name, value }
        );
    }
    if (!HEX_ADDRESS_REGEX.test(address)) {
        throw new EIP681DecodeError(
            'INVALID_ADDRESS',
            `${label}が0x + 40桁の16進数ではありません: ${display(value)}${addressHint(address, raw)}`,
            { name, value }
        );
    }
    try {
        return normalizeAddress(address);
    } catch {
        const hint =
            '（打ち間違いがないか確認してください。チェックサムを付けない場合はすべて小文字にしてください）';
        throw new EIP681DecodeError(
            'CHECKSUM_MISMATCH',
            `${label}のEIP-55チェックサムが一致しません: ${value}${hint}`,
            { name, value }
        );
    }
}

/**
 * chain_id を検証して数値に変換
 * @throws {EIP681DecodeError} 不正な場合（INVALID_CHAIN_ID）
 */
function decodeChainId(chainIdStr: string): number {
    const value = previewValue(chainIdStr);
    const fail = (reason: string) =>
        new EIP681DecodeError('INVALID_CHAIN_ID', reason, { name: 'chain_id', value });

    if (chainIdStr === '') {
        throw fail('チェーンIDが空です（@の後に10進数のチェーンIDを指定してください）');
    }
    if (!/^\d+$/.test(chainIdStr)) {
        const hint = chainIdStr.includes('@')
            ? '（@ が2つ以上含まれています）'
            : percentHint(chainIdStr);
        throw fail(`チェーンIDが10進数の正の整数ではありません: ${value}${hint}`);
    }
    if (chainIdStr.length > 1 && chainIdStr.startsWith('0')) {
        throw fail(`チェーンIDに先頭ゼロは使えません: ${value}`);
    }
    const chainId = Number(chainIdStr);
    if (chainId === 0) {
        throw fail(`チェーンIDは1以上である必要があります: ${value}`);
    }
    if (!Number.isSafeInteger(chainId)) {
        throw fail(`チェーンIDが大きすぎます（最大${Number.MAX_SAFE_INTEGER}）: ${value}`);
    }
    return chainId;
}

/**
 * EIP-681のnumber表記（例: '1000', '1e18', '1.5e18'）を10進整数文字列に変換
 * 巨大な指数でもBigIntの巨大な計算をしないよう、最終的な桁数で範囲を判定してから計算する
 * @throws {EIP681DecodeError} 空・形式不正・整数にならない・0・範囲外の場合（INVALID_AMOUNT）
 */
function decodeUint256(amountStr: string): string {
    const value = previewValue(amountStr);
    const fail = (reason: string) =>
        new EIP681DecodeError('INVALID_AMOUNT', reason, { name: 'uint256', value });

    if (amountStr === '') {
        throw fail('金額（uint256）が空です（Wei単位の金額を指定してください）');
    }
    if (/^-\d/.test(amountStr)) {
        throw fail(`金額（uint256）に負の数は使えません: ${value}`);
    }
    if (/^\+\d/.test(amountStr)) {
        throw fail(`金額（uint256）に符号（+）は付けられません: ${value}`);
    }
    if (amountStr.includes('%')) {
        throw fail(`金額（uint256）の形式が不正です: ${value}${PERCENT_ENCODING_HINT}`);
    }
    if (/^0\d/.test(amountStr)) {
        throw fail(`金額（uint256）に先頭ゼロは使えません: ${value}`);
    }
    const match = EIP681_NUMBER_REGEX.exec(amountStr);
    if (!match) {
        const hint =
            '（10進数、または 1.5e18 のような指数表記で指定してください。符号・16進数は使えません）';
        throw fail(`金額（uint256）の形式が不正です: ${value}${hint}`);
    }
    const [, intPart = '', fracPart = '', expPart = ''] = match;

    // 仮数部の数字列から先頭のゼロを除いた有効数字（空なら値は0）
    const digits = (intPart + fracPart).replace(/^0+/, '');
    if (digits === '') {
        throw fail(`金額（uint256）は0より大きい必要があります: ${value}`);
    }
    // 末尾のゼロを除いた有効数字 × 10^scale が値になる
    // （指数の文字列が極端に長い場合 Number は Infinity になり、下の桁数判定で拒否される）
    const significand = digits.replace(/0+$/, '');
    const exponent = expPart === '' ? 0 : Number(expPart);
    const scale = exponent - fracPart.length + (digits.length - significand.length);

    if (scale < 0) {
        throw fail(
            `金額（uint256）が整数ではありません: ${value}（Wei単位の整数で指定してください）`
        );
    }
    const overflow = () =>
        fail(`金額（uint256）がuint256の最大値（2^256-1）を超えています: ${value}`);
    // 最終的な整数の桁数が79桁以上なら必ず範囲外（BigInt化しない）
    if (significand.length + scale > MAX_UINT256_DIGITS) {
        throw overflow();
    }
    const amount = BigInt(significand) * 10n ** BigInt(scale);
    if (amount > MAX_UINT256) {
        throw overflow();
    }
    return amount.toString();
}

/**
 * クエリ文字列を解析（URLSearchParamsはデコードや重複の扱いが緩いため自前で分割する）
 * @throws {EIP681DecodeError} 形式不正（INVALID_URI）・未対応（UNSUPPORTED_PARAM）・重複（DUPLICATE_PARAM）の場合
 */
function parseQuery(queryString: string): Partial<Record<EIP681ParamKey, string>> {
    const params: Partial<Record<EIP681ParamKey, string>> = {};
    if (queryString === '') {
        throw new EIP681DecodeError(
            'INVALID_URI',
            'クエリパラメータの形式が不正です: ?の後が空です（address と uint256 を指定してください）'
        );
    }
    for (const pair of queryString.split('&')) {
        const invalid = (detail: string) =>
            new EIP681DecodeError('INVALID_URI', `クエリパラメータの形式が不正です: ${detail}`);
        if (pair === '') {
            throw invalid('空のパラメータがあります（&が連続しているか、先頭・末尾にあります）');
        }
        const pairPreview = previewValue(pair);
        const eqIndex = pair.indexOf('=');
        if (eqIndex === -1) {
            throw invalid(`${pairPreview}（key=value の形式で指定してください）`);
        }
        const key = pair.slice(0, eqIndex);
        const value = pair.slice(eqIndex + 1);
        if (key === '') {
            throw invalid(`${pairPreview}（パラメータ名がありません）`);
        }
        if (value.includes('=')) {
            throw invalid(`${pairPreview}（値に=が含まれています）`);
        }

        const name = previewValue(key);
        if (!(EIP681_ALLOWED_PARAMS as readonly string[]).includes(key)) {
            const reason =
                UNSUPPORTED_PARAM_REASONS.get(key) ??
                (key.includes('%')
                    ? 'パーセントエンコードは使えません。address と uint256 はそのまま記述してください'
                    : (EIP681_ALLOWED_PARAMS as readonly string[]).includes(key.toLowerCase())
                      ? 'パラメータ名は小文字で指定してください'
                      : '対応しているのは address と uint256 のみです');
            throw new EIP681DecodeError(
                'UNSUPPORTED_PARAM',
                `クエリパラメータ ${name} には対応していません（${reason}）`,
                { name }
            );
        }
        const allowedKey = key as EIP681ParamKey;
        if (params[allowedKey] !== undefined) {
            throw new EIP681DecodeError(
                'DUPLICATE_PARAM',
                `クエリパラメータ ${name} が重複しています（どちらの値を使うかがウォレットによって異なるため、1つだけ指定してください）`,
                { name }
            );
        }
        params[allowedKey] = value;
    }
    return params;
}

/**
 * EIP-681 URIを解析（失敗時は EIP681DecodeError を投げる）
 */
function parseEIP681(uri: unknown): DecodedEIP681 {
    if (typeof uri !== 'string') {
        throw new EIP681DecodeError(
            'INVALID_URI',
            `URIは文字列である必要があります（${typeName(uri)}が渡されました）`
        );
    }
    if (uri.length > EIP681_MAX_URI_LENGTH) {
        throw new EIP681DecodeError(
            'INVALID_URI',
            `URIが長すぎます（最大${EIP681_MAX_URI_LENGTH}文字、入力は${uri.length}文字）`
        );
    }
    const forbiddenIndex = findForbiddenChar(uri);
    if (forbiddenIndex !== -1) {
        throw new EIP681DecodeError('INVALID_URI', forbiddenCharReason(uri, forbiddenIndex));
    }

    // <scheme>:[pay-]<target>@<chain_id>/<function_name>?<query>
    const colonIndex = uri.indexOf(':');
    if (colonIndex === -1) {
        throw new EIP681DecodeError(
            'INVALID_URI',
            `スキームがありません（${EIP681_SCHEME}: で始まる必要があります）`
        );
    }
    const scheme = uri.slice(0, colonIndex);
    if (scheme.toLowerCase() !== EIP681_SCHEME) {
        const value = previewValue(scheme);
        throw new EIP681DecodeError(
            'UNSUPPORTED_SCHEME',
            `スキームが${EIP681_SCHEME}ではありません: ${display(value)}（このライブラリは ${EIP681_SCHEME}: で始まるURIのみ対応）`,
            { value }
        );
    }
    const rest = uri.slice(colonIndex + 1);

    const queryIndex = rest.indexOf('?');
    const secondQueryIndex = queryIndex === -1 ? -1 : rest.indexOf('?', queryIndex + 1);
    if (secondQueryIndex !== -1) {
        // rest は uri の colonIndex + 1 文字目以降のため、1始まりの位置に直す
        throw new EIP681DecodeError(
            'INVALID_URI',
            `URIに ? が2つ以上含まれています（2つ目の ? は${colonIndex + 2 + secondQueryIndex}文字目）。クエリパラメータは最初の ? の後に & で区切って指定してください`
        );
    }
    const path = queryIndex === -1 ? rest : rest.slice(0, queryIndex);
    const queryString = queryIndex === -1 ? undefined : rest.slice(queryIndex + 1);

    const slashIndex = path.indexOf('/');
    const targetPart = slashIndex === -1 ? path : path.slice(0, slashIndex);
    const functionName = slashIndex === -1 ? '' : path.slice(slashIndex + 1);

    const atIndex = targetPart.indexOf('@');
    const rawTarget = atIndex === -1 ? targetPart : targetPart.slice(0, atIndex);

    // target_address（'pay-' プレフィックスは省略可能）
    const target = rawTarget.startsWith(EIP681_PAY_PREFIX)
        ? rawTarget.slice(EIP681_PAY_PREFIX.length)
        : rawTarget;
    const contractAddress = decodeAddress(target, rawTarget, 'target', 'コントラクトアドレス');

    // chain_id（EIP-681では省略可能だが、誤ったチェーンでの送金を防ぐため必須とする）
    if (atIndex === -1) {
        throw new EIP681DecodeError(
            'MISSING_PARAM',
            'チェーンIDがありません（誤ったチェーンでの送金を防ぐため必須です。コントラクトアドレスの後に @137 のように指定してください）',
            { name: 'chain_id' }
        );
    }
    const chainId = decodeChainId(targetPart.slice(atIndex + 1));

    // function_name
    if (functionName === '') {
        throw new EIP681DecodeError(
            'UNSUPPORTED_FUNCTION',
            `関数名がありません（関数のないURIはネイティブ通貨の送金を表します）。ERC20の送金URIは ${EIP681_TRANSFER_FORMAT} の形式です`,
            { name: '' }
        );
    }
    if (functionName !== TRANSFER_FUNCTION) {
        const name = previewValue(functionName);
        const hint =
            percentHint(functionName) ||
            (functionName.toLowerCase() === TRANSFER_FUNCTION
                ? `（関数名は小文字の ${TRANSFER_FUNCTION} で指定してください）`
                : `（このライブラリはERC20の${TRANSFER_FUNCTION}のみ対応）`);
        throw new EIP681DecodeError(
            'UNSUPPORTED_FUNCTION',
            `関数名が${TRANSFER_FUNCTION}ではありません: ${name}${hint}`,
            { name }
        );
    }

    // クエリ（? がない場合は必須パラメータの欠落として扱う）
    const params = queryString === undefined ? {} : parseQuery(queryString);
    if (params.address === undefined) {
        throw new EIP681DecodeError(
            'MISSING_PARAM',
            `受取アドレス（クエリパラメータ address）がありません（${EIP681_TRANSFER_FORMAT} の形式で指定してください）`,
            { name: 'address' }
        );
    }
    if (params.uint256 === undefined) {
        throw new EIP681DecodeError(
            'MISSING_PARAM',
            `金額（クエリパラメータ uint256）がありません（${EIP681_TRANSFER_FORMAT} の形式で指定してください）`,
            { name: 'uint256' }
        );
    }

    return {
        scheme: EIP681_SCHEME,
        contractAddress,
        chainId,
        functionName,
        recipientAddress: decodeAddress(
            params.address,
            params.address,
            'address',
            '受取アドレス（address）'
        ),
        amount: decodeUint256(params.uint256),
    };
}

/**
 * EIP-681 URIをデコード（パース）
 *
 * このライブラリが生成するERC20 transferの支払いURIのみを対象とし、以下の形式に限って受け付ける。
 * `ethereum:[pay-]<contract>@<chain_id>/transfer?address=<recipient>&uint256=<amount>`
 * - 使える文字は '#' 以外の印字可能なASCII文字のみ（空白・制御文字・全角文字等は拒否。パーセントエンコードには非対応）
 * - スキームは大文字小文字を区別しない（戻り値は 'ethereum' に正規化）
 * - 'pay-' プレフィックスは小文字のみ（EIP-681の文法上は 'PAY-' も有効だが、厳格化のため受け付けない）
 * - target_address は 0x + 40桁の16進アドレスのみ（ENS名には対応していない）
 * - `@chain_id` は必須（EIP-681では省略可能だが、誤ったチェーンでの送金を防ぐため）
 * - 関数名は transfer のみ、クエリは address と uint256 のみ（両方必須、重複不可。value 等は拒否）
 * - uint256 は '1000', '1e18', '1.5e18' 等の表記を受け付け、10進整数文字列に正規化する
 *   （整数部は必須。EIP-681の文法上は '.5e1' のように整数部を省略できるが、厳格化のため受け付けない）
 * - アドレスはEIP-55チェックサム形式に正規化する（大文字小文字混在時はチェックサムを検証）
 * - 受取アドレスがゼロアドレス、またはトークンのコントラクトアドレス（URIのコントラクト、
 *   またはJPYCのコントラクト）の場合は、送金すると資金を取り戻せなくなるため拒否する（UNSAFE_RECIPIENT）
 * @param uri - EIP-681フォーマットのURI
 * @returns パース結果
 * @throws {JPYCPaymentError} デコードに失敗した場合（code は ENCODING_FAILED。メッセージに理由を含む）。
 * details は {@link EIP681DecodeErrorDetails} で、details.kind により原因を判別できる
 */
export function decodeEIP681(uri: string): DecodedEIP681 {
    return decodeEIP681Internal(uri, { checkRecipient: true });
}

/**
 * 受取アドレスが、送金すると資金を取り戻せなくなるアドレスでないことを確認する
 * （generatePaymentURI・generateQRFromURI と同じ判定。アドレスはチェックサム形式に正規化済み）
 * @throws {EIP681DecodeError} ゼロアドレス、またはトークンのコントラクトアドレスの場合（UNSAFE_RECIPIENT）
 */
function assertSafeRecipient(decoded: DecodedEIP681): void {
    const recipient = decoded.recipientAddress;
    if (isZeroAddress(recipient)) {
        throw new EIP681DecodeError(
            'UNSAFE_RECIPIENT',
            '受取アドレス（address）がゼロアドレス（0x000…0）です。送金した資金を取り戻せなくなります',
            { name: 'address', value: recipient, recipientIssue: 'ZERO_ADDRESS' }
        );
    }
    const tokenContracts = [
        decoded.contractAddress,
        ...Object.values(CHAIN_CONFIGS).map((config) => config.jpycAddress),
    ];
    if (tokenContracts.includes(recipient)) {
        throw new EIP681DecodeError(
            'UNSAFE_RECIPIENT',
            `受取アドレス（address）がトークンのコントラクトアドレスです。受取アドレスとコントラクトアドレスを取り違えていないか確認してください（送金した資金を取り戻せなくなります）: ${recipient}`,
            { name: 'address', value: recipient, recipientIssue: 'TOKEN_CONTRACT' }
        );
    }
}

/**
 * decodeEIP681 の本体
 *
 * generateQRFromURI は受取アドレスの安全性を自前で検査し、従来どおり INVALID_ADDRESS を投げるため、
 * checkRecipient: false で呼び出す（ライブラリ内部用。index.ts からは公開しない）
 * @internal
 */
export function decodeEIP681Internal(
    uri: string,
    { checkRecipient }: { checkRecipient: boolean }
): DecodedEIP681 {
    try {
        const decoded = parseEIP681(uri);
        if (checkRecipient) {
            assertSafeRecipient(decoded);
        }
        return decoded;
    } catch (error) {
        const decodeError =
            error instanceof EIP681DecodeError
                ? error
                : new EIP681DecodeError('INVALID_URI', '予期しないエラーが発生しました');
        const details: EIP681DecodeErrorDetails = {
            kind: decodeError.kind,
            reason: decodeError.message,
            uri: previewValue(uri, MAX_URI_PREVIEW_LENGTH),
        };
        if (decodeError.param !== undefined) {
            details.name = decodeError.param;
        }
        if (decodeError.value !== undefined) {
            details.value = decodeError.value;
        }
        if (decodeError.recipientIssue !== undefined) {
            details.recipientIssue = decodeError.recipientIssue;
        }
        throw new JPYCPaymentError(
            `EIP-681 URIのデコードに失敗しました: ${decodeError.message}`,
            'ENCODING_FAILED',
            details
        );
    }
}
