import { toChecksumAddress } from './checksum.js';
import { EIP681_SCHEME, JPYC_DECIMALS, TRANSFER_FUNCTION } from './constants.js';
import { JPYCPaymentError } from './errors.js';

/**
 * JPY金額をWei（最小単位）に変換
 * @param amount - JPY金額（数値または文字列）
 * @param decimals - トークンのdecimals（デフォルト: 18）
 * @returns Wei単位の金額（文字列）
 * @throws {JPYCPaymentError} 無効な金額またはdecimalsの場合
 */
export function jpyToWei(amount: number | string, decimals: number = JPYC_DECIMALS): string {
    // decimalsのバリデーション
    if (decimals < 0 || decimals > 18 || !Number.isInteger(decimals)) {
        throw new JPYCPaymentError(
            `decimalsは0から18の整数である必要があります: ${decimals}`,
            'INVALID_DECIMALS'
        );
    }

    // 文字列に正規化
    const amountStr = typeof amount === 'string' ? amount : amount.toString();

    // 負の値チェック
    if (amountStr.startsWith('-')) {
        throw new JPYCPaymentError('金額を負の数にすることはできません', 'INVALID_AMOUNT', {
            amount: amountStr,
        });
    }

    // 数値としての検証
    const amountNum = Number.parseFloat(amountStr);
    if (Number.isNaN(amountNum)) {
        throw new JPYCPaymentError(`無効な金額形式です: ${amountStr}`, 'INVALID_AMOUNT', {
            amount: amountStr,
        });
    }

    if (!Number.isFinite(amountNum)) {
        throw new JPYCPaymentError('金額は有限の数値である必要があります', 'INVALID_AMOUNT', {
            amount: amountStr,
        });
    }

    // 小数点が複数含まれていないかチェック
    const decimalCount = (amountStr.match(/\./g) || []).length;
    if (decimalCount > 1) {
        throw new JPYCPaymentError(
            `金額に小数点が複数含まれています: ${amountStr}`,
            'INVALID_AMOUNT',
            { amount: amountStr }
        );
    }

    // 小数点で分割
    const parts = amountStr.split('.');
    const intPart = parts[0] || '0'; // 空文字列の場合は "0" にする（例：".5" → "0.5"）
    const decPart = parts[1] || '';

    // decimals桁に0埋め・切り詰め
    const paddedDec = decPart.padEnd(decimals, '0').slice(0, decimals);

    // BigIntで計算（オーバーフローを防ぐ）
    const weiAmount = BigInt(intPart + paddedDec);

    return weiAmount.toString();
}

/**
 * Wei（最小単位）をJPY金額に変換
 * @param weiAmount - Wei単位の金額（文字列）
 * @param decimals - トークンのdecimals（デフォルト: 18）
 * @returns JPY金額（文字列）
 */
export function weiToJpy(weiAmount: string, decimals: number = JPYC_DECIMALS): string {
    // decimalsのバリデーション
    if (decimals < 0 || decimals > 18 || !Number.isInteger(decimals)) {
        throw new JPYCPaymentError(
            `decimalsは0から18の整数である必要があります: ${decimals}`,
            'INVALID_DECIMALS'
        );
    }

    const wei = BigInt(weiAmount);
    const divisor = BigInt(10) ** BigInt(decimals);

    const intPart = wei / divisor;
    const remainder = wei % divisor;

    // 小数部分を文字列に変換（前ゼロ埋め）
    const decPart = remainder.toString().padStart(decimals, '0');

    // 末尾のゼロを削除
    const trimmedDecPart = decPart.replace(/0+$/, '');

    return trimmedDecPart ? `${intPart}.${trimmedDecPart}` : intPart.toString();
}

/**
 * EIP-681フォーマットのURIをエンコード
 * @param contractAddress - トークンコントラクトアドレス
 * @param recipientAddress - 受取アドレス
 * @param amount - 金額（Wei単位、文字列）
 * @param chainId - チェーンID
 * @returns EIP-681フォーマットのURI
 * @throws {JPYCPaymentError} エンコードに失敗した場合
 */
export function encodeEIP681(
    contractAddress: string,
    recipientAddress: string,
    amount: string,
    chainId: number
): string {
    try {
        // アドレスをチェックサム形式に変換
        const checksummedContract = toChecksumAddress(contractAddress);
        const checksummedRecipient = toChecksumAddress(recipientAddress);

        // EIP-681フォーマット: ethereum:<contract>@<chainId>/transfer?address=<recipient>&uint256=<amount>
        const uri =
            `${EIP681_SCHEME}:${checksummedContract}@${chainId}/${TRANSFER_FUNCTION}` +
            `?address=${checksummedRecipient}&uint256=${amount}`;

        return uri;
    } catch (error) {
        if (error instanceof JPYCPaymentError) {
            throw error;
        }
        throw new JPYCPaymentError('EIP-681 URIのエンコードに失敗しました', 'ENCODING_FAILED', {
            error,
        });
    }
}

/**
 * EIP-681 URIをデコード（パース）
 * @param uri - EIP-681フォーマットのURI
 * @returns パース結果
 */
export interface DecodedEIP681 {
    scheme: string;
    contractAddress: string;
    chainId: number;
    functionName: string;
    recipientAddress: string;
    amount: string;
}

export function decodeEIP681(uri: string): DecodedEIP681 {
    try {
        // ethereum:<contract>@<chainId>/transfer?address=<recipient>&uint256=<amount>
        const schemeMatch = uri.match(/^([^:]+):/);
        if (!schemeMatch?.[1]) {
            throw new Error('スキームが見つかりません');
        }
        const scheme = schemeMatch[1];

        const contractMatch = uri.match(/:([^@]+)@/);
        if (!contractMatch?.[1]) {
            throw new Error('コントラクトアドレスが見つかりません');
        }
        const contractAddress = contractMatch[1];

        const chainIdMatch = uri.match(/@(\d+)\//);
        if (!chainIdMatch?.[1]) {
            throw new Error('チェーンIDが見つかりません');
        }
        const chainId = Number.parseInt(chainIdMatch[1], 10);

        const functionMatch = uri.match(/\/([^?]+)\?/);
        if (!functionMatch?.[1]) {
            throw new Error('関数名が見つかりません');
        }
        const functionName = functionMatch[1];

        const queryString = uri.split('?')[1];
        if (!queryString) {
            throw new Error('クエリパラメータが見つかりません');
        }

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
            chainId,
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
