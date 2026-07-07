import { toChecksumAddress } from './checksum.js';
import {
    AMOUNT_FORMAT_REGEX,
    EIP681_SCHEME,
    JPYC_DECIMALS,
    TRANSFER_FUNCTION,
} from './constants.js';
import { JPYCPaymentError } from './errors.js';

/**
 * decimalsのバリデーション
 * @throws {JPYCPaymentError} 0から18の整数でない場合
 */
function assertValidDecimals(decimals: number): void {
    if (decimals < 0 || decimals > 18 || !Number.isInteger(decimals)) {
        throw new JPYCPaymentError(
            `decimalsは0から18の整数である必要があります: ${decimals}`,
            'INVALID_DECIMALS'
        );
    }
}

/**
 * JPY金額をWei（最小単位）に変換
 * @param amount - JPY金額（数値または文字列）
 * @param decimals - トークンのdecimals（デフォルト: 18）
 * @returns Wei単位の金額（文字列）
 * @throws {JPYCPaymentError} 無効な金額またはdecimalsの場合
 */
export function jpyToWei(amount: number | string, decimals: number = JPYC_DECIMALS): string {
    assertValidDecimals(decimals);

    // 文字列に正規化
    const amountStr = typeof amount === 'string' ? amount : amount.toString();

    // 負の値チェック
    if (amountStr.startsWith('-')) {
        throw new JPYCPaymentError('金額を負の数にすることはできません', 'INVALID_AMOUNT', {
            amount: amountStr,
        });
    }

    if (!Number.isFinite(Number.parseFloat(amountStr))) {
        throw new JPYCPaymentError('金額は有限の数値である必要があります', 'INVALID_AMOUNT', {
            amount: amountStr,
        });
    }

    // 10進数形式の検証（科学的記数法、複数の小数点、数字以外の文字を排除）
    if (!AMOUNT_FORMAT_REGEX.test(amountStr)) {
        throw new JPYCPaymentError(`無効な金額形式です: ${amountStr}`, 'INVALID_AMOUNT', {
            amount: amountStr,
        });
    }

    // 小数点で分割（例：".5" → 整数部 "0"、小数部 "5"）
    const [intPart = '0', decPart = ''] = amountStr.split('.');

    // decimals桁に0埋め・切り詰め
    const paddedDec = decPart.padEnd(decimals, '0').slice(0, decimals);

    // BigIntで計算（オーバーフローを防ぐ）
    return BigInt((intPart || '0') + paddedDec).toString();
}

/**
 * Wei（最小単位）をJPY金額に変換
 * @param weiAmount - Wei単位の金額（文字列）
 * @param decimals - トークンのdecimals（デフォルト: 18）
 * @returns JPY金額（文字列）
 */
export function weiToJpy(weiAmount: string, decimals: number = JPYC_DECIMALS): string {
    assertValidDecimals(decimals);

    let wei: bigint;
    try {
        wei = BigInt(weiAmount);
    } catch {
        throw new JPYCPaymentError(`無効なWei金額形式です: ${weiAmount}`, 'INVALID_AMOUNT', {
            weiAmount,
        });
    }
    const divisor = BigInt(10) ** BigInt(decimals);

    const intPart = wei / divisor;
    const remainder = wei % divisor;

    // 小数部分を文字列に変換（前ゼロ埋め）し、末尾のゼロを削除
    const decPart = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');

    return decPart ? `${intPart}.${decPart}` : intPart.toString();
}

/**
 * EIP-681フォーマットのURIをエンコード
 * @param contractAddress - トークンコントラクトアドレス
 * @param recipientAddress - 受取アドレス
 * @param amount - 金額（Wei単位、文字列）
 * @param chainId - チェーンID
 * @returns EIP-681フォーマットのURI
 * @throws {JPYCPaymentError} 無効なアドレスの場合
 */
export function encodeEIP681(
    contractAddress: string,
    recipientAddress: string,
    amount: string,
    chainId: number
): string {
    // アドレスをチェックサム形式に変換
    const checksummedContract = toChecksumAddress(contractAddress);
    const checksummedRecipient = toChecksumAddress(recipientAddress);

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
 * EIP-681フォーマットのURIをパース用正規表現
 * <scheme>:<contract>@<chainId>/<function>?<query>
 */
const EIP681_URI_REGEX = /^([a-zA-Z][a-zA-Z0-9+.-]*):([^@/?]+)@(\d+)\/([^?]+)\?(.+)$/;

/**
 * EIP-681 URIをデコード（パース）
 * @param uri - EIP-681フォーマットのURI
 * @returns パース結果
 * @throws {JPYCPaymentError} デコードに失敗した場合
 */
export function decodeEIP681(uri: string): DecodedEIP681 {
    try {
        const match = uri.match(EIP681_URI_REGEX);
        if (!match) {
            throw new Error(
                'URIがEIP-681形式（<scheme>:<contract>@<chainId>/<function>?<query>）ではありません'
            );
        }
        const [
            ,
            scheme = '',
            contractAddress = '',
            chainIdStr = '',
            functionName = '',
            queryString = '',
        ] = match;

        const params = new URLSearchParams(queryString);
        const recipientAddress = params.get('address');
        const amount = params.get('uint256');

        if (!recipientAddress) {
            throw new Error('受取アドレスが見つかりません');
        }
        if (!amount) {
            throw new Error('金額が見つかりません');
        }

        return {
            scheme,
            contractAddress,
            chainId: Number.parseInt(chainIdStr, 10),
            functionName,
            recipientAddress,
            amount,
        };
    } catch (error) {
        throw new JPYCPaymentError('EIP-681 URIのデコードに失敗しました', 'ENCODING_FAILED', {
            uri,
            error,
        });
    }
}
