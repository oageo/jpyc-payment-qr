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
 * 各ネットワークのチェーン設定
 * 参照元: https://github.com/jcam1/JPYCpay
 */
export const CHAIN_CONFIGS: Record<SupportedNetwork, ChainConfig> = {
    ethereum: {
        chainId: 1,
        name: 'Ethereum Mainnet',
        jpycAddress: '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
        explorerUrl: 'https://etherscan.io',
    },
    polygon: {
        chainId: 137,
        name: 'Polygon',
        jpycAddress: '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
        explorerUrl: 'https://polygonscan.com',
    },
    avalanche: {
        chainId: 43114,
        name: 'Avalanche C-Chain',
        jpycAddress: '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
        explorerUrl: 'https://snowtrace.io',
    },
};

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
 * 安全な最大金額（JPY単位、オーバーフロー防止）
 * BigIntを使用しているため、実質的に制限はないが、数値の妥当性チェック用
 */
export const MAX_SAFE_AMOUNT = 1e15; // 1,000兆JPY
