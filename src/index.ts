/**
 * JPYC Payment QR
 * EIP-681に基づいたJPYCの支払い用URI及びQRコードを生成するライブラリ
 */

// 型定義のエクスポート
export type {
    SupportedNetwork,
    ChainConfig,
    PaymentURIOptions,
    PaymentURIResult,
    ValidationResult,
    Warning,
    QRCodeOptions,
    QROutputFormat,
    QRCodeResult,
} from './types.js';

// エラークラスのエクスポート
export { JPYCPaymentError } from './errors.js';
export type { JPYCPaymentErrorCode } from './errors.js';

// 定数のエクスポート
export {
    JPYC_DECIMALS,
    DEFAULT_NETWORK,
    CHAIN_CONFIGS,
    EIP681_SCHEME,
    TRANSFER_FUNCTION,
    ADDRESS_REGEX,
    MAX_SAFE_AMOUNT,
} from './constants.js';

// チェックサム関数のエクスポート
export {
    toChecksumAddress,
    isValidChecksumAddress,
    isValidAddressFormat,
} from './checksum.js';

// バリデーション関数のエクスポート
export { validateGenerateOptions, isValidAddress, isValidAmount } from './validator.js';

// エンコーダー関数のエクスポート
export { jpyToWei, weiToJpy, encodeEIP681, decodeEIP681 } from './encoder.js';
export type { DecodedEIP681 } from './encoder.js';

// URI生成関数のエクスポート
export { generatePaymentURI } from './uri-generator.js';
