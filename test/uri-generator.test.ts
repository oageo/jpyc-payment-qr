import { describe, it, expect } from 'vitest';
import { generatePaymentURI } from '../src/uri-generator.js';
import { JPYCPaymentError } from '../src/errors.js';
import type { PaymentURIOptions } from '../src/types.js';

describe('URI Generator', () => {
    describe('generatePaymentURI', () => {
        it('基本的なURIを生成できる', () => {
            const options: PaymentURIOptions = {
                merchantAddress: '0x1234567890123456789012345678901234567890',
                amount: 100,
            };

            const result = generatePaymentURI(options);

            expect(result.uri).toContain('ethereum:');
            expect(result.uri).toContain('@137/transfer');
            expect(result.uri).toContain('address=0x1234567890123456789012345678901234567890');
            expect(result.uri).toContain('uint256=100000000000000000000');
            expect(result.chainId).toBe(137);
            expect(result.network).toBe('polygon');
            expect(result.amountJPY).toBe('100');
            expect(result.decimals).toBe(18);
        });

        it('Ethereumネットワークを指定できる', () => {
            const options: PaymentURIOptions = {
                merchantAddress: '0x1234567890123456789012345678901234567890',
                amount: 100,
                network: 'ethereum',
            };

            const result = generatePaymentURI(options);

            expect(result.uri).toContain('@1/transfer');
            expect(result.chainId).toBe(1);
            expect(result.network).toBe('ethereum');
        });

        it('Avalancheネットワークを指定できる', () => {
            const options: PaymentURIOptions = {
                merchantAddress: '0x1234567890123456789012345678901234567890',
                amount: 100,
                network: 'avalanche',
            };

            const result = generatePaymentURI(options);

            expect(result.uri).toContain('@43114/transfer');
            expect(result.chainId).toBe(43114);
            expect(result.network).toBe('avalanche');
        });

        it('文字列の金額を処理できる', () => {
            const options: PaymentURIOptions = {
                merchantAddress: '0x1234567890123456789012345678901234567890',
                amount: '123.456',
            };

            const result = generatePaymentURI(options);

            expect(result.amountJPY).toBe('123.456');
            expect(result.amountWei).toBe('123456000000000000000');
        });

        it('カスタムコントラクトアドレスとdecimalsを使用できる', () => {
            const options: PaymentURIOptions = {
                merchantAddress: '0x1234567890123456789012345678901234567890',
                amount: 100,
                jpycContractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
                decimals: 6,
            };

            const result = generatePaymentURI(options);

            expect(result.jpycContractAddress).toContain('abcdef');
            expect(result.decimals).toBe(6);
            expect(result.amountWei).toBe('100000000');
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('警告を返す', () => {
            const options: PaymentURIOptions = {
                merchantAddress: '0x1234567890123456789012345678901234567890',
                amount: 0.5,
            };

            const result = generatePaymentURI(options);

            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]?.code).toBe('SMALL_AMOUNT');
        });

        it('無効なオプションでエラーを投げる', () => {
            const options = {
                merchantAddress: 'invalid',
                amount: 100,
            } as PaymentURIOptions;

            expect(() => generatePaymentURI(options)).toThrow(JPYCPaymentError);
        });

        it('バリデーションエラーを投げる', () => {
            const options = {
                amount: 100,
            } as PaymentURIOptions;

            expect(() => generatePaymentURI(options)).toThrow('merchantAddressは必須です');
        });
    });
});
