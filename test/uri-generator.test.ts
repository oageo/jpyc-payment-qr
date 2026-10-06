import { describe, expect, it } from 'vitest';
import { CHAIN_CONFIGS } from '../src/constants.js';
import { JPYCPaymentError } from '../src/errors.js';
import type { PaymentURIOptions } from '../src/types.js';
import { generatePaymentURI } from '../src/uri-generator.js';

// 受取アドレス（JPYCのコントラクトアドレスとは別の、チェックサム形式のアドレス）
const MERCHANT = '0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD';
const OTHER = '0x1234567890123456789012345678901234567890';
const JPYC_CONTRACT = CHAIN_CONFIGS.polygon.jpycAddress;
const TESTNET_CONTRACT = '0x1111111111111111111111111111111111111111';
// 末尾の9を8に打ち間違えたJPYCのコントラクトアドレス
const MISTYPED = '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c28';

/** 型チェックを外して任意の値をオプションとして渡すためのヘルパー */
const asOptions = (value: unknown) => value as PaymentURIOptions;

/** generatePaymentURIが投げたJPYCPaymentErrorを取り出す */
function catchError(fn: () => unknown): JPYCPaymentError {
    try {
        fn();
    } catch (error) {
        expect(error).toBeInstanceOf(JPYCPaymentError);
        return error as JPYCPaymentError;
    }
    throw new Error('例外が投げられませんでした');
}

