/**
 * JPYCがサポートするブロックチェーンネットワーク
 */
export type SupportedNetwork = 'ethereum' | 'polygon' | 'avalanche';

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
    /** カスタムJPYCコントラクトアドレス（テストや将来バージョン用、オプション） */
    jpycContractAddress?: string;
    /**
     * トークンのdecimals（jpycContractAddressと併用時のみ有効）
     * @default 18
     * @example 18
     * @throws {JPYCPaymentError} mainnetでjpycContractAddressなしで指定された場合
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
    /** 使用されたネットワーク */
    network: SupportedNetwork;
    /** 使用されたJPYCコントラクトアドレス */
    jpycContractAddress: string;
    /** Wei単位の金額（最小単位） */
    amountWei: string;
    /** JPY単位の元の金額 */
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
    /** 警告メッセージ（ブロッキングしない） */
    warnings: Warning[];
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
    /** QRコードの幅（ピクセル、デフォルト: 300） */
    width?: number;
    /** マージンサイズ（デフォルト: 4） */
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
