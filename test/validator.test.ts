import { describe, expect, it } from 'vitest';
import { CHAIN_CONFIGS } from '../src/constants.js';
import { jpyToWei } from '../src/encoder.js';
import { JPYCPaymentError } from '../src/errors.js';
import type { PaymentURIOptions, ValidationIssue } from '../src/types.js';
import { generatePaymentURI } from '../src/uri-generator.js';
import {
    type IsValidAmountOptions,
    isValidAddress,
    isValidAmount,
    validateGenerateOptions,
} from '../src/validator.js';

// 受取アドレス（JPYCのコントラクトアドレスとは別の、チェックサム形式のアドレス）
const MERCHANT = '0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD';
const CUSTOM_CONTRACT = '0x1234567890123456789012345678901234567890';
const JPYC_CONTRACT = CHAIN_CONFIGS.polygon.jpycAddress;
// 末尾の9を8に打ち間違えたJPYCのコントラクトアドレス（大文字小文字混在のためチェックサム検証の対象）
const MISTYPED = '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c28';
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;

/** 型チェックを外して任意の値をオプションとして渡すためのヘルパー */
const asOptions = (value: unknown) => value as PaymentURIOptions;

/** 有効な受取アドレス・金額に、指定した項目を上書きしたオプションを作る */
const withDefaults = (overrides: Record<string, unknown>) =>
    asOptions({ merchantAddress: MERCHANT, amount: 100, ...overrides });

/** issues の項目名とエラーコードだけを取り出す */
function issueKeys(options: PaymentURIOptions): Pick<ValidationIssue, 'field' | 'code'>[] {
    return validateGenerateOptions(options).issues.map(({ field, code }) => ({ field, code }));
}

