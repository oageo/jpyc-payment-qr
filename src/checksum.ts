import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import { ADDRESS_REGEX } from './constants.js';
import { JPYCPaymentError } from './errors.js';

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
    if (!ADDRESS_REGEX.test(address)) {
        throw new JPYCPaymentError(
            'アドレスは16進数文字のみを含む必要があります',
            'INVALID_ADDRESS',
            { address }
        );
    }

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
    return ADDRESS_REGEX.test(address);
}
