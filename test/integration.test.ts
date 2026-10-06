import { describe, expect, it } from 'vitest';
import { normalizeAmount } from '../src/amount.js';
import { decodeEIP681, encodeEIP681, weiToJpy } from '../src/encoder.js';
import { generateQRFromURI } from '../src/qr-generator.js';
import { generatePaymentURI } from '../src/uri-generator.js';

const MERCHANT = '0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD';

describe('Integration', () => {
    it.each([
        ['polygon', 100],
        ['ethereum', '123.456789'],
        ['avalanche', '1234.5'],
        ['kaia', 10000000],
    ] as const)(
        '%s で 金額 %j のURIを生成→デコード→再エンコードすると元に戻る',
        (network, amount) => {
            const generated = generatePaymentURI({
                merchantAddress: MERCHANT.toLowerCase(),
                amount,
                network,
            });
            const decoded = decodeEIP681(generated.uri);

            expect(decoded).toEqual({
                scheme: 'ethereum',
                contractAddress: generated.jpycContractAddress,
                chainId: generated.chainId,
                functionName: 'transfer',
                recipientAddress: MERCHANT,
                amount: generated.amountWei,
            });
            expect(weiToJpy(decoded.amount)).toBe(normalizeAmount(amount));
            expect(
                encodeEIP681(
                    decoded.contractAddress,
                    decoded.recipientAddress,
                    decoded.amount,
                    decoded.chainId
                )
            ).toBe(generated.uri);
        }
    );

    it('カスタムコントラクト・decimals・chainIdでも生成→デコード→金額変換で元に戻る', () => {
        const generated = generatePaymentURI({
            merchantAddress: MERCHANT,
            amount: '100.5',
            jpycContractAddress: '0x1111111111111111111111111111111111111111',
            chainId: 80002,
            decimals: 6,
        });
        const decoded = decodeEIP681(generated.uri);

        expect(decoded.chainId).toBe(80002);
        expect(decoded.contractAddress).toBe(generated.jpycContractAddress);
        expect(decoded.amount).toBe('100500000');
        expect(weiToJpy(decoded.amount, generated.decimals)).toBe('100.5');
    });

    it('生成したURIからQRコードを作ると同じURIになる', async () => {
        const generated = generatePaymentURI({ merchantAddress: MERCHANT, amount: 100 });
        const qr = await generateQRFromURI(generated.uri, 'svg');
        expect(qr.uri).toBe(generated.uri);
    });
});
