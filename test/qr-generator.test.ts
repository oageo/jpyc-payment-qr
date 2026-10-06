import { describe, expect, it } from 'vitest';
import { JPYCPaymentError } from '../src/errors.js';
import {
    generatePaymentQR,
    generatePaymentQRBuffer,
    generatePaymentQRWithFormat,
    generateQRFromURI,
} from '../src/qr-generator.js';
import type { PaymentURIOptions, QROutputFormat } from '../src/types.js';

const CONTRACT = '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29';
const RECIPIENT = '0x1234567890123456789012345678901234567890';
const PNG_DATA_URL = /^data:image\/png;base64,/;

/** 非同期関数が投げたJPYCPaymentErrorを取り出す */
async function catchErrorAsync(fn: () => Promise<unknown>): Promise<JPYCPaymentError> {
    try {
        await fn();
    } catch (error) {
        expect(error).toBeInstanceOf(JPYCPaymentError);
        return error as JPYCPaymentError;
    }
    throw new Error('例外が投げられませんでした');
}

describe('QR Generator', () => {
    const validOptions: PaymentURIOptions = {
        merchantAddress: RECIPIENT,
        amount: 100,
        network: 'polygon',
    };

    describe('generatePaymentQR', () => {
        it('デフォルトでPNG Data URLを生成できる', async () => {
            const result = await generatePaymentQR(validOptions);

            expect(result.format).toBe('png');
            expect(result.data).toMatch(PNG_DATA_URL);
            expect(result.uri).toBe(
                `ethereum:${CONTRACT}@137/transfer?address=${RECIPIENT}&uint256=100000000000000000000`
            );
        });

        it('すべてのQRオプションを指定して生成できる', async () => {
            const result = await generatePaymentQR(validOptions, {
                width: 500,
                margin: 2,
                errorCorrectionLevel: 'H',
                color: { dark: '#FF0000', light: '#00FF00' },
            });

            expect(result.format).toBe('png');
            expect(result.data).toMatch(PNG_DATA_URL);
        });

        it('無効なオプションでエラーを投げる', async () => {
            const error = await catchErrorAsync(() =>
                generatePaymentQR({ merchantAddress: 'invalid', amount: 100 })
            );
            expect(error.code).toBe('VALIDATION_FAILED');
        });
    });

    describe('generatePaymentQRWithFormat', () => {
        it.each([
            ['png', (data: string) => expect(data).toMatch(PNG_DATA_URL)],
            [
                'svg',
                (data: string) => {
                    expect(data).toContain('<svg');
                    expect(data).toContain('</svg>');
                },
            ],
            ['utf8', (data: string) => expect(data).not.toBe('')],
            ['terminal', (data: string) => expect(data).not.toBe('')],
        ] as const)('%s形式で生成できる', async (format, check) => {
            const result = await generatePaymentQRWithFormat(validOptions, format);

            expect(result.format).toBe(format);
            expect(typeof result.data).toBe('string');
            check(result.data);
        });

        it('部分的なQRオプションはデフォルト値とマージする', async () => {
            const result = await generatePaymentQRWithFormat(validOptions, 'svg', {
                width: 400,
                color: { dark: '#333333' },
            });

            expect(result.data).toContain('width="400"');
            expect(result.data).toContain('stroke="#333333"');
            // light はデフォルトの白
            expect(result.data).toContain('fill="#ffffff"');
        });

        it('サポートされていないフォーマットでエラーを投げる（フォーマット名は見える表記で表示）', async () => {
            const error = await catchErrorAsync(() =>
                generatePaymentQRWithFormat(validOptions, 'svg\n[OK]' as QROutputFormat)
            );
            expect(error.code).toBe('QR_GENERATION_FAILED');
            expect(error.message).toContain('svg\\n[OK]');
            expect(error.details).toEqual({ format: 'svg\\n[OK]' });
        });

        it('QRコードライブラリのエラーは QR_GENERATION_FAILED に変換する', async () => {
            const error = await catchErrorAsync(() =>
                generatePaymentQRWithFormat(validOptions, 'png', { color: { dark: 'not-a-color' } })
            );
            expect(error.code).toBe('QR_GENERATION_FAILED');
        });
    });

    describe('QRオプションの上限', () => {
        it('widthは4096、marginは100まで指定できる', async () => {
            const result = await generatePaymentQRWithFormat(validOptions, 'svg', {
                width: 4096,
                margin: 100,
            });
            expect(result.data).toContain('width="4096"');
        });

        it.each([
            ['width', { width: 4097 }],
            ['margin', { margin: 101 }],
            // 文字列やNumberオブジェクトはqrcode内部で数値に変換されるため、上限の迂回に使えないこと
            ['width', { width: '100000' }],
            ['width', { width: new Number(100000) }],
            ['margin', { margin: '1e3' }],
            ['width', { width: Number.NaN }],
            ['width', { width: 0 }],
            ['margin', { margin: -1 }],
            ['margin', { margin: 0.5 }],
        ])(
            '%s が数値型でない・範囲外なら QR_GENERATION_FAILED を投げる（%o）',
            async (name, qrOptions) => {
                for (const generate of [
                    () => generatePaymentQR(validOptions, qrOptions),
                    () => generatePaymentQRBuffer(validOptions, qrOptions),
                    () =>
                        generateQRFromURI(
                            `ethereum:${CONTRACT}@137/transfer?address=${RECIPIENT}&uint256=1`,
                            'png',
                            qrOptions
                        ),
                ]) {
                    const error = await catchErrorAsync(generate as () => Promise<unknown>);
                    expect(error.code).toBe('QR_GENERATION_FAILED');
                    expect(error.message).toContain(name);
                }
            }
        );
    });

    describe('generatePaymentQRBuffer', () => {
        it('PNGのUint8Arrayを生成できる', async () => {
            const buffer = await generatePaymentQRBuffer(validOptions, {
                width: 200,
                errorCorrectionLevel: 'L',
            });

            expect(buffer).toBeInstanceOf(Uint8Array);
            // PNG署名を確認
            expect(Array.from(buffer.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
        });

        it('無効なオプションでエラーを投げる', async () => {
            const error = await catchErrorAsync(() =>
                generatePaymentQRBuffer({ merchantAddress: 'invalid', amount: 100 })
            );
            expect(error.code).toBe('VALIDATION_FAILED');
        });
    });

    describe('generateQRFromURI', () => {
        const validURI = `ethereum:${CONTRACT}@137/transfer?address=${RECIPIENT}&uint256=1000000000000000000000`;

        it('URIからQRコードを生成できる', async () => {
            const result = await generateQRFromURI(validURI, 'svg', { margin: 1 });

            expect(result.format).toBe('svg');
            expect(result.data).toContain('<svg');
            expect(result.uri).toBe(validURI);
        });

        it('フォーマットのデフォルトはPNG', async () => {
            const result = await generateQRFromURI(validURI);
            expect(result.format).toBe('png');
            expect(result.data).toMatch(PNG_DATA_URL);
        });

        it('正規化したURI（チェックサム形式・10進整数・pay-と大文字スキームの除去）をQRコードにする', async () => {
            const result = await generateQRFromURI(
                `ETHEREUM:pay-${CONTRACT.toLowerCase()}@137/transfer?uint256=1e21&address=${RECIPIENT}`,
                'svg'
            );
            expect(result.uri).toBe(validURI);
        });

        it.each([
            ['decodeEIP681で受け付けないURI', `${validURI}&value=1`, 'UNSUPPORTED_PARAM'],
            [
                'transfer以外の関数',
                `ethereum:${CONTRACT}@137/approve?address=${RECIPIENT}&uint256=1`,
                'UNSUPPORTED_FUNCTION',
            ],
            [
                'チェーンIDのないURI',
                `ethereum:${CONTRACT}/transfer?address=${RECIPIENT}&uint256=1`,
                'MISSING_PARAM',
            ],
            ['文字列以外', 123, 'INVALID_URI'],
        ])('%s はQRコードを生成せず ENCODING_FAILED を投げる', async (_label, uri, kind) => {
            const error = await catchErrorAsync(() => generateQRFromURI(uri as string, 'svg'));
            expect(error.code).toBe('ENCODING_FAILED');
            expect(error.details).toMatchObject({ kind });
        });

        it.each([
            ['受取アドレスがゼロアドレス', CONTRACT, `0x${'0'.repeat(40)}`],
            ['受取アドレスがトークンのコントラクトアドレス', CONTRACT, CONTRACT],
            ['コントラクトアドレスがゼロアドレス', `0x${'0'.repeat(40)}`, RECIPIENT],
        ])('%sのURIはQRコードにせず INVALID_ADDRESS を投げる', async (_label, contract, to) => {
            const error = await catchErrorAsync(() =>
                generateQRFromURI(
                    `ethereum:${contract}@137/transfer?address=${to}&uint256=1`,
                    'svg'
                )
            );
            expect(error.code).toBe('INVALID_ADDRESS');
        });
    });
});
