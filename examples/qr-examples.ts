/**
 * QRコード生成の使用例
 */

import {
    generatePaymentQR,
    generatePaymentQRWithFormat,
    generatePaymentQRBuffer,
    generateQRFromURI,
} from 'jpyc-payment-qr';

// 基本的なQRコード生成（PNG Data URL）
async function basicQRGeneration() {
    const result = await generatePaymentQR({
        merchantAddress: '0x1234567890123456789012345678901234567890',
        amount: 1000,
    });

    console.log('QRコード生成完了');
    console.log('フォーマット:', result.format);
    console.log('Data URL:', result.data.substring(0, 50) + '...');
    console.log('URI:', result.uri);

    // ブラウザの場合、imgタグのsrcに設定可能
    // <img src={result.data} alt="Payment QR Code" />
}

// SVG形式でQRコードを生成
async function svgQRGeneration() {
    const result = await generatePaymentQRWithFormat(
        {
            merchantAddress: '0x1234567890123456789012345678901234567890',
            amount: 500,
            network: 'ethereum',
        },
        'svg'
    );

    console.log('SVG QRコード:', result.data);

    // ブラウザの場合、divにinnerHTMLとして設定可能
    // document.getElementById('qr-container').innerHTML = result.data;
}

// ターミナル表示用QRコード
async function terminalQRGeneration() {
    const result = await generatePaymentQRWithFormat(
        {
            merchantAddress: '0x1234567890123456789012345678901234567890',
            amount: 100,
        },
        'terminal'
    );

    console.log('ターミナル用QRコード:');
    console.log(result.data);
}

// カスタムオプションでQRコードを生成
async function customQROptions() {
    const result = await generatePaymentQR(
        {
            merchantAddress: '0x1234567890123456789012345678901234567890',
            amount: 1500,
        },
        {
            width: 500, // 幅を500pxに
            margin: 2, // マージンを2に
            errorCorrectionLevel: 'H', // エラー訂正レベルを最高に
            color: {
                dark: '#0066cc', // 青色のQRコード
                light: '#ffffff', // 白背景
            },
        }
    );

    console.log('カスタムQRコード生成完了:', result.format);
}

// バッファ形式でQRコードを生成（ファイル保存用）
async function bufferQRGeneration() {
    const buffer = await generatePaymentQRBuffer({
        merchantAddress: '0x1234567890123456789012345678901234567890',
        amount: 2000,
    });

    console.log('バッファサイズ:', buffer.length, 'bytes');

    // Node.jsの場合、ファイルに保存可能
    // import fs from 'fs/promises';
    // await fs.writeFile('payment-qr.png', buffer);
}

// 既存のURIからQRコードを生成
async function qrFromExistingURI() {
    const uri =
        'ethereum:0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29@137/transfer' +
        '?address=0x1234567890123456789012345678901234567890&uint256=1000000000000000000000';

    const result = await generateQRFromURI(uri, 'png');

    console.log('既存URIからQRコード生成:', result.format);
}

// エラーハンドリング
async function errorHandling() {
    try {
        await generatePaymentQR({
            merchantAddress: 'invalid-address', // 無効なアドレス
            amount: 100,
        });
    } catch (error) {
        if (error instanceof Error) {
            console.error('エラー:', error.message);
        }
    }
}

// 小数を含む金額
async function decimalAmount() {
    const result = await generatePaymentQR({
        merchantAddress: '0x1234567890123456789012345678901234567890',
        amount: '123.456789', // 精度を保つため文字列で指定
    });

    console.log('小数金額のQRコード生成完了');
    console.log('URI:', result.uri);
}

// 異なるネットワーク
async function differentNetworks() {
    const networks = ['ethereum', 'polygon', 'avalanche'] as const;

    for (const network of networks) {
        const result = await generatePaymentQR({
            merchantAddress: '0x1234567890123456789012345678901234567890',
            amount: 100,
            network,
        });

        console.log(`${network}のQRコード生成完了`);
    }
}

// 実行例
async function main() {
    console.log('=== 基本的なQRコード生成 ===');
    await basicQRGeneration();

    console.log('\n=== SVG形式 ===');
    await svgQRGeneration();

    console.log('\n=== ターミナル表示 ===');
    await terminalQRGeneration();

    console.log('\n=== カスタムオプション ===');
    await customQROptions();

    console.log('\n=== バッファ形式 ===');
    await bufferQRGeneration();

    console.log('\n=== 既存URIから生成 ===');
    await qrFromExistingURI();

    console.log('\n=== エラーハンドリング ===');
    await errorHandling();

    console.log('\n=== 小数金額 ===');
    await decimalAmount();

    console.log('\n=== 異なるネットワーク ===');
    await differentNetworks();
}

// main().catch(console.error);
