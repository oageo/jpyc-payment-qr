import { describe, it, expect } from 'vitest';
import { generatePaymentURI } from '../src/uri-generator.js';
import { decodeEIP681 } from '../src/encoder.js';
import { weiToJpy } from '../src/encoder.js';
import type { PaymentURIOptions } from '../src/types.js';

describe('Integration', () => {
    it('URI生成→デコード→金額変換の完全な流れ', () => {
        // 1. URI生成
        const options: PaymentURIOptions = {
            merchantAddress: '0x1234567890123456789012345678901234567890',
            amount: 100,
            network: 'polygon',
        };

        const generated = generatePaymentURI(options);

        // 2. 生成されたURIの検証
        expect(generated.uri).toBeTruthy();
        expect(generated.chainId).toBe(137);
        expect(generated.amountJPY).toBe('100');

        // 3. URIをデコード
        const decoded = decodeEIP681(generated.uri);

        expect(decoded.scheme).toBe('ethereum');
        expect(decoded.chainId).toBe(137);
        expect(decoded.functionName).toBe('transfer');
        expect(decoded.recipientAddress).toBe('0x1234567890123456789012345678901234567890');

        // 4. Wei→JPY変換
        const jpyAmount = weiToJpy(decoded.amount);
        expect(jpyAmount).toBe('100');
    });

    it('小数を含む金額の完全な流れ', () => {
        const options: PaymentURIOptions = {
            merchantAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            amount: '123.456789',
            network: 'ethereum',
        };

        const generated = generatePaymentURI(options);
        const decoded = decodeEIP681(generated.uri);
        const jpyAmount = weiToJpy(decoded.amount);

        expect(jpyAmount).toBe('123.456789');
    });

    it('異なるネットワークでの完全な流れ', () => {
        const networks = ['ethereum', 'polygon', 'avalanche'] as const;

        for (const network of networks) {
            const options: PaymentURIOptions = {
                merchantAddress: '0x1234567890123456789012345678901234567890',
                amount: 50,
                network,
            };

            const generated = generatePaymentURI(options);
            const decoded = decodeEIP681(generated.uri);

            expect(decoded.scheme).toBe('ethereum');
            expect(weiToJpy(decoded.amount)).toBe('50');
        }
    });

    it('カスタムdecimalsでの完全な流れ', () => {
        const options: PaymentURIOptions = {
            merchantAddress: '0x1234567890123456789012345678901234567890',
            amount: 100,
            jpycContractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            decimals: 6,
        };

        const generated = generatePaymentURI(options);
        const decoded = decodeEIP681(generated.uri);
        const jpyAmount = weiToJpy(decoded.amount, 6);

        expect(jpyAmount).toBe('100');
        expect(generated.decimals).toBe(6);
    });

    it('大きな金額の完全な流れ', () => {
        const options: PaymentURIOptions = {
            merchantAddress: '0x1234567890123456789012345678901234567890',
            amount: 10000000, // 1000万JPY
        };

        const generated = generatePaymentURI(options);
        const decoded = decodeEIP681(generated.uri);
        const jpyAmount = weiToJpy(decoded.amount);

        expect(jpyAmount).toBe('10000000');
        expect(generated.warnings.some((w) => w.code === 'LARGE_AMOUNT')).toBe(true);
    });
});
