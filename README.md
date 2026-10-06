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
- `kaia` - Kaia Mainnet (Chain ID: 8217)

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

- 小数部がトークンのdecimals（JPYCは18桁）を超える金額は、切り捨てずにエラーになります（例: `'0.0000000000000000001'`）
- 数値（number）で渡す場合、有効数字が15桁を超える値は計算誤差を含む可能性があるためエラーになります（例: `0.1 + 0.2` は `0.30000000000000004` になる）。計算結果をそのまま渡さず、文字列で指定してください
- `1e-7` のような指数表記の数値は、通常の10進数（`'0.0000001'`）として扱います。文字列は半角数字と小数点のみ使えます（カンマ・通貨単位・全角数字・符号・指数表記・前後の空白は不可）
- 金額は0より大きく、`MAX_SAFE_AMOUNT`（1,000兆JPY）以下である必要があります。文字列は100文字までです
- `amountJPY` は、文字列で渡した場合はそのまま、数値で渡した場合は10進数表記（例: `1e-7` → `'0.0000001'`）で返します

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

**警告コード:**

| `code` | 条件 |
| --- | --- |
| `SMALL_AMOUNT` | 金額が1 JPYC未満 |
| `LARGE_AMOUNT` | 金額が100万JPYCを超える |
| `CUSTOM_CONTRACT` | `jpycContractAddress` を指定した |
| `CUSTOM_DECIMALS` | `decimals` に18以外を指定した |
| `CUSTOM_CHAIN_ID` | `chainId` を指定した |

警告があってもURIは生成されます。意図した内容か確認してから利用してください。

## 高度な使い方

### カスタムコントラクトアドレス（テストネット・独自チェーン）

`network` で選べるのはメインネットのみです。テストネットや独自チェーンで使う場合は、`jpycContractAddress` と `chainId` を併用してください。

```typescript
import { generatePaymentURI } from 'jpyc-payment-qr';

// テストネット用（例: Kaia Kairos testnet の chainId は 1001、Polygon Amoy は 80002）
const result = generatePaymentURI({
    merchantAddress: '0x1234567890123456789012345678901234567890',
    amount: 100,
    // ↓ 利用するテストネットのJPYCコントラクトアドレスに置き換えてください（0x で始まる42文字）
    jpycContractAddress: '0x0000000000000000000000000000000000000001',
    chainId: 1001,
    decimals: 18, // トークンのdecimals（省略時は18）
});

console.log(result.uri); // => 'ethereum:0x...@1001/transfer?address=...&uint256=...'
console.log(result.network); // => 'custom'
console.log(result.chainId); // => 1001
// result.warnings には CUSTOM_CONTRACT と CUSTOM_CHAIN_ID の警告が入る
```

- `chainId` は `jpycContractAddress` と併用する場合のみ指定できます（単独で指定するとエラー）
- `chainId` と `network` は同時に指定できません
- `chainId` は1以上 `Number.MAX_SAFE_INTEGER`（9007199254740991）以下の整数（数値型）である必要があります
- これらの誤りは `INVALID_NETWORK`（`issues[].field` は `'chainId'`）になります
- `decimals` も `jpycContractAddress` と併用する場合のみ指定できます（JPYCのdecimalsは18で固定のため）
- `chainId` を指定しない場合、`jpycContractAddress` を指定しても `network`（デフォルト: polygon）のチェーンIDが使われます
- チェーンIDとコントラクトアドレスの組み合わせは検証できないため、正しいか必ず確認してください

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

`decodeEIP681` は、このライブラリが生成する形式のERC20 `transfer` URIだけを受け付け、それ以外はエラー（`ENCODING_FAILED`、メッセージに理由が入る）になります。

- スキームは `ethereum:` のみ（大文字小文字は区別しない）。`pay-` プレフィックスは取り除く
- コントラクトアドレスと受取アドレスは `0x` + 40桁の16進数のみ（ENS名は非対応）。大文字小文字が混在する場合はチェックサムを検証し、戻り値はチェックサム形式になる
- `@chain_id` は必須（先頭ゼロ不可）
- 関数名は `transfer` のみ。クエリは `address` と `uint256` のみで、どちらも必須・重複不可（`value` や `gas` などは拒否）
- `uint256` は1以上の整数。`1e18` のような表記は10進整数（`'1000000000000000000'`）に正規化する
- 空白・制御文字・`#`・全角文字などのASCII以外の文字を含むURI、`?` が2つ以上あるURI、2048文字を超えるURIは拒否する
- パーセントエンコード（`%26` など）には対応していない（デコードせずに拒否する）

