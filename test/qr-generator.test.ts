import { describe, it, expect } from 'vitest';
import {
    generatePaymentQR,
    generatePaymentQRWithFormat,
    generatePaymentQRBuffer,
    generateQRFromURI,
} from '../src/qr-generator.js';
import type { PaymentURIOptions } from '../src/types.js';
import { JPYCPaymentError } from '../src/errors.js';

describe('QR Generator', () => {
    const validOptions: PaymentURIOptions = {
        merchantAddress: '0x1234567890123456789012345678901234567890',
        amount: 100,
        network: 'polygon',
    };

    describe('generatePaymentQR', () => {
        it('デフォルトでPNG Data URLを生成できる', async () => {
            const result = await generatePaymentQR(validOptions);

            expect(result.format).toBe('png');
            expect(result.data).toMatch(/^data:image\/png;base64,/);
            expect(result.uri).toContain('ethereum:');
            expect(result.uri).toContain('@137/transfer');
        });

        it('カスタムQRオプションで生成できる', async () => {
            const result = await generatePaymentQR(validOptions, {
                width: 500,
                margin: 2,
                errorCorrectionLevel: 'H',
            });

            expect(result.format).toBe('png');
            expect(result.data).toMatch(/^data:image\/png;base64,/);
        });

        it('カスタムカラーで生成できる', async () => {
            const result = await generatePaymentQR(validOptions, {
                color: {
                    dark: '#FF0000',
                    light: '#00FF00',
                },
            });

            expect(result.format).toBe('png');
            expect(result.data).toMatch(/^data:image\/png;base64,/);
        });

        it('無効なオプションでエラーを投げる', async () => {
            await expect(
                generatePaymentQR({
                    merchantAddress: 'invalid',
                    amount: 100,
                })
            ).rejects.toThrow(JPYCPaymentError);
        });
    });

    describe('generatePaymentQRWithFormat', () => {
        it('PNG形式で生成できる', async () => {
            const result = await generatePaymentQRWithFormat(validOptions, 'png');

            expect(result.format).toBe('png');
            expect(result.data).toMatch(/^data:image\/png;base64,/);
        });

        it('SVG形式で生成できる', async () => {
            const result = await generatePaymentQRWithFormat(validOptions, 'svg');

            expect(result.format).toBe('svg');
            expect(result.data).toContain('<svg');
            expect(result.data).toContain('</svg>');
        });

        it('UTF8形式で生成できる', async () => {
            const result = await generatePaymentQRWithFormat(validOptions, 'utf8');

            expect(result.format).toBe('utf8');
            expect(result.data).toBeTruthy();
            expect(typeof result.data).toBe('string');
        });

        it('ターミナル形式で生成できる', async () => {
            const result = await generatePaymentQRWithFormat(validOptions, 'terminal');

            expect(result.format).toBe('terminal');
            expect(result.data).toBeTruthy();
            expect(typeof result.data).toBe('string');
        });

        it('異なるネットワークで生成できる', async () => {
            const networks = ['ethereum', 'polygon', 'avalanche'] as const;

            for (const network of networks) {
                const result = await generatePaymentQRWithFormat(
                    { ...validOptions, network },
                    'png'
                );

                expect(result.format).toBe('png');
                expect(result.data).toMatch(/^data:image\/png;base64,/);
            }
        });

        it('小数を含む金額で生成できる', async () => {
            const result = await generatePaymentQRWithFormat(
                {
                    merchantAddress: '0x1234567890123456789012345678901234567890',
                    amount: '123.456789',
                },
                'png'
            );

            expect(result.format).toBe('png');
            expect(result.data).toMatch(/^data:image\/png;base64,/);
            expect(result.uri).toContain('123456789000000000000');
        });

        it('無効なフォーマットでエラーを投げる', async () => {
            await expect(
                generatePaymentQRWithFormat(validOptions, 'invalid' as any)
            ).rejects.toThrow(JPYCPaymentError);
        });
    });

    describe('generatePaymentQRBuffer', () => {
        it('Uint8Array形式で生成できる', async () => {
            const buffer = await generatePaymentQRBuffer(validOptions);

            expect(buffer).toBeInstanceOf(Uint8Array);
            expect(buffer.length).toBeGreaterThan(0);

            // PNG署名を確認（最初の8バイト）
            expect(buffer[0]).toBe(0x89);
            expect(buffer[1]).toBe(0x50);
            expect(buffer[2]).toBe(0x4e);
            expect(buffer[3]).toBe(0x47);
        });

        it('カスタムQRオプションで生成できる', async () => {
            const buffer = await generatePaymentQRBuffer(validOptions, {
                width: 200,
                errorCorrectionLevel: 'L',
            });

            expect(buffer).toBeInstanceOf(Uint8Array);
            expect(buffer.length).toBeGreaterThan(0);
        });

        it('無効なオプションでエラーを投げる', async () => {
            await expect(
                generatePaymentQRBuffer({
                    merchantAddress: 'invalid',
                    amount: 100,
                })
            ).rejects.toThrow(JPYCPaymentError);
        });
    });

    describe('generateQRFromURI', () => {
        const validURI =
            'ethereum:0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29@137/transfer' +
            '?address=0x1234567890123456789012345678901234567890&uint256=1000000000000000000000';

        it('URIからPNG形式のQRコードを生成できる', async () => {
            const result = await generateQRFromURI(validURI, 'png');

            expect(result.format).toBe('png');
            expect(result.data).toMatch(/^data:image\/png;base64,/);
            expect(result.uri).toBe(validURI);
        });

        it('URIからSVG形式のQRコードを生成できる', async () => {
            const result = await generateQRFromURI(validURI, 'svg');

            expect(result.format).toBe('svg');
            expect(result.data).toContain('<svg');
            expect(result.uri).toBe(validURI);
        });

        it('URIからUTF8形式のQRコードを生成できる', async () => {
            const result = await generateQRFromURI(validURI, 'utf8');

            expect(result.format).toBe('utf8');
            expect(typeof result.data).toBe('string');
            expect(result.uri).toBe(validURI);
        });

        it('URIからターミナル形式のQRコードを生成できる', async () => {
            const result = await generateQRFromURI(validURI, 'terminal');

            expect(result.format).toBe('terminal');
            expect(typeof result.data).toBe('string');
            expect(result.uri).toBe(validURI);
        });

        it('カスタムQRオプションで生成できる', async () => {
            const result = await generateQRFromURI(validURI, 'png', {
                width: 400,
                margin: 1,
                color: {
                    dark: '#0000FF',
                    light: '#FFFF00',
                },
            });

            expect(result.format).toBe('png');
            expect(result.data).toMatch(/^data:image\/png;base64,/);
        });

        it('無効なフォーマットでエラーを投げる', async () => {
            await expect(generateQRFromURI(validURI, 'invalid' as any)).rejects.toThrow(
                JPYCPaymentError
            );
        });
    });

    describe('QRオプションのマージ', () => {
        it('部分的なオプションをデフォルト値でマージできる', async () => {
            const result = await generatePaymentQR(validOptions, {
                width: 400,
            });

            expect(result.format).toBe('png');
            expect(result.data).toMatch(/^data:image\/png;base64,/);
        });

        it('色オプションのみ指定できる', async () => {
            const result = await generatePaymentQR(validOptions, {
                color: {
                    dark: '#333333',
                },
            });

            expect(result.format).toBe('png');
            expect(result.data).toMatch(/^data:image\/png;base64,/);
        });

        it('エラー訂正レベルのみ指定できる', async () => {
            const result = await generatePaymentQR(validOptions, {
                errorCorrectionLevel: 'Q',
            });

            expect(result.format).toBe('png');
            expect(result.data).toMatch(/^data:image\/png;base64,/);
        });
    });
});
