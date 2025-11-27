import { describe, it, expect } from 'vitest';
import {
    isValidAddressFormat,
    isValidChecksumAddress,
    toChecksumAddress,
} from '../src/checksum.js';
import { JPYCPaymentError } from '../src/errors.js';

describe('Checksum', () => {
    describe('toChecksumAddress', () => {
        it('小文字アドレスをチェックサムアドレスに変換できる', () => {
            const address = '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29';
            const checksummed = toChecksumAddress(address);
            expect(checksummed).toBe('0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29');
        });

        it('大文字アドレスをチェックサムアドレスに変換できる', () => {
            const address = '0xE7C3D8C9A439FEDE00D2600032D5DB0BE71C3C29';
            const checksummed = toChecksumAddress(address);
            expect(checksummed).toBe('0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29');
        });

        it('混在アドレスをチェックサムアドレスに変換できる', () => {
            const address = '0xE7c3D8c9A439FedE00d2600032D5db0bE71C3c29';
            const checksummed = toChecksumAddress(address);
            expect(checksummed).toBe('0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29');
        });

        it('0xプレフィックスがない場合はエラーを投げる', () => {
            expect(() => toChecksumAddress('e7c3d8c9a439fede00d2600032d5db0be71c3c29')).toThrow(
                JPYCPaymentError
            );
        });

        it('長さが42文字でない場合はエラーを投げる', () => {
            expect(() => toChecksumAddress('0x123')).toThrow(JPYCPaymentError);
        });

        it('16進数以外の文字が含まれる場合はエラーを投げる', () => {
            expect(() => toChecksumAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toThrow(
                JPYCPaymentError
            );
        });
    });

    describe('isValidChecksumAddress', () => {
        it('正しいチェックサムアドレスを検証できる', () => {
            expect(isValidChecksumAddress('0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29')).toBe(true);
        });

        it('間違ったチェックサムアドレスを検証できる', () => {
            expect(isValidChecksumAddress('0xe7c3d8c9a439fede00d2600032d5db0be71c3c29')).toBe(
                false
            );
        });

        it('無効なアドレス形式を検証できる', () => {
            expect(isValidChecksumAddress('0x123')).toBe(false);
            expect(isValidChecksumAddress('not-an-address')).toBe(false);
        });
    });

    describe('isValidAddressFormat', () => {
        it('正しいアドレス形式を検証できる', () => {
            expect(isValidAddressFormat('0xe7c3d8c9a439fede00d2600032d5db0be71c3c29')).toBe(true);
            expect(isValidAddressFormat('0xE7C3D8C9A439FEDE00D2600032D5DB0BE71C3C29')).toBe(true);
        });

        it('無効なアドレス形式を検証できる', () => {
            expect(isValidAddressFormat('0x123')).toBe(false);
            expect(isValidAddressFormat('e7c3d8c9a439fede00d2600032d5db0be71c3c29')).toBe(false);
            expect(isValidAddressFormat('0xGGGG')).toBe(false);
        });
    });
});