失敗の原因は `details.kind` で判別できます（`EIP681DecodeErrorDetails` 型）。

```typescript
import { decodeEIP681, JPYCPaymentError, type EIP681DecodeErrorDetails } from 'jpyc-payment-qr';

try {
    decodeEIP681('ethereum:0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29@137/approve?address=0x1234567890123456789012345678901234567890&uint256=1');
} catch (error) {
    if (error instanceof JPYCPaymentError && error.code === 'ENCODING_FAILED') {
        const details = error.details as EIP681DecodeErrorDetails;
        console.log(details.kind, details.name); // => 'UNSUPPORTED_FUNCTION' 'approve'
    }
}
```

| `kind` | 原因 |
| --- | --- |
| `INVALID_URI` | 文字列でない、長すぎる、空白・制御文字・`#`・全角文字などのASCII以外の文字を含む、`?` が2つ以上あるなど区切り文字の構造が不正 |
| `UNSUPPORTED_SCHEME` | スキームが `ethereum` 以外 |
| `MISSING_PARAM` | `chain_id`・`address`・`uint256` がない（`name` に名前） |
| `INVALID_ADDRESS` | コントラクト（`name: 'target'`）または受取アドレス（`name: 'address'`）の形式が不正 |
| `CHECKSUM_MISMATCH` | 大文字小文字が混在するアドレスで、EIP-55チェックサムが一致しない |
| `INVALID_CHAIN_ID` | チェーンIDが空・0・先頭ゼロ・数字以外・安全な整数の範囲外 |
| `UNSUPPORTED_FUNCTION` | 関数が `transfer` 以外（関数がない場合は `name: ''`） |
| `UNSUPPORTED_PARAM` | `address`・`uint256` 以外のクエリパラメータ（`value` など。パラメータ名は小文字のみ） |
| `DUPLICATE_PARAM` | クエリパラメータが重複している |
| `INVALID_AMOUNT` | 金額が空・形式不正（先頭ゼロ・符号・パーセントエンコードを含む）・整数でない・0・uint256の範囲外 |

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

`generatePaymentURI` などに渡す `merchantAddress` / `jpycContractAddress` は、大文字小文字が混在している場合はEIP-55チェックサム付きとみなして検証します。チェックサムが一致しない場合（打ち間違いなど）はエラー（`VALIDATION_FAILED`）になります。全て小文字・全て大文字のアドレスはチェックサムを持たないため、形式のみ検証します（打ち間違いを検出できないため、チェックサム形式のアドレスを使うことを推奨します）。生成されるURIと戻り値の `jpycContractAddress` はチェックサム形式になります。

また、送金した資金を取り戻せなくなる受取アドレスはエラー（`INVALID_ADDRESS`）になります。

- ゼロアドレス（`0x0000000000000000000000000000000000000000`）
- トークンのコントラクトアドレス（JPYCのコントラクトアドレスや、指定した `jpycContractAddress`）。受取アドレスとコントラクトアドレスの取り違えを防ぎます

`jpycContractAddress` にゼロアドレスを指定した場合もエラー（`INVALID_ADDRESS`）になります。

```typescript
import { generatePaymentURI } from 'jpyc-payment-qr';

// 正しくは ...71C3c29 のところを ...71C3c28 と打ち間違えた例
generatePaymentURI({
    merchantAddress: '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c28',
    amount: 100,
});
// => JPYCPaymentError: バリデーションに失敗しました（1件）: merchantAddress: アドレスのチェックサムが一致しません。打ち間違いがないか確認してください: 0xE7C3...
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
// 大文字小文字が混在していてチェックサムが一致しないアドレスはfalse（形式のみ見る場合は isValidAddressFormat）
console.log(isValidAddress('0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c28')); // => false
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
        width: 500, // QRコードの幅（ピクセル。デフォルト: 300、最大: 4096）
        margin: 2, // マージンサイズ（デフォルト: 4、最大: 100）
        errorCorrectionLevel: 'H', // エラー訂正レベル: 'L' | 'M' | 'Q' | 'H'（デフォルト: 'M'）
        color: {
            dark: '#0066cc', // QRコードの色（デフォルト: '#000000'）
            light: '#ffffff', // 背景色（デフォルト: '#ffffff'）
        },
    }
);
```

