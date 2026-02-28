# jpyc-payment-qr
![NPM Version](https://img.shields.io/npm/v/jpyc-payment-qr)
![NPM Downloads](https://img.shields.io/npm/dy/jpyc-payment-qr)
![GitHub License](https://img.shields.io/github/license/oageo/jpyc-payment-qr)

EIP-681に基づいたJPYC（Japanese Yen Coin）の支払い用URI及びQRコードを生成するTypeScriptライブラリ

> [!TIP]
> [JPYC支払いQRコード（EIP-681）生成ツール](https://jpyc-qr.osumiakari.jp)で、大まかな動作を確認することが可能となっています。合わせてご活用ください。

## インストール

```bash
# npm
npm install jpyc-payment-qr

# pnpm
pnpm add jpyc-payment-qr

# yarn
yarn add jpyc-payment-qr
```

## 基本的な使い方

### URI生成

```typescript
import { generatePaymentURI } from 'jpyc-payment-qr';

// 基本的なURI生成
const result = generatePaymentURI({
    merchantAddress: '0x1234567890123456789012345678901234567890',
    amount: 1000, // 1000 JPY
});

console.log(result.uri);
// => ethereum:0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29@137/transfer?address=0x1234567890123456789012345678901234567890&uint256=1000000000000000000000

console.log(result.network); // => 'polygon' (デフォルト)
console.log(result.chainId); // => 137
console.log(result.amountJPY); // => '1000'
console.log(result.amountWei); // => '1000000000000000000000'
```

### ネットワークの指定

```typescript
import { generatePaymentURI } from 'jpyc-payment-qr';

// Ethereumメインネットを使用
const result = generatePaymentURI({
    merchantAddress: '0x1234567890123456789012345678901234567890',
    amount: 500,
    network: 'ethereum',
});

console.log(result.chainId); // => 1
```

**サポートされているネットワーク:**
- `ethereum` - Ethereum Mainnet (Chain ID: 1)
- `polygon` - Polygon (Chain ID: 137) **[デフォルト]**
- `avalanche` - Avalanche C-Chain (Chain ID: 43114)

### 小数を含む金額

```typescript
import { generatePaymentURI } from 'jpyc-payment-qr';

// 小数を含む金額（文字列で指定すると精度が保たれる）
const result = generatePaymentURI({
    merchantAddress: '0x1234567890123456789012345678901234567890',
    amount: '123.456789',
});

console.log(result.amountJPY); // => '123.456789'
```

### バリデーションと警告

```typescript
import { generatePaymentURI } from 'jpyc-payment-qr';

// 高額な支払いには警告が付く
const result = generatePaymentURI({
    merchantAddress: '0x1234567890123456789012345678901234567890',
    amount: 10000000, // 1000万JPY
});

if (result.warnings.length > 0) {
    result.warnings.forEach((warning) => {
        console.log(`警告 [${warning.code}]: ${warning.message}`);
    });
    // => 警告 [LARGE_AMOUNT]: 金額が100万JPYCを超えています: 10000000。意図した金額か確認してください
}
```

## 高度な使い方

### カスタムコントラクトアドレス

```typescript
import { generatePaymentURI } from 'jpyc-payment-qr';

// テストネットや独自トークン用
const result = generatePaymentURI({
    merchantAddress: '0x1234567890123456789012345678901234567890',
    amount: 100,
    jpycContractAddress: '0xYourCustomTokenAddress',
    decimals: 6, // カスタムトークンのdecimals
});
```

### URIのデコード

```typescript
import { decodeEIP681 } from 'jpyc-payment-qr';

const uri = 'ethereum:0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29@137/transfer?address=0x1234567890123456789012345678901234567890&uint256=1000000000000000000000';

const decoded = decodeEIP681(uri);

console.log(decoded.scheme); // => 'ethereum'
console.log(decoded.contractAddress); // => '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29'
console.log(decoded.chainId); // => 137
console.log(decoded.functionName); // => 'transfer'
console.log(decoded.recipientAddress); // => '0x1234567890123456789012345678901234567890'
console.log(decoded.amount); // => '1000000000000000000000'
```

### JPY ⇔ Wei 変換

```typescript
import { jpyToWei, weiToJpy } from 'jpyc-payment-qr';

// JPY → Wei
const wei = jpyToWei(100);
console.log(wei); // => '100000000000000000000'

// 小数を含む金額
const wei2 = jpyToWei('123.456');
console.log(wei2); // => '123456000000000000000'

// Wei → JPY
const jpy = weiToJpy('100000000000000000000');
console.log(jpy); // => '100'
```

### EIP-55チェックサムアドレス

```typescript
import { toChecksumAddress, isValidChecksumAddress } from 'jpyc-payment-qr';

// チェックサムアドレスに変換
const checksummed = toChecksumAddress('0xe7c3d8c9a439fede00d2600032d5db0be71c3c29');
console.log(checksummed); // => '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29'

// チェックサムの検証
const isValid = isValidChecksumAddress('0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29');
console.log(isValid); // => true
```

### バリデーション

```typescript
import { validateGenerateOptions, isValidAddress, isValidAmount } from 'jpyc-payment-qr';

// オプション全体のバリデーション
const validation = validateGenerateOptions({
    merchantAddress: '0x1234567890123456789012345678901234567890',
    amount: 100,
});

if (!validation.valid) {
    console.error('エラー:', validation.errors);
}

// 個別のバリデーション
console.log(isValidAddress('0x1234567890123456789012345678901234567890')); // => true
console.log(isValidAmount(100)); // => true
console.log(isValidAmount(-1)); // => false
```

## QRコード生成

### 基本的なQRコード生成

```typescript
import { generatePaymentQR } from 'jpyc-payment-qr';

// PNG Data URL形式（デフォルト）
const qr = await generatePaymentQR({
    merchantAddress: '0x1234567890123456789012345678901234567890',
    amount: 1000,
});

console.log(qr.format); // => 'png'
console.log(qr.data); // => 'data:image/png;base64,...'
console.log(qr.uri); // => 'ethereum:0x...'
```

### 複数のフォーマットに対応

```typescript
import { generatePaymentQRWithFormat } from 'jpyc-payment-qr';

// SVG形式
const svgQR = await generatePaymentQRWithFormat(
    {
        merchantAddress: '0x1234567890123456789012345678901234567890',
        amount: 500,
    },
    'svg'
);

console.log(svgQR.data); // => '<svg>...</svg>'

// ターミナル表示用
const terminalQR = await generatePaymentQRWithFormat(
    {
        merchantAddress: '0x1234567890123456789012345678901234567890',
        amount: 500,
    },
    'terminal'
);

console.log(terminalQR.data); // ターミナルで表示可能なQRコード
```

**サポートされているフォーマット:**
- `png` - PNG Data URL形式（ブラウザの`<img>`タグで直接利用可能）
- `svg` - SVG文字列形式
- `utf8` - UTF-8テキスト形式（ASCII art）
- `terminal` - ターミナル表示用

### カスタムQRコードオプション

```typescript
import { generatePaymentQR } from 'jpyc-payment-qr';

const qr = await generatePaymentQR(
    {
        merchantAddress: '0x1234567890123456789012345678901234567890',
        amount: 1000,
    },
    {
        width: 500, // QRコードの幅（ピクセル）
        margin: 2, // マージンサイズ
        errorCorrectionLevel: 'H', // エラー訂正レベル: 'L' | 'M' | 'Q' | 'H'
        color: {
            dark: '#0066cc', // QRコードの色
            light: '#ffffff', // 背景色
        },
    }
);
```

### バッファ形式（ファイル保存用）

```typescript
import { generatePaymentQRBuffer } from 'jpyc-payment-qr';
import fs from 'fs/promises';

// Uint8Array形式で取得
const buffer = await generatePaymentQRBuffer({
    merchantAddress: '0x1234567890123456789012345678901234567890',
    amount: 1000,
});

// ファイルに保存
await fs.writeFile('payment-qr.png', buffer);
```

### 既存URIからQRコード生成

```typescript
import { generateQRFromURI } from 'jpyc-payment-qr';

const uri = 'ethereum:0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29@137/transfer?address=0x1234567890123456789012345678901234567890&uint256=1000000000000000000000';

const qr = await generateQRFromURI(uri, 'png');

console.log(qr.data); // Data URL
```

## API リファレンス

### `generatePaymentURI(options)`

JPYC支払い用のEIP-681 URIを生成します。

**パラメータ:**
- `options.merchantAddress` (string, 必須) - 加盟店の受取アドレス
- `options.amount` (number | string, 必須) - 支払金額（JPY）
- `options.network` (string, オプション) - ネットワーク（デフォルト: 'polygon'）
- `options.jpycContractAddress` (string, オプション) - カスタムJPYCコントラクトアドレス
- `options.decimals` (number, オプション) - トークンのdecimals（デフォルト: 18）

**戻り値:** `PaymentURIResult`
```typescript
{
    uri: string;              // EIP-681フォーマットのURI
    chainId: number;          // チェーンID
    network: SupportedNetwork; // ネットワーク
    jpycContractAddress: string; // JPYCコントラクトアドレス
    amountWei: string;        // Wei単位の金額
    amountJPY: string;        // JPY単位の金額
    decimals: number;         // 使用されたdecimals
    warnings: Warning[];      // 警告（ある場合）
}
```

### `generatePaymentQR(options, qrOptions?)`

JPYC支払い用のQRコードを生成します（PNG Data URL形式）。

**パラメータ:**
- `options` (PaymentURIOptions, 必須) - 支払いURIオプション
- `qrOptions` (QRCodeOptions, オプション) - QRコード生成オプション

**戻り値:** `Promise<QRCodeResult>`
```typescript
{
    data: string;           // QRコードデータ（Data URLまたは文字列）
    format: QROutputFormat; // 出力フォーマット
    uri: string;            // 元となるEIP-681 URI
}
```

### `generatePaymentQRWithFormat(options, format?, qrOptions?)`

JPYC支払い用のQRコードを指定フォーマットで生成します。

**パラメータ:**
- `options` (PaymentURIOptions, 必須) - 支払いURIオプション
- `format` (QROutputFormat, オプション) - 出力フォーマット（デフォルト: 'png'）
- `qrOptions` (QRCodeOptions, オプション) - QRコード生成オプション

**戻り値:** `Promise<QRCodeResult>`

### `generatePaymentQRBuffer(options, qrOptions?)`

JPYC支払い用のQRコードをUint8Array形式で生成します（PNG）。

**パラメータ:**
- `options` (PaymentURIOptions, 必須) - 支払いURIオプション
- `qrOptions` (QRCodeOptions, オプション) - QRコード生成オプション

**戻り値:** `Promise<Uint8Array>`

### `generateQRFromURI(uri, format?, qrOptions?)`

既存のURIからQRコードを生成します。

**パラメータ:**
- `uri` (string, 必須) - EIP-681フォーマットのURI
- `format` (QROutputFormat, オプション) - 出力フォーマット（デフォルト: 'png'）
- `qrOptions` (QRCodeOptions, オプション) - QRコード生成オプション

**戻り値:** `Promise<QRCodeResult>`

### その他のエクスポート

- `jpyToWei(amount, decimals?)` - JPYをWeiに変換
- `weiToJpy(weiAmount, decimals?)` - WeiをJPYに変換
- `encodeEIP681(contract, recipient, amount, chainId)` - EIP-681 URIをエンコード
- `decodeEIP681(uri)` - EIP-681 URIをデコード
- `toChecksumAddress(address)` - EIP-55チェックサムアドレスに変換
- `isValidChecksumAddress(address)` - チェックサムアドレスの検証
- `isValidAddressFormat(address)` - アドレス形式の検証
- `validateGenerateOptions(options)` - オプションのバリデーション
- `isValidAddress(address)` - アドレスの検証
- `isValidAmount(amount)` - 金額の検証

定数:
- `JPYC_DECIMALS` - JPYCのdecimals (18)
- `DEFAULT_NETWORK` - デフォルトネットワーク ('polygon')
- `CHAIN_CONFIGS` - チェーン設定
- `MAX_SAFE_AMOUNT` - 安全な最大金額

## エラーハンドリング

```typescript
import { generatePaymentURI, JPYCPaymentError } from 'jpyc-payment-qr';

try {
    const result = generatePaymentURI({
        merchantAddress: 'invalid-address',
        amount: 100,
    });
} catch (error) {
    if (error instanceof JPYCPaymentError) {
        console.error(`エラーコード: ${error.code}`);
        console.error(`メッセージ: ${error.message}`);
        console.error(`詳細:`, error.details);
    }
}
```

**エラーコード:**
- `INVALID_ADDRESS` - 無効なアドレス形式
- `INVALID_AMOUNT` - 無効な金額
- `INVALID_NETWORK` - サポートされていないネットワーク
- `INVALID_DECIMALS` - 無効なdecimals
- `VALIDATION_FAILED` - バリデーション失敗
- `ENCODING_FAILED` - エンコード失敗
- `CHECKSUM_FAILED` - チェックサム処理失敗
- `QR_GENERATION_FAILED` - QRコード生成失敗

## 開発

```bash
# 依存関係のインストール
pnpm install

# ビルド
pnpm run build

# テスト
pnpm run test

# テスト（ウォッチモード）
pnpm run test:watch

# カバレッジ
pnpm run test:coverage

# リント
pnpm run lint

# リント修正
pnpm run lint:fix

# フォーマット
pnpm run format

# 型チェック
pnpm run typecheck
```

## ライセンス

MIT License

詳細は [LICENSE](LICENSE) ファイルを参照してください。

## リンク

* [JPYC公式サイト](https://jpyc.co.jp/)


## 作者
oageo（Osumi Akari）

* Website: https://www.osumiakari.jp/about/
    * Gift: https://www.osumiakari.jp/gift/
    * ETH(POL): 0x32C769A4788aF9F592f45B25B28Cb7E1df0AbF6D
* Fediverse: [@oageo@c.osumiakari.jp](https://c.osumiakari.jp/@oageo)
* Bluesky: [@osumiakari.jp](https://bsky.app/profile/osumiakari.jp)