import { describe, it, expect } from 'vitest';
import { validateGenerateOptions, isValidAddress, isValidAmount } from '../src/validator.js';
import type { PaymentURIOptions } from '../src/types.js';

describe('Validator', () => {
    describe('validateGenerateOptions', () => {
        it('正しいオプションを検証できる', () => {
            const options: PaymentURIOptions = {
                merchantAddress: '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
                amount: 100,
            };

            const result = validateGenerateOptions(options);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('merchantAddressが必須である', () => {
            const options = {
                amount: 100,
            } as PaymentURIOptions;

            const result = validateGenerateOptions(options);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('merchantAddressは必須です');
        });

        it('無効なmerchantAddressを検証できる', () => {
            const options: PaymentURIOptions = {
                merchantAddress: 'invalid',
                amount: 100,
            };

            const result = validateGenerateOptions(options);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('無効なアドレス形式'))).toBe(true);
        });

        it('amountが必須である', () => {
            const options = {
                merchantAddress: '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
            } as unknown as PaymentURIOptions;

            const result = validateGenerateOptions(options);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('amountは必須です');
        });

        it('負の金額でエラーを返す', () => {
            const options: PaymentURIOptions = {
                merchantAddress: '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
                amount: -100,
            };

            const result = validateGenerateOptions(options);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('正の数である必要があります'))).toBe(true);
        });

        it('ゼロの金額でエラーを返す', () => {
            const options: PaymentURIOptions = {
                merchantAddress: '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
                amount: 0,
            };

            const result = validateGenerateOptions(options);
            expect(result.valid).toBe(false);
        });

        it('小額で警告を返す', () => {
            const options: PaymentURIOptions = {
                merchantAddress: '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
                amount: 0.5,
            };

            const result = validateGenerateOptions(options);
            expect(result.valid).toBe(true);
            expect(result.warnings.some((w) => w.code === 'SMALL_AMOUNT')).toBe(true);
        });

        it('高額で警告を返す', () => {
            const options: PaymentURIOptions = {
                merchantAddress: '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
                amount: 10000000,
            };

            const result = validateGenerateOptions(options);
            expect(result.valid).toBe(true);
            expect(result.warnings.some((w) => w.code === 'LARGE_AMOUNT')).toBe(true);
        });

        it('無効なネットワークでエラーを返す', () => {
            const options = {
                merchantAddress: '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
                amount: 100,
                network: 'invalid-network',
            } as unknown as PaymentURIOptions;

            const result = validateGenerateOptions(options);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('サポートされていないネットワーク'))).toBe(
                true
            );
        });

        it('カスタムコントラクトアドレスで警告を返す', () => {
            const options: PaymentURIOptions = {
                merchantAddress: '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
                amount: 100,
                jpycContractAddress: '0x1234567890123456789012345678901234567890',
            };

            const result = validateGenerateOptions(options);
            expect(result.valid).toBe(true);
            expect(result.warnings.some((w) => w.code === 'CUSTOM_CONTRACT')).toBe(true);
        });

        it('decimalsはjpycContractAddressと併用が必要', () => {
            const options: PaymentURIOptions = {
                merchantAddress: '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
                amount: 100,
                decimals: 6,
            };

            const result = validateGenerateOptions(options);
            expect(result.valid).toBe(false);
            expect(
                result.errors.some((e) => e.includes('jpycContractAddressと併用する場合のみ'))
            ).toBe(true);
        });

        it('無効なdecimalsでエラーを返す', () => {
            const options: PaymentURIOptions = {
                merchantAddress: '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
                amount: 100,
                jpycContractAddress: '0x1234567890123456789012345678901234567890',
                decimals: 19,
            };

            const result = validateGenerateOptions(options);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('0から18の整数である必要があります'))).toBe(
                true
            );
        });
    });

    describe('isValidAddress', () => {
        it('正しいアドレスを検証できる', () => {
            expect(isValidAddress('0xe7c3d8c9a439fede00d2600032d5db0be71c3c29')).toBe(true);
            expect(isValidAddress('0xE7C3D8C9A439FEDE00D2600032D5DB0BE71C3C29')).toBe(true);
        });

        it('無効なアドレスを検証できる', () => {
            expect(isValidAddress('0x123')).toBe(false);
            expect(isValidAddress('not-an-address')).toBe(false);
            expect(isValidAddress('e7c3d8c9a439fede00d2600032d5db0be71c3c29')).toBe(false);
        });
    });

    describe('isValidAmount', () => {
        it('正しい金額を検証できる', () => {
            expect(isValidAmount(1)).toBe(true);
            expect(isValidAmount(100)).toBe(true);
            expect(isValidAmount('1000.5')).toBe(true);
        });

        it('無効な金額を検証できる', () => {
            expect(isValidAmount(0)).toBe(false);
            expect(isValidAmount(-1)).toBe(false);
            expect(isValidAmount(Number.POSITIVE_INFINITY)).toBe(false);
            expect(isValidAmount('abc')).toBe(false);
        });
    });
});
