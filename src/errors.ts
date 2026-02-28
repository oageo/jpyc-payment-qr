/**
 * JPYC支払いエラーのエラーコード
 */
export type JPYCPaymentErrorCode =
    | 'INVALID_ADDRESS'
    | 'INVALID_AMOUNT'
    | 'INVALID_NETWORK'
    | 'INVALID_DECIMALS'
    | 'VALIDATION_FAILED'
    | 'ENCODING_FAILED'
    | 'QR_GENERATION_FAILED'
    | 'CHECKSUM_FAILED';

/**
 * JPYC支払い操作用のカスタムエラークラス
 */
export class JPYCPaymentError extends Error {
    public readonly code: JPYCPaymentErrorCode;
    public readonly details?: unknown;

    constructor(message: string, code: JPYCPaymentErrorCode, details?: unknown) {
        super(message);
        this.name = 'JPYCPaymentError';
        this.code = code;
        this.details = details;

        // エラーが投げられた場所のスタックトレースを維持（V8でのみ利用可能）
        if ('captureStackTrace' in Error) {
            (
                Error as {
                    captureStackTrace?: (target: object, ctor: typeof JPYCPaymentError) => void;
                }
            ).captureStackTrace?.(this, JPYCPaymentError);
        }
    }

    /**
     * エラーをJSONオブジェクトに変換
     */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            details: this.details,
        };
    }
}