describe('URI Generator', () => {
    describe('generatePaymentURI', () => {
        it('基本的なURIを生成できる（デフォルトはpolygon・decimals 18）', () => {
            const result = generatePaymentURI({ merchantAddress: MERCHANT, amount: 100 });

            expect(result).toEqual({
                uri: `ethereum:${JPYC_CONTRACT}@137/transfer?address=${MERCHANT}&uint256=100000000000000000000`,
                chainId: 137,
                network: 'polygon',
                jpycContractAddress: JPYC_CONTRACT,
                amountWei: '100000000000000000000',
                amountJPY: '100',
                decimals: 18,
                warnings: [],
            });
        });

        it.each([
            ['ethereum', 1],
            ['polygon', 137],
            ['avalanche', 43114],
            ['kaia', 8217],
        ] as const)(
            'networkに %s を指定するとチェーンID %i でURIを生成する',
            (network, chainId) => {
                const result = generatePaymentURI({
                    merchantAddress: MERCHANT,
                    amount: 100,
                    network,
                });

                expect(result.uri).toContain(`@${chainId}/transfer`);
                expect(result.chainId).toBe(chainId);
                expect(result.network).toBe(network);
            }
        );

        it.each([
            [1e-7, '0.0000001', '100000000000'],
            [0.5, '0.5', '500000000000000000'],
            ['100.50', '100.50', '100500000000000000000'],
            ['123.456', '123.456', '123456000000000000000'],
        ])(
            '金額 %j は amountJPY %j（文字列は指定どおり、数値は10進数表記）、amountWei %j になる',
            (amount, amountJPY, amountWei) => {
                const result = generatePaymentURI({ merchantAddress: MERCHANT, amount });
                expect(result.amountJPY).toBe(amountJPY);
                expect(result.amountWei).toBe(amountWei);
                expect(result.uri).toContain(`uint256=${amountWei}`);
            }
        );

        it('全て小文字・全て大文字の受取アドレスはチェックサム形式でURIに入る', () => {
            for (const merchantAddress of [
                MERCHANT,
                MERCHANT.toLowerCase(),
                `0x${MERCHANT.slice(2).toUpperCase()}`,
            ]) {
                expect(generatePaymentURI({ merchantAddress, amount: 100 }).uri).toContain(
                    `address=${MERCHANT}`
                );
            }
        });

        it('カスタムコントラクトアドレスとdecimalsを使用でき、戻り値とURIはチェックサム形式になる', () => {
            const result = generatePaymentURI({
                merchantAddress: MERCHANT,
                amount: 100,
                jpycContractAddress: '0x52908400098527886e0f7030069857d2e4169ee7',
                decimals: 6,
            });

            expect(result.jpycContractAddress).toBe('0x52908400098527886E0F7030069857D2E4169EE7');
            expect(result.uri).toContain(`ethereum:${result.jpycContractAddress}@137/transfer`);
            expect(result.decimals).toBe(6);
            expect(result.amountWei).toBe('100000000');
            expect(result.warnings.map((w) => w.code)).toEqual([
                'CUSTOM_CONTRACT',
                'CUSTOM_DECIMALS',
            ]);
        });

        it('バリデーションに失敗すると VALIDATION_FAILED を投げ、details に errors と issues を入れる', () => {
            const error = catchError(() =>
                generatePaymentURI({ merchantAddress: MISTYPED, amount: 100 })
            );
            expect(error.code).toBe('VALIDATION_FAILED');
            expect(error.details).toMatchObject({
                errors: [expect.stringContaining('チェックサムが一致しません')],
                issues: [{ field: 'merchantAddress', code: 'CHECKSUM_FAILED' }],
            });
        });
    });

    describe('chainIdオプション', () => {
        it('chainIdとjpycContractAddressを指定するとそのチェーンIDでURIを生成する', () => {
            const result = generatePaymentURI({
                merchantAddress: MERCHANT,
                amount: 100,
                jpycContractAddress: TESTNET_CONTRACT,
                chainId: 1001,
            });

            expect(result.uri).toContain(`ethereum:${TESTNET_CONTRACT}@1001/transfer`);
            expect(result.chainId).toBe(1001);
            expect(result.network).toBe('custom');
            expect(result.warnings.map((w) => w.code)).toContain('CUSTOM_CHAIN_ID');
        });

        it('chainIdを指定しない場合はnetworkのチェーンIDを使う', () => {
            const result = generatePaymentURI({
                merchantAddress: MERCHANT,
                amount: 100,
                jpycContractAddress: TESTNET_CONTRACT,
            });

            expect(result.chainId).toBe(137);
            expect(result.network).toBe('polygon');
        });
    });

    describe('不正な型の入力でもTypeErrorにならずJPYCPaymentErrorになる', () => {
        it.each([[null], [undefined], ['string'], [123]])('options自体が %j', (options) => {
            expect(catchError(() => generatePaymentURI(asOptions(options))).code).toBe(
                'VALIDATION_FAILED'
            );
        });

        const throwingToString = {
            toString() {
                throw new RangeError('boom');
            },
        };

        it.each([
            ['merchantAddress', Symbol('x')],
            ['merchantAddress', throwingToString],
            ['amount', throwingToString],
            ['amount', Object.create(null)],
            ['network', Symbol('x')],
            ['network', throwingToString],
            // CHAIN_CONFIGS のプロトタイプ由来のキー
            ['network', 'toString'],
            ['jpycContractAddress', Symbol('x')],
            ['decimals', Symbol('x')],
            ['chainId', Symbol('x')],
        ])('%s に %s を渡す', (key, value) => {
            const options = asOptions({
                merchantAddress: MERCHANT,
                amount: 1,
                jpycContractAddress: OTHER,
                [key]: value,
            });
            expect(catchError(() => generatePaymentURI(options)).code).toBe('VALIDATION_FAILED');
        });
    });

    describe('検証時と生成時で値が変わるオプション（getter・Proxy）', () => {
        /** 読み取り回数に応じて値を切り替えるgetterを持つオプションを作る */
        function switchingOptions(key: string, first: unknown, later: unknown) {
            let reads = 0;
            const options: Record<string, unknown> = { merchantAddress: MERCHANT, amount: 100 };
            Object.defineProperty(options, key, {
                enumerable: true,
                get() {
                    reads++;
                    return reads <= 1 ? first : later;
                },
            });
            return asOptions(options);
        }

        it('chainIdが2回目以降の読み取りで変わっても、検証した値でURIを生成する', () => {
            const result = generatePaymentURI(switchingOptions('chainId', undefined, 80002));
            expect(result.chainId).toBe(137);
            expect(result.uri).toContain('@137/transfer');
            expect(result.network).toBe('polygon');
        });

        it('merchantAddressが2回目以降の読み取りで変わっても、検証したアドレスに送金させる', () => {
            const result = generatePaymentURI(switchingOptions('merchantAddress', MERCHANT, OTHER));
            expect(result.uri).toContain(`address=${MERCHANT}`);
        });

        it('amountが2回目以降の読み取りで変わっても、amountJPYとamountWeiが一致する', () => {
            const result = generatePaymentURI(switchingOptions('amount', 100, '1e30'));
            expect(result.amountJPY).toBe('100');
            expect(result.amountWei).toBe('100000000000000000000');
        });

        it('networkが2回目以降の読み取りで不正値になってもTypeErrorにならない', () => {
            const result = generatePaymentURI(switchingOptions('network', undefined, 'bogus'));
            expect(result.network).toBe('polygon');
        });

        it('Proxyで読むたびに値が変わる場合も、検証した値を使う', () => {
            let reads = 0;
            const options = new Proxy(
                { merchantAddress: MERCHANT, amount: 100 },
                {
                    get(target, key) {
                        if (key === 'merchantAddress') {
                            reads++;
                            return reads <= 1 ? MERCHANT : OTHER;
                        }
                        return Reflect.get(target, key);
                    },
                }
            );
            expect(generatePaymentURI(options).uri).toContain(`address=${MERCHANT}`);
        });
    });

    describe('プロトタイプ汚染', () => {
        it('Object.prototypeが汚染されていても、省略した項目に汚染値を使わない', () => {
            const polluted: Record<string, unknown> = {
                network: 'ethereum',
                jpycContractAddress: OTHER,
                chainId: 1001,
                decimals: 6,
            };
            for (const [key, value] of Object.entries(polluted)) {
                Object.defineProperty(Object.prototype, key, {
                    value,
                    configurable: true,
                    writable: true,
                });
            }
            try {
                const result = generatePaymentURI({ merchantAddress: MERCHANT, amount: 100 });
                expect(result.network).toBe('polygon');
                expect(result.chainId).toBe(137);
                expect(result.jpycContractAddress).toBe(JPYC_CONTRACT);
                expect(result.decimals).toBe(18);
                expect(result.amountWei).toBe('100000000000000000000');
                expect(result.warnings).toEqual([]);
            } finally {
                for (const key of Object.keys(polluted)) {
                    Reflect.deleteProperty(Object.prototype, key);
                }
            }
        });
    });
});
