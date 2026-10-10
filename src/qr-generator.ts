import QRCode from 'qrcode';
import { isZeroAddress } from './checksum.js';
import { CHAIN_CONFIGS } from './constants.js';
import { decodeEIP681Internal, encodeEIP681 } from './encoder.js';
import { JPYCPaymentError, displayValue, previewValue } from './errors.js';
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
 * QRコードの幅の上限（ピクセル）。巨大な画像の生成でメモリとCPUを使い切るのを防ぐ
 */
const MAX_QR_WIDTH = 4096;

/**
 * QRコードのマージンの上限（モジュール数）
 */
const MAX_QR_MARGIN = 100;

/**
 * QRコードのサイズ指定（widthやmargin）を検証する
 * 文字列やNumberオブジェクトはqrcode内部で数値に変換され上限を迂回できるため、数値型のみ受け付ける
 * @returns 検証済みの値（未指定の場合はデフォルト値）
 * @throws {JPYCPaymentError} 数値型でない、または範囲外の場合（QR_GENERATION_FAILED）
 */
function checkQRSize(
    name: 'width' | 'margin',
    value: unknown,
    min: number,
    max: number,
    defaultValue: number
): number {
    if (value === undefined) {
        return defaultValue;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        throw new JPYCPaymentError(
            `QRコードの${name}は${min}以上${max}以下の整数で指定してください: ${previewValue(value)}`,
            'QR_GENERATION_FAILED',
            { [name]: previewValue(value) }
        );
    }
    return value;
}

/**
 * QRコードオプションをデフォルト値とマージ
 * @throws {JPYCPaymentError} widthやmarginが数値型でない、または範囲外の場合（QR_GENERATION_FAILED）
 */
function mergeQROptions(qrOptions?: QRCodeOptions) {
    return {
        errorCorrectionLevel:
            qrOptions?.errorCorrectionLevel ?? DEFAULT_QR_OPTIONS.errorCorrectionLevel,
        width: checkQRSize('width', qrOptions?.width, 1, MAX_QR_WIDTH, DEFAULT_QR_OPTIONS.width),
        margin: checkQRSize(
            'margin',
            qrOptions?.margin,
            0,
            MAX_QR_MARGIN,
            DEFAULT_QR_OPTIONS.margin
        ),
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
                `サポートされていない出力フォーマットです: ${displayValue(format)}`,
                'QR_GENERATION_FAILED',
                { format: previewValue(format) }
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
 *
 * Node.js専用。ブラウザでは qrcode ライブラリのブラウザ版にバッファ出力がないため QR_GENERATION_FAILED になる
 * （ブラウザでは generatePaymentQR の PNG Data URL を使う）
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
 *
 * URIは decodeEIP681 と同じ基準で検証し、正規化したURI（アドレスはチェックサム形式、
 * 金額は10進整数、'pay-' や大文字のスキームは除去・小文字化）をQRコードにする。
 * 受け付けない形式（transfer 以外の関数、value パラメータ付きなど）はQRコードを生成せずエラーにする
 * @param uri - EIP-681フォーマットのURI
 * @param format - 出力フォーマット
 * @param qrOptions - QRコード生成オプション
 * @returns QRコード生成結果（uri は正規化後のURI）
 * @throws {JPYCPaymentError} URIが不正な場合（ENCODING_FAILED。details.kind で原因を判別できる）、
 * QRコードの生成に失敗した場合（QR_GENERATION_FAILED）
 */
export async function generateQRFromURI(
    uri: string,
    format: QROutputFormat = 'png',
    qrOptions?: QRCodeOptions
): Promise<QRCodeResult> {
    try {
        // QRコードの中身が検証済みの支払い内容と一致するよう、正規化したURIを使う。
        // 受取アドレスの安全性は下で検査し INVALID_ADDRESS を投げる（decodeEIP681 の UNSAFE_RECIPIENT ではなく）ため、
        // decodeEIP681 の受取アドレス検査は行わない
        const decoded = decodeEIP681Internal(uri, { checkRecipient: false });

        // generatePaymentURIと同じく、ゼロアドレスのコントラクトや、送金した資金を取り戻せなくなる受取アドレスは拒否する
        if (isZeroAddress(decoded.contractAddress)) {
            throw new JPYCPaymentError(
                'ゼロアドレス（0x000…0）がコントラクトアドレスになっているURIはQRコードにできません',
                'INVALID_ADDRESS',
                { contractAddress: decoded.contractAddress }
            );
        }
        if (isZeroAddress(decoded.recipientAddress)) {
            throw new JPYCPaymentError(
                'ゼロアドレス（0x000…0）が受取アドレスになっているURIはQRコードにできません（送金した資金を取り戻せなくなります）',
                'INVALID_ADDRESS',
                { recipientAddress: decoded.recipientAddress }
            );
        }
        // decodeEIP681 の戻り値はチェックサム形式に正規化済みのため、文字列比較でよい
        const tokenContracts = [
            decoded.contractAddress,
            ...Object.values(CHAIN_CONFIGS).map((config) => config.jpycAddress),
        ];
        if (tokenContracts.includes(decoded.recipientAddress)) {
            throw new JPYCPaymentError(
                `トークンのコントラクトアドレスが受取アドレスになっているURIはQRコードにできません。受取アドレスとコントラクトアドレスを取り違えていないか確認してください（送金した資金を取り戻せなくなります）: ${decoded.recipientAddress}`,
                'INVALID_ADDRESS',
                { recipientAddress: decoded.recipientAddress }
            );
        }

        const normalizedUri = encodeEIP681(
            decoded.contractAddress,
            decoded.recipientAddress,
            decoded.amount,
            decoded.chainId
        );
        const data = await renderQRData(normalizedUri, format, qrOptions);

        return { data, format, uri: normalizedUri };
    } catch (error) {
        throw toQRGenerationError(error, 'QRコードの生成に失敗しました');
    }
}