`width`（1〜4096）と `margin`（0〜100）は整数（数値型）で指定してください。範囲外や整数以外（文字列・小数など）の場合は、巨大な画像の生成でメモリを使い切らないよう `QR_GENERATION_FAILED` になります。

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
console.log(qr.uri); // QRコードにしたURI（正規化後）
```

渡したURIは `decodeEIP681` と同じ基準で検証し、受け付けない形式（`transfer` 以外の関数、`value` パラメータ付き、チェックサム不一致など）はQRコードを生成せずにエラー（`ENCODING_FAILED`）にします。受取アドレスがゼロアドレスやトークンのコントラクトアドレスのURIも、`generatePaymentURI` と同様にエラー（`INVALID_ADDRESS`）にします。QRコードには正規化したURI（アドレスはチェックサム形式、金額は10進整数）を入れ、`qr.uri` で返します。

## API リファレンス

### `generatePaymentURI(options)`

JPYC支払い用のEIP-681 URIを生成します。

**パラメータ:**
- `options.merchantAddress` (string, 必須) - 加盟店の受取アドレス（ゼロアドレスやトークンのコントラクトアドレスは不可）
- `options.amount` (number | string, 必須) - 支払金額（JPY。0より大きく `MAX_SAFE_AMOUNT` 以下）
- `options.network` (SupportedNetwork, オプション) - ネットワーク（`'ethereum'` / `'polygon'` / `'avalanche'` / `'kaia'`。デフォルト: `'polygon'`）
- `options.jpycContractAddress` (string, オプション) - カスタムJPYCコントラクトアドレス
- `options.chainId` (number, オプション) - カスタムチェーンID（テストネット・独自チェーン用。`jpycContractAddress` と併用時のみ指定可、`network` とは同時指定不可。1以上 `Number.MAX_SAFE_INTEGER` 以下の整数）
- `options.decimals` (number, オプション) - トークンのdecimals（0〜18の整数、デフォルト: 18。`jpycContractAddress` と併用時のみ指定可。18以外は `CUSTOM_DECIMALS` 警告）

オプションは自身のプロパティだけを読み取り、検証とURI生成には同じ値を使います（getterで読むたびに値が変わる場合も、最初に読んだ値で検証・生成します）。

**戻り値:** `PaymentURIResult`
```typescript
{
    uri: string;              // EIP-681フォーマットのURI
    chainId: number;          // チェーンID
    network: SupportedNetwork | 'custom'; // ネットワーク（chainId指定時は 'custom'）
    jpycContractAddress: string; // JPYCコントラクトアドレス（チェックサム形式）
    amountWei: string;        // Wei単位の金額
    amountJPY: string;        // JPY単位の金額（文字列で渡した場合はそのまま、数値の場合は10進数表記）
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

既存のURIからQRコードを生成します。URIは `decodeEIP681` と同じ基準で検証し、正規化したURIをQRコードにします（戻り値の `uri` も正規化後のURI）。

**パラメータ:**
- `uri` (string, 必須) - EIP-681フォーマットのURI（不正な場合は `ENCODING_FAILED`）
- `format` (QROutputFormat, オプション) - 出力フォーマット（デフォルト: 'png'）
- `qrOptions` (QRCodeOptions, オプション) - QRコード生成オプション

**戻り値:** `Promise<QRCodeResult>`

### その他のエクスポート

- `jpyToWei(amount, decimals?)` - JPYをWeiに変換（decimals桁を超える端数はエラー。0や上限超えの金額は検証しないため、支払い金額の検証には `isValidAmount` を使う）
- `weiToJpy(weiAmount, decimals?)` - WeiをJPYに変換（weiAmountは非負の10進整数の文字列で78桁まで）
- `normalizeAmount(amount)` - 金額を正規化した10進数文字列に変換（例: `'.50'` → `'0.5'`、`1e-7` → `'0.0000001'`）
- `parseAmountToWei(amount, decimals)` - 金額をWei単位のbigintに変換
- `encodeEIP681(contract, recipient, amount, chainId)` - EIP-681 URIをエンコード（amountはWei単位の10進整数の文字列（先頭ゼロなし）で1以上 2^256-1 以下、chainIdは1以上 `Number.MAX_SAFE_INTEGER` 以下の整数。失敗時の `details` は `{ field, value }`（`EIP681EncodeErrorDetails`））
- `decodeEIP681(uri)` - EIP-681 URIをデコード（受け付ける形式は「URIのデコード」を参照）
- `toChecksumAddress(address)` - EIP-55チェックサムアドレスに変換
- `normalizeAddress(address)` - アドレスを検証してチェックサム形式に変換（大文字小文字混在時はチェックサムも検証）
- `isZeroAddress(address)` - ゼロアドレス（`0x000…0`）かどうか
- `isValidChecksumAddress(address)` - チェックサムアドレスの検証
- `isValidAddressFormat(address)` - アドレス形式の検証
- `validateGenerateOptions(options)` - オプションのバリデーション
- `isValidAddress(address)` - アドレスの検証（大文字小文字混在時はチェックサムも検証）
- `isValidAmount(amount, options?)` - 金額の検証（`validateGenerateOptions` と同じ判定。decimalsは `{ decimals: 6 }` のように指定。配列に使う場合は `amounts.every((amount) => isValidAmount(amount))`）

定数:
- `JPYC_DECIMALS` - JPYCのdecimals (18)
- `DEFAULT_NETWORK` - デフォルトネットワーク ('polygon')
- `CHAIN_CONFIGS` - チェーン設定（各ネットワークのチェーンID・JPYCコントラクトアドレスなど。凍結されており書き換え不可）
- `MAX_SAFE_AMOUNT` - 金額の上限（1e15 = 1,000兆JPY。超えると `INVALID_AMOUNT`）
- `EIP681_SCHEME` - URIのスキーム ('ethereum')
- `TRANSFER_FUNCTION` - URIの関数名 ('transfer')
- `ADDRESS_REGEX` - アドレス形式の正規表現（0x + 16進数40桁）

型:
- オプション・戻り値: `PaymentURIOptions`, `PaymentURIResult`, `SupportedNetwork`, `ChainConfig`, `QRCodeOptions`, `QROutputFormat`, `QRCodeResult`, `DecodedEIP681`, `IsValidAmountOptions`
- 検証・エラー: `ValidationResult`, `ValidationIssue`, `Warning`, `JPYCPaymentErrorCode`, `EIP681DecodeErrorKind`, `EIP681DecodeErrorDetails`, `EIP681EncodeField`, `EIP681EncodeErrorDetails`

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

エラーの `message` は開発者向けの説明です（原因・直し方・入力値を含み、入力値は100文字で切り詰め、改行などの見えない文字は `\n` のように表示します）。画面に表示する文言は、`code` や `details`（下記）から組み立てることを推奨します。

**エラーコード:**
- `INVALID_ADDRESS` - 無効なアドレス（形式不正、ゼロアドレスやトークンのコントラクトアドレスを受取アドレスに指定した）
- `INVALID_AMOUNT` - 無効な金額
- `INVALID_NETWORK` - サポートされていないネットワーク、または不正な `chainId`（`jpycContractAddress` なしで指定、`network` と同時に指定、範囲外）
- `INVALID_DECIMALS` - 無効なdecimals
- `VALIDATION_FAILED` - オプションのバリデーション失敗（`generatePaymentURI` と QRコード生成。原因は `details.issues`）
- `ENCODING_FAILED` - EIP-681 URIのデコード失敗（`decodeEIP681` と `generateQRFromURI`。原因は `details.kind`）
- `CHECKSUM_FAILED` - チェックサム不一致（大文字小文字が混在するアドレスで、EIP-55チェックサムが一致しない）
- `QR_GENERATION_FAILED` - QRコード生成失敗

### バリデーションエラーの詳細

`generatePaymentURI` などが投げる `VALIDATION_FAILED` の `details.issues`（`validateGenerateOptions` の戻り値では `issues`）には、どの項目がどのエラーコードで不正かが入ります。

```typescript
import { generatePaymentURI, JPYCPaymentError, type ValidationIssue } from 'jpyc-payment-qr';

try {
    generatePaymentURI({
        merchantAddress: '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c28', // 打ち間違い
        amount: '0.0000000000000000001', // 18桁を超える端数
    });
} catch (error) {
    if (error instanceof JPYCPaymentError && error.code === 'VALIDATION_FAILED') {
        const { issues } = error.details as { issues: ValidationIssue[] };
        console.log(issues);
        // => [
        //   { field: 'merchantAddress', code: 'CHECKSUM_FAILED', message: '...' },
        //   { field: 'amount', code: 'INVALID_AMOUNT', message: '...' },
        // ]
    }
}
```

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