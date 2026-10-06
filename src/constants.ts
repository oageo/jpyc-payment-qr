import type { ChainConfig, SupportedNetwork } from './types.js';

/**
 * JPYCトークンのdecimals（標準ERC20）
 */
export const JPYC_DECIMALS = 18;

/**
 * JPYC支払いのデフォルトネットワーク
 */
export const DEFAULT_NETWORK: SupportedNetwork = 'polygon';

/**
 * チェーン設定を末端のオブジェクトまで凍結する
 */
function deepFreeze(
    configs: Record<SupportedNetwork, ChainConfig>
): Readonly<Record<SupportedNetwork, Readonly<ChainConfig>>> {
    for (const config of Object.values(configs)) {
        Object.freeze(config);
    }
    return Object.freeze(configs);
}

/**
 * 各ネットワークのチェーン設定
 * 参照元: https://github.com/jcam1/JPYCpay
 * 実行時に書き換えられて別のコントラクトアドレスのURIが生成されないよう、末端まで凍結する
 */
export const CHAIN_CONFIGS: Readonly<Record<SupportedNetwork, Readonly<ChainConfig>>> = deepFreeze({
    ethereum: {
        chainId: 1,
        name: 'Ethereum Mainnet',
        jpycAddress: '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29',
        explorerUrl: 'https://etherscan.io',
    },
    polygon: {
        chainId: 137,
        name: 'Polygon',
        jpycAddress: '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29',
        explorerUrl: 'https://polygonscan.com',
    },
    avalanche: {
        chainId: 43114,
        name: 'Avalanche C-Chain',
        jpycAddress: '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29',
        explorerUrl: 'https://snowtrace.io',
    },
    kaia: {
        chainId: 8217,
        name: 'Kaia Mainnet',
        jpycAddress: '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29',
        explorerUrl: 'https://kaiascan.io',
    },
});

/**
 * EIP-681スキームプレフィックス
 */
export const EIP681_SCHEME = 'ethereum';

/**
 * ERC20 transfer関数シグネチャ
 */
export const TRANSFER_FUNCTION = 'transfer';

/**
 * アドレス検証用正規表現（0x + 40文字の16進数）
 */
export const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * 金額文字列の検証用正規表現（非負の10進数。例: "100", "0.5", ".5", "5."）
 * 科学的記数法や数字以外の文字を含む形式は不可
 */
export const AMOUNT_FORMAT_REGEX = /^(\d+(\.\d*)?|\.\d+)$/;

/**
 * 安全な最大金額（JPY単位、オーバーフロー防止）
 * BigIntを使用しているため、実質的に制限はないが、数値の妥当性チェック用
 */
export const MAX_SAFE_AMOUNT = 1e15; // 1,000兆JPY