describe('Validator', () => {
    describe('validateGenerateOptions', () => {
        it('正しいオプションは valid で、errors・issues が空', () => {
            const result = validateGenerateOptions({ merchantAddress: MERCHANT, amount: 100 });
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.issues).toEqual([]);
        });

        it('issuesはerrorsと同じ順序で、項目とエラーコードを持つ', () => {
            const result = validateGenerateOptions(
                asOptions({
                    merchantAddress: MISTYPED,
                    amount: '0.0000000000000000001',
                    network: 'bitcoin',
                })
            );

            expect(result.valid).toBe(false);
            expect(result.issues.map((issue) => issue.message)).toEqual(result.errors);
            expect(result.issues.map(({ field, code }) => ({ field, code }))).toEqual([
                { field: 'merchantAddress', code: 'CHECKSUM_FAILED' },
                { field: 'amount', code: 'INVALID_AMOUNT' },
                { field: 'network', code: 'INVALID_NETWORK' },
            ]);
        });

        it.each([[null], [undefined], ['string'], [123]])(
            'options自体が %j の場合は options のエラーになる',
            (options) => {
                expect(issueKeys(asOptions(options))).toEqual([
                    { field: 'options', code: 'VALIDATION_FAILED' },
                ]);
            }
        );
    });

    describe('validateGenerateOptions（merchantAddress）', () => {
        it.each([
            ['未指定', undefined, 'INVALID_ADDRESS'],
            ['空文字', '', 'INVALID_ADDRESS'],
            ['0xで始まらない', 'invalid', 'INVALID_ADDRESS'],
            ['長さ不足', '0x123', 'INVALID_ADDRESS'],
            ['チェックサム不一致', MISTYPED, 'CHECKSUM_FAILED'],
        ])('%s の受取アドレスは merchantAddress / %s のエラーになる', (_label, address, code) => {
            expect(issueKeys(withDefaults({ merchantAddress: address }))).toEqual([
                { field: 'merchantAddress', code },
            ]);
        });

        it('全て小文字・全て大文字・正しいチェックサムの受取アドレスは有効', () => {
            for (const merchantAddress of [
                MERCHANT.toLowerCase(),
                `0x${MERCHANT.slice(2).toUpperCase()}`,
                MERCHANT,
            ]) {
                expect(validateGenerateOptions({ merchantAddress, amount: 100 }).valid).toBe(true);
            }
        });

        // ゼロアドレスやトークンのコントラクトに送金すると資金を取り戻せないため拒否する
        it.each([
            ['ゼロアドレス', ZERO_ADDRESS, {}],
            ['JPYCのコントラクトアドレス', JPYC_CONTRACT, {}],
            ['JPYCのコントラクトアドレス（全て小文字）', JPYC_CONTRACT.toLowerCase(), {}],
            [
                'JPYCのコントラクトアドレス（全て大文字）',
                `0x${JPYC_CONTRACT.slice(2).toUpperCase()}`,
                {},
            ],
            [
                'カスタムコントラクト指定時のJPYCのコントラクトアドレス',
                JPYC_CONTRACT,
                { jpycContractAddress: CUSTOM_CONTRACT },
            ],
            [
                '指定したjpycContractAddress（大文字小文字違い）',
                MERCHANT.toLowerCase(),
                { jpycContractAddress: MERCHANT },
            ],
        ])('受取アドレスに%sを指定すると INVALID_ADDRESS になる', (_label, address, extra) => {
            expect(issueKeys(withDefaults({ merchantAddress: address, ...extra }))).toEqual([
                { field: 'merchantAddress', code: 'INVALID_ADDRESS' },
            ]);
        });

        it('コントラクトアドレスにゼロアドレスを指定すると INVALID_ADDRESS になる', () => {
            expect(issueKeys(withDefaults({ jpycContractAddress: ZERO_ADDRESS }))).toEqual([
                { field: 'jpycContractAddress', code: 'INVALID_ADDRESS' },
            ]);
        });
    });

    describe('validateGenerateOptions（amount）', () => {
        it.each([
            ['未指定', undefined],
            ['空文字', ''],
            ['負の数', -100],
            ['0', 0],
            ['数字以外を含む文字列', '100abc'],
            ['NaN', Number.NaN],
            ['無限大', Number.POSITIVE_INFINITY],
            ['浮動小数点誤差を含む数値', 0.1 + 0.2],
            ['小数点以下18桁を超える端数', '0.0000000000000000001'],
            ['上限超過', '1000000000000000.000000000000000001'],
            ['上限超過（指数表記の数値）', 1e21],
        ])('%s の金額は amount / INVALID_AMOUNT のエラーになる', (_label, amount) => {
            expect(issueKeys(withDefaults({ amount }))).toEqual([
                { field: 'amount', code: 'INVALID_AMOUNT' },
            ]);
        });

        it('カスタムdecimalsの桁数を超える端数は amount のエラーになる', () => {
            expect(
                issueKeys(
                    withDefaults({
                        amount: '1.5',
                        jpycContractAddress: CUSTOM_CONTRACT,
                        decimals: 0,
                    })
                )
            ).toEqual([{ field: 'amount', code: 'INVALID_AMOUNT' }]);
        });

        it('上限ちょうどの金額は有効', () => {
            expect(
                validateGenerateOptions(withDefaults({ amount: '1000000000000000' })).valid
            ).toBe(true);
            expect(validateGenerateOptions(withDefaults({ amount: 1e15 })).valid).toBe(true);
        });

        it('金額の警告はWeiで判定する（境界値）', () => {
            const codes = (amount: number | string) => {
                const result = validateGenerateOptions(withDefaults({ amount }));
                expect(result.valid).toBe(true);
                return result.warnings.map((w) => w.code);
            };
            expect(codes('0.999999999999999999')).toContain('SMALL_AMOUNT');
            // 指数表記になる小さな数値も受け付ける（以前は形式エラーになっていた）
            expect(codes(1e-7)).toContain('SMALL_AMOUNT');
            expect(codes('1')).not.toContain('SMALL_AMOUNT');
            expect(codes('1000000')).not.toContain('LARGE_AMOUNT');
            expect(codes('1000000.000000000000000001')).toContain('LARGE_AMOUNT');
        });

        it('バリデーション結果とURI生成時の金額変換が一致する', () => {
            const amounts: (number | string)[] = [
                1,
                100,
                0.5,
                1e-7,
                1e-18,
                1e-19,
                1e21,
                5e-324,
                Number.MAX_VALUE,
                -0,
                0,
                -1,
                0.1 + 0.2,
                Number.NaN,
                Number.POSITIVE_INFINITY,
                '1',
                '.5',
                '5.',
                '0.000000000000000001',
                '0.0000000000000000001',
                '0.0000000000000000010',
                '1000000000000000',
                '1000000000000001',
                '',
                ' 1',
                '1e3',
                '+1',
                '-1',
                '0x10',
            ];
            const decimalsList: (number | undefined)[] = [undefined, 0, 6, 18];

            for (const decimals of decimalsList) {
                for (const amount of amounts) {
                    const options: PaymentURIOptions =
                        decimals === undefined
                            ? { merchantAddress: MERCHANT, amount }
                            : {
                                  merchantAddress: MERCHANT,
                                  amount,
                                  jpycContractAddress: CUSTOM_CONTRACT,
                                  decimals,
                              };
                    const { valid } = validateGenerateOptions(options);
                    const label = `amount=${String(amount)}, decimals=${decimals}`;

                    let generated = true;
                    try {
                        generatePaymentURI(options);
                    } catch {
                        generated = false;
                    }
                    expect(generated, label).toBe(valid);
                    expect(isValidAmount(amount, { decimals: decimals ?? 18 }), label).toBe(valid);
                    if (valid) {
                        expect(() => jpyToWei(amount, decimals), label).not.toThrow();
                    }
                }
            }
        });
    });

    describe('validateGenerateOptions（network・jpycContractAddress）', () => {
        it.each([
            ['invalid-network'],
            ['Polygon'],
            // プロトタイプ由来のキー
            ['toString'],
            ['constructor'],
            ['__proto__'],
            ['hasOwnProperty'],
            ['valueOf'],
            // 文字列に変換すると 'polygon' になる文字列以外の値
            [['polygon']],
            [{ toString: (): string => 'polygon' }],
            [new String('polygon')],
        ])(
            'サポートされていないnetwork %j は network / INVALID_NETWORK のエラーになる',
            (network) => {
                expect(issueKeys(withDefaults({ network }))).toEqual([
                    { field: 'network', code: 'INVALID_NETWORK' },
                ]);
            }
        );

        it('カスタムコントラクトアドレスは有効で、CUSTOM_CONTRACT 警告を返す', () => {
            const result = validateGenerateOptions(
                withDefaults({ jpycContractAddress: CUSTOM_CONTRACT })
            );
            expect(result.valid).toBe(true);
            expect(result.warnings.map((w) => w.code)).toContain('CUSTOM_CONTRACT');
        });

        it.each([
            ['0x123', 'INVALID_ADDRESS'],
            [MISTYPED, 'CHECKSUM_FAILED'],
        ])('不正なjpycContractAddress %s は %s のエラーになり、警告は出さない', (address, code) => {
            const result = validateGenerateOptions(withDefaults({ jpycContractAddress: address }));
            expect(result.issues.map(({ field, code }) => ({ field, code }))).toEqual([
                { field: 'jpycContractAddress', code },
            ]);
            expect(result.warnings.map((w) => w.code)).not.toContain('CUSTOM_CONTRACT');
        });
    });

    describe('validateGenerateOptions（decimals・chainId は1項目につきエラー1件）', () => {
        it.each([
            ['decimalsをjpycContractAddressなしで指定', { decimals: 6 }, 'decimals'],
            ['範囲外のdecimalsをjpycContractAddressなしで指定', { decimals: 19 }, 'decimals'],
            [
                '範囲外のdecimals',
                { jpycContractAddress: CUSTOM_CONTRACT, decimals: 19 },
                'decimals',
            ],
            [
                '整数でないdecimals',
                { jpycContractAddress: CUSTOM_CONTRACT, decimals: 1.5 },
                'decimals',
            ],
            ['chainIdをjpycContractAddressなしで指定', { chainId: 1001 }, 'chainId'],
            ['範囲外のchainIdをjpycContractAddressなしで指定', { chainId: 0 }, 'chainId'],
            [
                'chainIdとnetworkを同時に指定',
                { network: 'polygon', jpycContractAddress: CUSTOM_CONTRACT, chainId: 80002 },
                'chainId',
            ],
            [
                '範囲外のchainIdとnetworkを同時に指定',
                { network: 'polygon', jpycContractAddress: CUSTOM_CONTRACT, chainId: 0 },
                'chainId',
            ],
        ])('%s → %s のエラー1件のみ', (_label, extra, field) => {
            const code = field === 'decimals' ? 'INVALID_DECIMALS' : 'INVALID_NETWORK';
            expect(issueKeys(withDefaults(extra))).toEqual([{ field, code }]);
        });

        it('decimals・chainIdのエラーは原因の優先順（併用 → 同時指定 → 値の範囲）で1つだけ示す', () => {
            const message = (extra: Record<string, unknown>, field: string) =>
                validateGenerateOptions(withDefaults(extra)).issues.find(
                    (issue) => issue.field === field
                )?.message;

            expect(message({ decimals: 19 }, 'decimals')).toContain('併用する場合のみ');
            expect(message({ chainId: 0 }, 'chainId')).toContain('併用する場合のみ');
            expect(
                message(
                    { network: 'polygon', jpycContractAddress: CUSTOM_CONTRACT, chainId: 0 },
                    'chainId'
                )
            ).toContain('同時に指定できません');
        });

        it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, '1001'])(
            '正の安全な整数でないchainId %s は chainId / INVALID_NETWORK のエラーになり、警告は出さない',
            (chainId) => {
                const result = validateGenerateOptions(
                    withDefaults({ jpycContractAddress: CUSTOM_CONTRACT, chainId })
                );
                expect(result.issues.map(({ field, code }) => ({ field, code }))).toEqual([
                    { field: 'chainId', code: 'INVALID_NETWORK' },
                ]);
                expect(result.warnings.map((w) => w.code)).not.toContain('CUSTOM_CHAIN_ID');
            }
        );

        it('chainIdとjpycContractAddressを併用すると有効で、CUSTOM_CHAIN_ID 警告を返す', () => {
            const result = validateGenerateOptions(
                withDefaults({ jpycContractAddress: CUSTOM_CONTRACT, chainId: 80002 })
            );
            expect(result.valid).toBe(true);
            expect(result.warnings.map((w) => w.code)).toContain('CUSTOM_CHAIN_ID');
        });

        it('18以外のカスタムdecimalsは有効で、CUSTOM_DECIMALS 警告を返す', () => {
            const codes = (decimals: number) =>
                validateGenerateOptions(
                    withDefaults({ jpycContractAddress: CUSTOM_CONTRACT, decimals })
                ).warnings.map((w) => w.code);
            expect(codes(6)).toContain('CUSTOM_DECIMALS');
            expect(codes(18)).not.toContain('CUSTOM_DECIMALS');
        });

        it('decimalsが無効なときは金額を標準のdecimalsで検証し、金額に余計なエラーを出さない', () => {
            expect(issueKeys(withDefaults({ amount: '1.5', decimals: 0 }))).toEqual([
                { field: 'decimals', code: 'INVALID_DECIMALS' },
            ]);
            expect(
                issueKeys(
                    withDefaults({
                        amount: '1.5',
                        jpycContractAddress: CUSTOM_CONTRACT,
                        decimals: 19,
                    })
                )
            ).toEqual([{ field: 'decimals', code: 'INVALID_DECIMALS' }]);
        });
    });

    // エラーメッセージの文面はここでまとめて確認する（他のテストは field / code で判定する）
    describe('エラーメッセージの分かりやすさ', () => {
        it.each([
            ['改行', '\n', '\\n'],
            ['行区切り', ' ', '\\u2028'],
            ['双方向制御文字', '‮', '\\u202E'],
            ['ソフトハイフン', '­', '\\u00AD'],
            ['タグ文字（補助面）', '\u{E0041}', '\\u{E0041}'],
        ])(
            '入力値の%sはメッセージ上で見える表記にする（表示の偽装を防ぐ）',
            (_label, char, shown) => {
                const [message = ''] = validateGenerateOptions(
                    withDefaults({ merchantAddress: `0x1234${char}[OK] 送金先を確認しました` })
                ).errors;
                expect(message).toContain(shown);
                expect(message).not.toContain(char);
            }
        );

        it('各メッセージは「<項目名>: <内容>」の形式', () => {
            const issues = [
                ...validateGenerateOptions(
                    asOptions({
                        merchantAddress: '',
                        amount: '',
                        network: 'bitcoin',
                        decimals: 6,
                        chainId: 1,
                    })
                ).issues,
                ...validateGenerateOptions(withDefaults({ jpycContractAddress: MISTYPED })).issues,
            ];
            expect(issues.map((issue) => issue.field)).toEqual([
                'merchantAddress',
                'amount',
                'network',
                'decimals',
                'chainId',
                'jpycContractAddress',
            ]);
            for (const issue of issues) {
                expect(issue.message.startsWith(`${issue.field}: `)).toBe(true);
            }
            expect(validateGenerateOptions(asOptions(null)).errors[0]).toMatch(/^options: /);
        });

        it.each([
            [
                '受取アドレスの未指定',
                { merchantAddress: undefined },
                ['受取アドレスが指定されていません'],
            ],
            ['受取アドレスの形式不正', { merchantAddress: '0x123' }, ['42文字', '0x123']],
            [
                '受取アドレスのチェックサム不一致',
                { merchantAddress: MISTYPED },
                ['チェックサムが一致しません', '打ち間違い', MISTYPED],
            ],
            [
                '受取アドレスがゼロアドレス',
                { merchantAddress: ZERO_ADDRESS },
                ['ゼロアドレス', '取り戻せなく'],
            ],
            [
                '受取アドレスがコントラクトアドレス',
                { merchantAddress: JPYC_CONTRACT },
                ['コントラクトアドレス', '取り違えていないか', JPYC_CONTRACT],
            ],
            ['金額の未指定', { amount: '' }, ['金額が指定されていません']],
            [
                '数値の浮動小数点誤差',
                { amount: 0.1 + 0.2 },
                ['計算誤差', '文字列で指定してください'],
            ],
            ['金額の端数', { amount: '0.0000000000000000001' }, ['小数点以下18桁まで']],
            [
                'カスタムdecimalsの端数',
                { amount: '1.5', jpycContractAddress: CUSTOM_CONTRACT, decimals: 0 },
                ['小数点以下0桁まで'],
            ],
            [
                '金額の上限超過',
                { amount: '1000000000000001' },
                ['大きすぎます', '1000000000000000'],
            ],
            [
                'サポートされていないnetwork',
                { network: 'Polygon' },
                ['ethereum / polygon / avalanche / kaia', '小文字', 'Polygon'],
            ],
            [
                'jpycContractAddressなしのdecimals',
                { decimals: 6 },
                ['jpycContractAddressと併用する場合のみ', '18で固定'],
            ],
            [
                '範囲外のdecimals',
                { jpycContractAddress: CUSTOM_CONTRACT, decimals: 19 },
                ['0から18の整数', '19'],
            ],
            [
                'jpycContractAddressなしのchainId',
                { chainId: 1001 },
                ['jpycContractAddressと併用する場合のみ'],
            ],
            [
                'chainIdとnetworkの同時指定',
                { network: 'polygon', jpycContractAddress: CUSTOM_CONTRACT, chainId: 80002 },
                ['chainIdとnetworkは同時に指定できません'],
            ],
            [
                '範囲外のchainId',
                { jpycContractAddress: CUSTOM_CONTRACT, chainId: 1.5 },
                ['1以上', '整数', '1.5'],
            ],
        ])('%s のメッセージは原因と値を示す', (_label, extra, keywords) => {
            const { errors } = validateGenerateOptions(withDefaults(extra));
            expect(errors).toHaveLength(1);
            for (const keyword of keywords) {
                expect(errors[0]).toContain(keyword);
            }
        });

        it('generatePaymentURIのメッセージは件数とすべてのエラーを含む', () => {
            try {
                generatePaymentURI({ merchantAddress: MISTYPED, amount: 0 });
                expect.unreachable('例外が投げられませんでした');
            } catch (error) {
                expect(error).toBeInstanceOf(JPYCPaymentError);
                const { message } = error as JPYCPaymentError;
                expect(message).toContain('バリデーションに失敗しました（2件）');
                expect(message).toContain('merchantAddress: ');
                expect(message).toContain(' / amount: ');
            }
        });
    });

    describe('isValidAddress', () => {
        it('形式が正しく、大文字小文字混在の場合はチェックサムが一致するアドレスのみtrue', () => {
            expect(isValidAddress(MERCHANT.toLowerCase())).toBe(true);
            expect(isValidAddress(`0x${MERCHANT.slice(2).toUpperCase()}`)).toBe(true);
            expect(isValidAddress(MERCHANT)).toBe(true);

            expect(isValidAddress('0x123')).toBe(false);
            expect(isValidAddress('not-an-address')).toBe(false);
            expect(isValidAddress(MERCHANT.slice(2))).toBe(false);
            expect(isValidAddress(MISTYPED)).toBe(false);
        });
    });

    describe('isValidAmount', () => {
        it('Wei変換と同じ基準で金額を判定する', () => {
            for (const amount of [
                1,
                '1000.5',
                1e-7,
                '0.000000000000000001',
                '1000000000000000',
                1e15,
            ]) {
                expect(isValidAmount(amount), String(amount)).toBe(true);
            }
            for (const amount of [
                0,
                -0,
                -1,
                Number.NaN,
                Number.POSITIVE_INFINITY,
                '',
                'abc',
                '1.2.3',
                // 浮動小数点誤差を含む数値
                0.1 + 0.2,
                // decimals桁を超える端数（切り捨てない）
                '0.0000000000000000001',
                '1000000000000000.1',
                1e21,
            ]) {
                expect(isValidAmount(amount), String(amount)).toBe(false);
            }
        });

        it('decimalsをオブジェクトで指定して検証できる', () => {
            expect(isValidAmount('1.5', { decimals: 0 })).toBe(false);
            expect(isValidAmount('2', { decimals: 0 })).toBe(true);
            expect(isValidAmount('1.123456', { decimals: 6 })).toBe(true);
            expect(isValidAmount('1.1234567', { decimals: 6 })).toBe(false);
        });

        it('配列のコールバックに渡しても、要素の位置をdecimalsとして扱わない', () => {
            // 以前は index 0 が decimals=0 と解釈され、'1.5' が無効になっていた
            const callback = isValidAmount as unknown as (value: string, index: number) => boolean;
            expect(['1.5', '2.5', '0.001'].every(callback)).toBe(true);
            expect(['1.5', 'abc'].filter(callback)).toEqual(['1.5']);
            // オブジェクト以外の第2引数は無視する
            expect(isValidAmount('1.5', 0 as unknown as IsValidAmountOptions)).toBe(true);
            expect(isValidAmount('1.5', null as unknown as IsValidAmountOptions)).toBe(true);
        });
    });
});
