import { describe, it, expect } from 'vitest';
import { jpyToWei, weiToJpy, encodeEIP681, decodeEIP681 } from '../src/encoder.js';
import { JPYCPaymentError } from '../src/errors.js';

describe('Encoder', () => {
    describe('jpyToWei', () => {
        it('整数をWeiに変換できる', () => {
            expect(jpyToWei(1)).toBe('1000000000000000000');
            expect(jpyToWei(100)).toBe('100000000000000000000');
            expect(jpyToWei(1000)).toBe('1000000000000000000000');
        });

        it('小数をWeiに変換できる', () => {
            expect(jpyToWei(0.5)).toBe('500000000000000000');
            expect(jpyToWei(1.23)).toBe('1230000000000000000');
            expect(jpyToWei(99.999)).toBe('99999000000000000000');
        });

        it('文字列をWeiに変換できる', () => {
            expect(jpyToWei('1')).toBe('1000000000000000000');
            expect(jpyToWei('100.5')).toBe('100500000000000000000');
            expect(jpyToWei('0.123456789012345678')).toBe('123456789012345678');
        });

        it('カスタムdecimalsで変換できる', () => {
            expect(jpyToWei(1, 6)).toBe('1000000');
            expect(jpyToWei(100, 6)).toBe('100000000');
        });

        it('負の値でエラーを投げる', () => {
            expect(() => jpyToWei(-1)).toThrow(JPYCPaymentError);
            expect(() => jpyToWei('-100')).toThrow(JPYCPaymentError);
        });

        it('無限大でエラーを投げる', () => {
            expect(() => jpyToWei(Number.POSITIVE_INFINITY)).toThrow(JPYCPaymentError);
        });

        it('無効な文字列でエラーを投げる', () => {
            expect(() => jpyToWei('abc')).toThrow(JPYCPaymentError);
        });

        it('無効なdecimalsでエラーを投げる', () => {
            expect(() => jpyToWei(1, -1)).toThrow(JPYCPaymentError);
            expect(() => jpyToWei(1, 19)).toThrow(JPYCPaymentError);
            expect(() => jpyToWei(1, 1.5)).toThrow(JPYCPaymentError);
        });
    });

    describe('weiToJpy', () => {
        it('WeiをJPYに変換できる', () => {
            expect(weiToJpy('1000000000000000000')).toBe('1');
            expect(weiToJpy('100000000000000000000')).toBe('100');
            expect(weiToJpy('500000000000000000')).toBe('0.5');
        });

        it('小数部分の末尾のゼロを削除する', () => {
            expect(weiToJpy('1230000000000000000')).toBe('1.23');
            expect(weiToJpy('123000000000000000')).toBe('0.123');
        });

        it('カスタムdecimalsで変換できる', () => {
            expect(weiToJpy('1000000', 6)).toBe('1');
            expect(weiToJpy('100000000', 6)).toBe('100');
        });

        it('無効なdecimalsでエラーを投げる', () => {
            expect(() => weiToJpy('1000000000000000000', -1)).toThrow(JPYCPaymentError);
            expect(() => weiToJpy('1000000000000000000', 19)).toThrow(JPYCPaymentError);
        });
    });

    describe('encodeEIP681', () => {
        it('EIP-681 URIをエンコードできる', () => {
            const uri = encodeEIP681(
                '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
                '0x1234567890123456789012345678901234567890',
                '1000000000000000000',
                137
            );

            expect(uri).toBe(
                'ethereum:0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29@137/transfer' +
                    '?address=0x1234567890123456789012345678901234567890&uint256=1000000000000000000'
            );
        });

        it('アドレスをチェックサム形式に変換する', () => {
            const uri = encodeEIP681(
                '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
                '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
                '1000000000000000000',
                1
            );

            expect(uri).toContain('0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29');
        });

        it('無効なコントラクトアドレスでエラーを投げる', () => {
            expect(() =>
                encodeEIP681('invalid', '0x1234567890123456789012345678901234567890', '1000', 137)
            ).toThrow(JPYCPaymentError);
        });

        it('無効な受取アドレスでエラーを投げる', () => {
            expect(() =>
                encodeEIP681('0xe7c3d8c9a439fede00d2600032d5db0be71c3c29', 'invalid', '1000', 137)
            ).toThrow(JPYCPaymentError);
        });
    });

    describe('decodeEIP681', () => {
        it('EIP-681 URIをデコードできる', () => {
            const uri =
                'ethereum:0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29@137/transfer' +
                '?address=0x1234567890123456789012345678901234567890&uint256=1000000000000000000';

            const decoded = decodeEIP681(uri);

            expect(decoded.scheme).toBe('ethereum');
            expect(decoded.contractAddress).toBe('0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29');
            expect(decoded.chainId).toBe(137);
            expect(decoded.functionName).toBe('transfer');
            expect(decoded.recipientAddress).toBe('0x1234567890123456789012345678901234567890');
            expect(decoded.amount).toBe('1000000000000000000');
        });

        it('無効なURIでエラーを投げる', () => {
            expect(() => decodeEIP681('invalid-uri')).toThrow(JPYCPaymentError);
        });
    });
});
