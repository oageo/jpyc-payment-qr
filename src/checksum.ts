import { keccak_256 } from '@noble/hashes/sha3';
import { JPYCPaymentError } from './errors.js';

/**
 * バイト配列を16進数文字列に変換
 */
function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * EIP-55チェックサムアドレスを生成
 * @param address - Ethereumアドレス（0xプレフィックス付き）
 * @returns EIP-55チェックサムアドレス
 * @throws {JPYCPaymentError} 無効なアドレス形式の場合
 */
export function toChecksumAddress(address: string): string {
    // 0xプレフィックスの検証
    if (!address.startsWith('0x')) {
        throw new JPYCPaymentError('アドレスは0xで始まる必要があります', 'INVALID_ADDRESS', {
            address,
        });
    }

    // 長さの検証（0x + 40文字）
    if (address.length !== 42) {
        throw new JPYCPaymentError(
            'アドレスは42文字（0x + 40文字の16進数）である必要があります',
            'INVALID_ADDRESS',
            { address, length: address.length }
        );
    }

    // 16進数の検証
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new JPYCPaymentError(
            'アドレスは16進数文字のみを含む必要があります',
            'INVALID_ADDRESS',
            { address }
        );
    }

    // アドレスを小文字に変換（0xプレフィックスを除く）
    const lowerCaseAddress = address.slice(2).toLowerCase();

    // Keccak-256ハッシュを計算
    const hash = keccak_256(lowerCaseAddress);
    const hashHex = bytesToHex(hash);

    // チェックサムアドレスを生成
    let checksumAddress = '0x';
    for (let i = 0; i < lowerCaseAddress.length; i++) {
        const char = lowerCaseAddress[i];
        if (char === undefined) continue;

        // ハッシュの対応する16進数文字を取得
        const hashChar = hashHex[i];
        if (hashChar === undefined) continue;

        // ハッシュ値が8以上（16進数でa-f）なら大文字、そうでなければ小文字
        const hashValue = Number.parseInt(hashChar, 16);
        checksumAddress += hashValue >= 8 ? char.toUpperCase() : char;
    }

    return checksumAddress;
}

/**
 * EIP-55チェックサムアドレスの検証
 * @param address - 検証するアドレス
 * @returns チェックサムが有効かどうか
 */
export function isValidChecksumAddress(address: string): boolean {
    try {
        const checksummed = toChecksumAddress(address);
        return address === checksummed;
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
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}
