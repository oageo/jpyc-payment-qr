import { describe, expect, it } from 'vitest';
import {
    isValidAddressFormat,
    isValidChecksumAddress,
    isZeroAddress,
    normalizeAddress,
    toChecksumAddress,
} from '../src/checksum.js';
import { CHAIN_CONFIGS } from '../src/constants.js';
import { JPYCPaymentError } from '../src/errors.js';

const CHECKSUMMED = '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29';
// 末尾の9を8に打ち間違えたアドレス（大文字小文字混在のためチェックサム検証の対象）
const MISTYPED = '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c28';

/**
 * 関数が投げたJPYCPaymentErrorを取得する
 */
function catchError(fn: () => unknown): JPYCPaymentError {
    try {
        fn();
    } catch (error) {
        if (error instanceof JPYCPaymentError) {
            return error;
        }
        throw error;
    }
    throw new Error('エラーが投げられませんでした');
}

describe('Checksum', () => {
    describe('toChecksumAddress', () => {
        it('小文字・大文字・混在のアドレスをチェックサムアドレスに変換できる', () => {
            for (const address of [
                '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29',
                '0xE7C3D8C9A439FEDE00D2600032D5DB0BE71C3C29',
                '0xE7c3D8c9A439FedE00d2600032D5db0bE71C3c29',
            ]) {
                expect(toChecksumAddress(address)).toBe(CHECKSUMMED);
            }
        });

        it('形式が無効な場合はINVALID_ADDRESSを投げる', () => {
            for (const address of [
                'e7c3d8c9a439fede00d2600032d5db0be71c3c29',
                '0x123',
                '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
            ]) {
                expect(catchError(() => toChecksumAddress(address)).code).toBe('INVALID_ADDRESS');
            }
        });
    });

    describe('isValidChecksumAddress', () => {
        it('正しいチェックサムアドレスのみtrueを返す', () => {
            expect(isValidChecksumAddress(CHECKSUMMED)).toBe(true);
            expect(isValidChecksumAddress(CHECKSUMMED.toLowerCase())).toBe(false);
            expect(isValidChecksumAddress('0x123')).toBe(false);
            expect(isValidChecksumAddress('not-an-address')).toBe(false);
        });

        it('CHAIN_CONFIGSの各ネットワークのjpycAddressがEIP-55チェックサム形式である', () => {
            for (const config of Object.values(CHAIN_CONFIGS)) {
                expect(isValidChecksumAddress(config.jpycAddress)).toBe(true);
            }
        });

        it('CHAIN_CONFIGSは実行時に書き換えられない（別のコントラクトのURIが生成されるのを防ぐ）', () => {
            expect(Object.isFrozen(CHAIN_CONFIGS)).toBe(true);
            for (const config of Object.values(CHAIN_CONFIGS)) {
                expect(Object.isFrozen(config)).toBe(true);
            }
        });
    });

    describe('isValidAddressFormat', () => {
        it('0x + 40桁の16進数のみtrueを返す（チェックサムは検証しない）', () => {
            expect(isValidAddressFormat('0xe7c3d8c9a439fede00d2600032d5db0be71c3c29')).toBe(true);
            expect(isValidAddressFormat('0xE7C3D8C9A439FEDE00D2600032D5DB0BE71C3C29')).toBe(true);
            expect(isValidAddressFormat(MISTYPED)).toBe(true);
            expect(isValidAddressFormat('0x123')).toBe(false);
            expect(isValidAddressFormat('e7c3d8c9a439fede00d2600032d5db0be71c3c29')).toBe(false);
            expect(isValidAddressFormat('0xGGGG')).toBe(false);
        });

        it.each([Symbol('x'), null, undefined, 123, Object.create(null)])(
            '文字列以外（%s）は例外を投げずにfalseを返す',
            (value) => {
                expect(isValidAddressFormat(value as unknown as string)).toBe(false);
            }
        );
    });

    describe('normalizeAddress', () => {
        it('正しいチェックサム・全て小文字・全て大文字のアドレスをチェックサム形式で返す', () => {
            expect(normalizeAddress(CHECKSUMMED)).toBe(CHECKSUMMED);
            expect(normalizeAddress(CHECKSUMMED.toLowerCase())).toBe(CHECKSUMMED);
            expect(normalizeAddress(`0x${CHECKSUMMED.slice(2).toUpperCase()}`)).toBe(CHECKSUMMED);
        });

        it('全て小文字・全て大文字なら打ち間違いでも形式が正しければ通る（EIP-55の規定どおり）', () => {
            expect(normalizeAddress(MISTYPED.toLowerCase())).toBe(toChecksumAddress(MISTYPED));
        });

        it('大文字小文字混在でチェックサムが一致しない場合はCHECKSUM_FAILEDを投げる', () => {
            const error = catchError(() => normalizeAddress(MISTYPED));
            expect(error.code).toBe('CHECKSUM_FAILED');
            expect(error.message).toContain('チェックサムが一致しません');
            expect(error.message).toContain(MISTYPED);

            // 先頭の'E'を'e'に変えて、大文字小文字だけを1文字崩した場合も検出する
            const broken = `0xe${CHECKSUMMED.slice(3)}`;
            expect(catchError(() => normalizeAddress(broken)).code).toBe('CHECKSUM_FAILED');
        });

        it.each([
            [
                '前後の空白',
                ` ${CHECKSUMMED}`,
                `前後に空白や改行が含まれています。取り除いてください: " ${CHECKSUMMED}"`,
            ],
            [
                '末尾の改行',
                `${CHECKSUMMED}\n`,
                `前後に空白や改行が含まれています。取り除いてください: "${CHECKSUMMED}\\n"`,
            ],
            [
                '0X',
                `0X${CHECKSUMMED.slice(2)}`,
                `0x（小文字の x）で始まる必要があります: 0X${CHECKSUMMED.slice(2)}`,
            ],
            [
                'ENS名',
                'shop.eth',
                'ENS名（例: shop.eth）には対応していません。0x で始まる16進アドレスを指定してください: shop.eth',
            ],
            [
                '全角文字',
                `0ｘ${CHECKSUMMED.slice(2)}`,
                "全角文字などの使えない文字が含まれています（2文字目: 'ｘ'）",
            ],
            ['ゼロ幅文字', `${CHECKSUMMED}\u200B`, "（43文字目: '\\u200B'）"],
            [
                '0xなし',
                CHECKSUMMED.slice(2),
                `0x で始まる必要があります（先頭の 0x が抜けています）: ${CHECKSUMMED.slice(2)}`,
            ],
            [
                '長さ不足',
                CHECKSUMMED.slice(0, 41),
                `42文字（0x + 16進数40文字）である必要があります（入力は41文字）: ${CHECKSUMMED.slice(0, 41)}`,
            ],
            [
                '16進数以外',
                `0x${'1'.repeat(10)}G${'1'.repeat(29)}`,
                "16進数（0-9、a-f、A-F）以外の文字が含まれています（13文字目: 'G'）",
            ],
            [
                '空文字',
                '',
                'アドレスが空です。0x で始まる42文字のアドレスを指定してください: （空）',
            ],
            ['数値', 123, 'アドレスは文字列で指定してください（numberが渡されました）: 123'],
            ['undefined', undefined, '（undefinedが渡されました）'],
        ])(
            '形式が無効な場合（%s）は原因と値を示してINVALID_ADDRESSを投げる',
            (_label, address, hint) => {
                const error = catchError(() => normalizeAddress(address as string));
                expect(error.code).toBe('INVALID_ADDRESS');
                expect(error.message).toContain(hint);
            }
        );

        it('巨大な入力でもメッセージとdetailsの値を切り詰める', () => {
            const address = `0x${'a'.repeat(1_000_000)}`;
            const error = catchError(() => normalizeAddress(address));
            expect(error.message).toContain('（入力は1000002文字）');
            expect(error.message.length).toBeLessThan(250);
            expect(error.details).toMatchObject({
                address: `${address.slice(0, 100)}…（全1000002文字）`,
            });
        });
    });

    describe('isZeroAddress', () => {
        it('0x + 40個の0のみをゼロアドレスと判定する', () => {
            expect(isZeroAddress(`0x${'0'.repeat(40)}`)).toBe(true);
            expect(isZeroAddress(`0X${'0'.repeat(40)}`)).toBe(true);
            expect(isZeroAddress(`0x${'0'.repeat(39)}1`)).toBe(false);
            expect(isZeroAddress(`0x${'0'.repeat(39)}`)).toBe(false);
            expect(isZeroAddress(` 0x${'0'.repeat(40)}`)).toBe(false);
            expect(isZeroAddress(CHECKSUMMED)).toBe(false);
            expect(isZeroAddress(0 as unknown as string)).toBe(false);
        });
    });
});
