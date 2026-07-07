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
 * QRコードオプションをデフォルト値とマージ
 */
function mergeQROptions(qrOptions?: QRCodeOptions) {
    return {
        errorCorrectionLevel:
            qrOptions?.errorCorrectionLevel ?? DEFAULT_QR_OPTIONS.errorCorrectionLevel,
        width: qrOptions?.width ?? DEFAULT_QR_OPTIONS.width,
        margin: qrOptions?.margin ?? DEFAULT_QR_OPTIONS.margin,
        color: {
            dark: qrOptions?.color?.dark ?? DEFAULT_QR_OPTIONS.color.dark,
            light: qrOptions?.color?.light ?? DEFAULT_QR_OPTIONS.color.light,
        },
    };
}

/**
 * URIから指定フォーマットのQRコードデータを生成
 * @throws {JPYCPaymentError} サポートされていないフォーマットの場合
 */
async function renderQRData(
    uri: string,
    format: QROutputFormat,
    qrOptions?: QRCodeOptions
): Promise<string> {
    const mergedOptions = mergeQROptions(qrOptions);

    switch (format) {
        case 'png':
            // PNG Data URL形式
            return QRCode.toDataURL(uri, mergedOptions);

        case 'svg':
        case 'utf8':
        case 'terminal':
            // 文字列形式（SVG、ASCII art、ターミナル表示用）
            return QRCode.toString(uri, { ...mergedOptions, type: format });

        default:
            throw new JPYCPaymentError(
                `サポートされていない出力フォーマットです: ${format}`,
                'QR_GENERATION_FAILED',
                { format }
            );
    }
}

/**
 * QR生成中のエラーをJPYCPaymentErrorに変換
 */
function toQRGenerationError(error: unknown, message: string): JPYCPaymentError {
    if (error instanceof JPYCPaymentError) {
        return error;
    }
    return new JPYCPaymentError(message, 'QR_GENERATION_FAILED', { error });
}

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
        const { uri } = generatePaymentURI(options);
        const data = await renderQRData(uri, format, qrOptions);

        return { data, format, uri };
    } catch (error) {
        throw toQRGenerationError(error, 'QRコードの生成に失敗しました');
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
        const { uri } = generatePaymentURI(options);

        // Buffer形式で生成し、Uint8Arrayに変換
        const buffer = await QRCode.toBuffer(uri, {
            ...mergeQROptions(qrOptions),
            type: 'png',
        });

        return new Uint8Array(buffer);
    } catch (error) {
        throw toQRGenerationError(error, 'QRコード（バッファ形式）の生成に失敗しました');
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
        const data = await renderQRData(uri, format, qrOptions);

        return { data, format, uri };
    } catch (error) {
        throw toQRGenerationError(error, 'QRコードの生成に失敗しました');
    }
}
