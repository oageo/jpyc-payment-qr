import QRCode from 'qrcode';
import { JPYCPaymentError } from './errors.js';
import type { PaymentURIOptions, QRCodeOptions, QRCodeResult, QROutputFormat } from './types.js';
import { generatePaymentURI } from './uri-generator.js';

/**
 * QRコード生成のデフォルトオプション
 */
const DEFAULT_QR_OPTIONS = {
    errorCorrectionLevel: 'M' as const,
    width: 300,
    margin: 4,
    color: {
        dark: '#000000',
        light: '#ffffff',
    },
};

/**
 * JPYC支払い用のQRコードを生成（PNG Data URL形式）
 * @param options - 支払いURIオプション
 * @param qrOptions - QRコード生成オプション
 * @returns QRコード生成結果（PNG Data URL）
 */
export async function generatePaymentQR(
    options: PaymentURIOptions,
    qrOptions?: QRCodeOptions
): Promise<QRCodeResult> {
    return generatePaymentQRWithFormat(options, 'png', qrOptions);
}

/**
 * JPYC支払い用のQRコードを指定フォーマットで生成
 * @param options - 支払いURIオプション
 * @param format - 出力フォーマット
 * @param qrOptions - QRコード生成オプション
 * @returns QRコード生成結果
 */
export async function generatePaymentQRWithFormat(
    options: PaymentURIOptions,
    format: QROutputFormat = 'png',
    qrOptions?: QRCodeOptions
): Promise<QRCodeResult> {
    try {
        // URIを生成
        const uriResult = generatePaymentURI(options);

        // QRコードオプションをマージ
        const mergedOptions = {
            errorCorrectionLevel:
                qrOptions?.errorCorrectionLevel ?? DEFAULT_QR_OPTIONS.errorCorrectionLevel,
            width: qrOptions?.width ?? DEFAULT_QR_OPTIONS.width,
            margin: qrOptions?.margin ?? DEFAULT_QR_OPTIONS.margin,
            color: {
                dark: qrOptions?.color?.dark ?? DEFAULT_QR_OPTIONS.color.dark,
                light: qrOptions?.color?.light ?? DEFAULT_QR_OPTIONS.color.light,
            },
        };

        let data: string;

        switch (format) {
            case 'png': {
                // PNG Data URL形式
                data = await QRCode.toDataURL(uriResult.uri, mergedOptions);
                break;
            }

            case 'svg': {
                // SVG文字列形式
                data = await QRCode.toString(uriResult.uri, {
                    ...mergedOptions,
                    type: 'svg',
                });
                break;
            }

            case 'utf8': {
                // UTF-8テキスト形式（ASCII art）
                data = await QRCode.toString(uriResult.uri, {
                    ...mergedOptions,
                    type: 'utf8',
                });
                break;
            }

            case 'terminal': {
                // ターミナル表示用
                data = await QRCode.toString(uriResult.uri, {
                    ...mergedOptions,
                    type: 'terminal',
                });
                break;
            }

            default: {
                throw new JPYCPaymentError(
                    `サポートされていない出力フォーマットです: ${format}`,
                    'QR_GENERATION_FAILED',
                    { format }
                );
            }
        }

        return {
            data,
            format,
            uri: uriResult.uri,
        };
    } catch (error) {
        if (error instanceof JPYCPaymentError) {
            throw error;
        }
        throw new JPYCPaymentError('QRコードの生成に失敗しました', 'QR_GENERATION_FAILED', {
            error,
        });
    }
}

/**
 * JPYC支払い用のQRコードをUint8Array形式で生成（PNG）
 * @param options - 支払いURIオプション
 * @param qrOptions - QRコード生成オプション
 * @returns QRコード生成結果（Uint8Array）
 */
export async function generatePaymentQRBuffer(
    options: PaymentURIOptions,
    qrOptions?: QRCodeOptions
): Promise<Uint8Array> {
    try {
        // URIを生成
        const uriResult = generatePaymentURI(options);

        // QRコードオプションをマージ
        const mergedOptions = {
            errorCorrectionLevel:
                qrOptions?.errorCorrectionLevel ?? DEFAULT_QR_OPTIONS.errorCorrectionLevel,
            width: qrOptions?.width ?? DEFAULT_QR_OPTIONS.width,
            margin: qrOptions?.margin ?? DEFAULT_QR_OPTIONS.margin,
            color: {
                dark: qrOptions?.color?.dark ?? DEFAULT_QR_OPTIONS.color.dark,
                light: qrOptions?.color?.light ?? DEFAULT_QR_OPTIONS.color.light,
            },
        };

        // Buffer形式で生成
        const buffer = await QRCode.toBuffer(uriResult.uri, {
            ...mergedOptions,
            type: 'png',
        });

        // BufferをUint8Arrayに変換
        return new Uint8Array(buffer);
    } catch (error) {
        if (error instanceof JPYCPaymentError) {
            throw error;
        }
        throw new JPYCPaymentError(
            'QRコード（バッファ形式）の生成に失敗しました',
            'QR_GENERATION_FAILED',
            { error }
        );
    }
}

/**
 * URIからQRコードを生成
 * @param uri - EIP-681フォーマットのURI
 * @param format - 出力フォーマット
 * @param qrOptions - QRコード生成オプション
 * @returns QRコード生成結果
 */
export async function generateQRFromURI(
    uri: string,
    format: QROutputFormat = 'png',
    qrOptions?: QRCodeOptions
): Promise<QRCodeResult> {
    try {
        // QRコードオプションをマージ
        const mergedOptions = {
            errorCorrectionLevel:
                qrOptions?.errorCorrectionLevel ?? DEFAULT_QR_OPTIONS.errorCorrectionLevel,
            width: qrOptions?.width ?? DEFAULT_QR_OPTIONS.width,
            margin: qrOptions?.margin ?? DEFAULT_QR_OPTIONS.margin,
            color: {
                dark: qrOptions?.color?.dark ?? DEFAULT_QR_OPTIONS.color.dark,
                light: qrOptions?.color?.light ?? DEFAULT_QR_OPTIONS.color.light,
            },
        };

        let data: string;

        switch (format) {
            case 'png': {
                data = await QRCode.toDataURL(uri, mergedOptions);
                break;
            }

            case 'svg': {
                data = await QRCode.toString(uri, {
                    ...mergedOptions,
                    type: 'svg',
                });
                break;
            }

            case 'utf8': {
                data = await QRCode.toString(uri, {
                    ...mergedOptions,
                    type: 'utf8',
                });
                break;
            }

            case 'terminal': {
                data = await QRCode.toString(uri, {
                    ...mergedOptions,
                    type: 'terminal',
                });
                break;
            }

            default: {
                throw new JPYCPaymentError(
                    `サポートされていない出力フォーマットです: ${format}`,
                    'QR_GENERATION_FAILED',
                    { format }
                );
            }
        }

        return {
            data,
            format,
            uri,
        };
    } catch (error) {
        if (error instanceof JPYCPaymentError) {
            throw error;
        }
        throw new JPYCPaymentError('QRコードの生成に失敗しました', 'QR_GENERATION_FAILED', {
            error,
        });
    }
}
