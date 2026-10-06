import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import { ADDRESS_REGEX } from './constants.js';
import { JPYCPaymentError, displayValue, previewValue, typeName } from './errors.js';

/**
 * 0xプレフィックスなしの16進アドレス（40桁）の検証用正規表現
 */
const HEX40_REGEX = /^[0-9a-fA-F]{40}$/;

/**
 * 16進数1文字の検証用正規表現
 */
const HEX_CHAR_REGEX = /^[0-9a-fA-F]$/;

/**
 * ゼロアドレス（0x + 40個の0）の検証用正規表現
 */
const ZERO_ADDRESS_REGEX = /^0x0{40}$/i;

/**
 * アドレスのエラー（JPYCPaymentError）を生成する
 * メッセージの末尾に入力値を付け、details.address には切り詰めた値を入れる（巨大な入力をそのまま保持しない）
 * @param reason - 原因と直し方
 * @param address - 入力値
 * @param code - エラーコード
 * @param extra - details に追加する値
 * @param quote - 値を引用符で囲むか（前後の空白を見えるようにする場合）
 */
function addressError(
    reason: string,
    address: unknown,
    {
        code = 'INVALID_ADDRESS',
        extra = {},
        quote = false,
    }: {
        code?: 'INVALID_ADDRESS' | 'CHECKSUM_FAILED';
        extra?: Record<string, unknown>;
        quote?: boolean;
    } = {}
): JPYCPaymentError {
    const shown = quote ? `"${previewValue(address)}"` : displayValue(address);
    return new JPYCPaymentError(`${reason}: ${shown}`, code, {
        address: previewValue(address),
        ...extra,
    });
}

/**
 * アドレスに使えない文字（非ASCII文字・空白・制御文字）を探す
 * @returns 最初に見つかった文字と、その位置（1始まり。サロゲートペアは1文字と数える）。なければ undefined
 */
function findNonAddressChar(address: string): { char: string; position: number } | undefined {
    let position = 0;
    for (const char of address) {
        position++;
        const code = char.codePointAt(0) ?? 0;
        if (code < 0x21 || code > 0x7e) {
            return { char, position };
        }
    }
    return undefined;
}

/**
 * アドレスの形式（0x + 40桁の16進数）を検証し、不正な場合は原因と直し方が分かるメッセージで例外を投げる
 * 画面上は正しく見える誤り（前後の空白・0X・全角文字など）は、形式チェックより先に原因を特定する
 * @throws {JPYCPaymentError} 形式が無効な場合（INVALID_ADDRESS）
 */
function assertAddressFormat(address: unknown): asserts address is string {
    if (typeof address !== 'string') {
        throw addressError(
            `アドレスは文字列で指定してください（${typeName(address)}が渡されました）`,
            address
        );
    }
    if (address === '') {
        throw addressError(
            'アドレスが空です。0x で始まる42文字のアドレスを指定してください',
            address
        );
    }
    if (address !== address.trim()) {
        throw addressError(
            'アドレスの前後に空白や改行が含まれています。取り除いてください',
            address,
            { quote: true }
        );
    }
    if (address.startsWith('0X')) {
        throw addressError('アドレスは 0x（小文字の x）で始まる必要があります', address);
    }
    if (!address.startsWith('0x') && address.includes('.')) {
        throw addressError(
            'ENS名（例: shop.eth）には対応していません。0x で始まる16進アドレスを指定してください',
            address
        );
    }
    const nonAddressChar = findNonAddressChar(address);
    if (nonAddressChar) {
        throw addressError(
            `アドレスに全角文字などの使えない文字が含まれています（${nonAddressChar.position}文字目: '${previewValue(nonAddressChar.char)}'）`,
            address
        );
    }
    if (!address.startsWith('0x')) {
        const hint = HEX40_REGEX.test(address) ? '（先頭の 0x が抜けています）' : '';
        throw addressError(`アドレスは 0x で始まる必要があります${hint}`, address);
    }
    // 長さの検証（0x + 40文字。ここまでで ASCII のみと確認済みのため length が文字数と一致する）
    if (address.length !== 42) {
        throw addressError(
            `アドレスは42文字（0x + 16進数40文字）である必要があります（入力は${address.length}文字）`,
            address,
            { extra: { length: address.length } }
        );
    }
    // 16進数の検証（どの文字が不正かを示す）
    if (!ADDRESS_REGEX.test(address)) {
        let index = 2;
        while (index < address.length && HEX_CHAR_REGEX.test(address.charAt(index))) {
            index++;
        }
        throw addressError(
            `アドレスに16進数（0-9、a-f、A-F）以外の文字が含まれています（${index + 1}文字目: '${address.charAt(index)}'）`,
            address
        );
    }
}

