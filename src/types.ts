import type { JPYCPaymentErrorCode } from './errors.js';

/**
 * JPYCがサポートするブロックチェーンネットワーク
 */
export type SupportedNetwork = 'ethereum' | 'polygon' | 'avalanche' | 'kaia';

/**
 * 各ネットワークのチェーン設定
 */
export interface ChainConfig {
    /** チェーンID (EIP-155) */
    chainId: number;
    /** ネットワーク名 */
    name: string;
    /** JPYCトークンコントラクトアドレス */
    jpycAddress: string;
    /** ブロックエクスプローラーURL */
    explorerUrl: string;
}

/**
 * 支払いURI生成のオプション
 */
export interface PaymentURIOptions {
    /** 加盟店の受取アドレス */
    merchantAddress: string;
    /** 支払金額（JPY）- 精度が必要な場合は文字列も可 */
    amount: number | string;
    /** 対象ブロックチェーンネットワーク（デフォルト: polygon） */
    network?: SupportedNetwork;
    /**
     * カスタムJPYCコントラクトアドレス（テストネットや将来バージョン用、オプション）
     * テストネットで使う場合は chainId も合わせて指定する
     */
    jpycContractAddress?: string;
    /**
     * カスタムチェーンID（テストネットや独自チェーン用、オプション）
     * jpycContractAddressと併用時のみ指定可。networkとの同時指定は不可
     * @example 80002 // Polygon Amoy
     * @throws {JPYCPaymentError} jpycContractAddressなしで指定された場合、networkと同時に指定された場合、
     * 1以上 Number.MAX_SAFE_INTEGER 以下の整数でない場合（INVALID_NETWORK）
     */
    chainId?: number;
    /**
     * トークンのdecimals（0〜18の整数。jpycContractAddressと併用時のみ指定可）
     * @default 18
     * @example 6
     * @throws {JPYCPaymentError} jpycContractAddressなしで指定された場合、0〜18の整数でない場合（INVALID_DECIMALS）
     */
    decimals?: number;
}

/**
 * URI生成の結果
 */
export interface PaymentURIResult {
    /** EIP-681フォーマットのURI */
    uri: string;
    /** 使用されたチェーンID */
    chainId: number;
    /** 使用されたネットワーク（オプションでchainIdを指定した場合は 'custom'） */
    network: SupportedNetwork | 'custom';
    /** 使用されたJPYCコントラクトアドレス（EIP-55チェックサム形式） */
    jpycContractAddress: string;
    /** Wei単位の金額（最小単位） */
    amountWei: string;
    /** JPY単位の金額（文字列で渡した場合はそのまま、数値で渡した場合は10進数表記） */
    amountJPY: string;
    /** 使用されたトークンのdecimals */
    decimals: number;
    /** バリデーション警告（ある場合） */
    warnings: Warning[];
}

/**
 * バリデーション結果
 */
export interface ValidationResult {
    /** バリデーションが成功したか */
    valid: boolean;
    /** エラーメッセージ（ある場合） */
    errors: string[];
    /** エラーの詳細（errorsと同じ順序で、項目とエラーコードを持つ） */
    issues: ValidationIssue[];
    /** 警告メッセージ（ブロッキングしない） */
    warnings: Warning[];
}

/**
 * バリデーションエラーの詳細（どの項目がどの理由で不正か）
 */
export interface ValidationIssue {
    /** 不正な項目（options自体が不正な場合は 'options'） */
    field: keyof PaymentURIOptions | 'options';
    /** エラーコード（例: 'CHECKSUM_FAILED', 'INVALID_AMOUNT'） */
    code: JPYCPaymentErrorCode;
    /** エラーメッセージ */
    message: string;
}

/**
 * 警告情報
 */
export interface Warning {
    /** 警告コード */
    code: string;
    /** 警告メッセージ */
    message: string;
}

/**
 * QRコード生成オプション
 */
export interface QRCodeOptions {
    /** 誤り訂正レベル（デフォルト: 'M'） */
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    /** QRコードの幅（ピクセル、1〜4096の整数、デフォルト: 300） */
    width?: number;
    /** マージンサイズ（0〜100の整数、デフォルト: 4） */
    margin?: number;
    /** 色設定（デフォルト: dark='#000000', light='#ffffff'） */
    color?: {
        dark?: string;
        light?: string;
    };
}

/**
 * QRコード出力フォーマット
 */
export type QROutputFormat = 'png' | 'svg' | 'utf8' | 'terminal';

/**
 * QRコード生成結果
 */
export interface QRCodeResult {
    /** データURL、SVG文字列、またはUTF8文字列 */
    data: string;
    /** 使用された出力フォーマット */
    format: QROutputFormat;
    /** 元のURI */
    uri: string;
}