/**
 * EIP-55チェックサムアドレスを生成
 * @param address - Ethereumアドレス（0xプレフィックス付き）
 * @returns EIP-55チェックサムアドレス
 * @throws {JPYCPaymentError} 無効なアドレス形式の場合（INVALID_ADDRESS。メッセージに原因・直し方・入力値を含む）
 */
export function toChecksumAddress(address: string): string {
    assertAddressFormat(address);

    // アドレスを小文字に変換（0xプレフィックスを除く）
    const lowerCaseAddress = address.slice(2).toLowerCase();

    // Keccak-256ハッシュを計算
    const hashHex = bytesToHex(keccak_256(lowerCaseAddress));

    // ハッシュ値が8以上（16進数でa-f）なら大文字、そうでなければ小文字
    let checksumAddress = '0x';
    for (let i = 0; i < lowerCaseAddress.length; i++) {
        const char = lowerCaseAddress.charAt(i);
        const hashValue = Number.parseInt(hashHex.charAt(i), 16);
        checksumAddress += hashValue >= 8 ? char.toUpperCase() : char;
    }

    return checksumAddress;
}

/**
 * アドレスを検証し、EIP-55チェックサム形式に正規化
 * 大文字小文字が混在する場合はチェックサム付きとみなし、一致しなければエラーにする
 * （全て小文字・全て大文字のアドレスはチェックサムを持たないため、形式のみ検証する。EIP-55の規定どおり）
 * @param address - 検証するアドレス
 * @returns EIP-55チェックサムアドレス
 * @throws {JPYCPaymentError} 形式が無効な場合（INVALID_ADDRESS）、チェックサムが一致しない場合（CHECKSUM_FAILED）
 */
export function normalizeAddress(address: string): string {
    const checksummed = toChecksumAddress(address);
    const hex = address.slice(2);
    const isMixedCase = hex !== hex.toLowerCase() && hex !== hex.toUpperCase();

    if (isMixedCase && address !== checksummed) {
        throw addressError(
            'アドレスのチェックサムが一致しません。打ち間違いがないか確認してください',
            address,
            { code: 'CHECKSUM_FAILED' }
        );
    }

    return checksummed;
}

/**
 * ゼロアドレス（0x + 40個の0。大文字小文字は区別しない）かどうか
 * ゼロアドレスへの送金は取り戻せないため、受取アドレスの誤り検出に使う
 * @param address - 検証するアドレス
 * @returns ゼロアドレスの場合true（文字列以外はfalse）
 */
export function isZeroAddress(address: string): boolean {
    return typeof address === 'string' && ZERO_ADDRESS_REGEX.test(address);
}

/**
 * EIP-55チェックサムアドレスの検証
 * @param address - 検証するアドレス
 * @returns チェックサムが有効かどうか
 */
export function isValidChecksumAddress(address: string): boolean {
    try {
        return address === toChecksumAddress(address);
    } catch {
        return false;
    }
}

/**
 * アドレスの基本的な形式検証（チェックサムは検証しない）
 * @param address - 検証するアドレス
 * @returns アドレス形式が有効かどうか
 */
export function isValidAddressFormat(address: string): boolean {
    // 文字列以外（Symbolなど）を正規表現に渡すと文字列化で例外が出るため、先に型を確認する
    return typeof address === 'string' && ADDRESS_REGEX.test(address);
}
