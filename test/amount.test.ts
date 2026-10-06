import { describe, expect, it } from 'vitest';
import { normalizeAmount, parseAmountToWei } from '../src/amount.js';
import { jpyToWei, weiToJpy } from '../src/encoder.js';
import { JPYCPaymentError } from '../src/errors.js';

/**
 * 関数がINVALID_AMOUNTのJPYCPaymentErrorを投げることを確認
 */
function expectInvalidAmount(fn: () => unknown): JPYCPaymentError {
    try {
        fn();
    } catch (error) {
        expect(error).toBeInstanceOf(JPYCPaymentError);
        expect((error as JPYCPaymentError).code).toBe('INVALID_AMOUNT');
        return error as JPYCPaymentError;
    }
    throw new Error('例外が投げられませんでした');
}

describe('Amount', () => {
    describe('normalizeAmount', () => {
        it('文字列の金額を正規形に整える', () => {
            expect(normalizeAmount('100')).toBe('100');
            expect(normalizeAmount('0.5')).toBe('0.5');
            expect(normalizeAmount('.5')).toBe('0.5');
            expect(normalizeAmount('5.')).toBe('5');
            expect(normalizeAmount('007.500')).toBe('7.5');
            expect(normalizeAmount('0')).toBe('0');
            expect(normalizeAmount('0.000')).toBe('0');
        });

        it('精度の高い文字列をそのまま保持する', () => {
            expect(normalizeAmount('0.0000000000000000001')).toBe('0.0000000000000000001');
            expect(normalizeAmount('123456789012345678901234567890.123456789')).toBe(
                '123456789012345678901234567890.123456789'
            );
        });

        it('無効な形式の文字列を拒否する', () => {
            for (const value of ['+1', '1.2.3', '1..5', 'abc', '0x10', '.']) {
                const error = expectInvalidAmount(() => normalizeAmount(value));
                expect(error.message).toContain('金額は半角数字と小数点のみで指定してください');
                expect(error.message).toContain(value);
            }
        });

        it.each([
            ['1,000', '（桁区切りのカンマは使えません）'],
            ['１００', '（全角文字が含まれています）'],
            ['1．5', '（全角文字が含まれています）'],
            [' 100', '（前後に空白や改行があります）'],
            ['100\n', '（前後に空白や改行があります）: 100\\n'],
            ['1e3', '（文字列では指数表記は使えません。10進数で書いてください）'],
            ['100円', '（通貨単位は付けないでください）'],
            ['¥100', '（通貨単位は付けないでください）'],
            ['￥100', '（通貨単位は付けないでください）'],
            ['100 JPYC', '（通貨単位は付けないでください）'],
        ])('よくある誤り %j には原因のヒントを付ける', (value, hint) => {
            const error = expectInvalidAmount(() => normalizeAmount(value));
            expect(error.message).toContain('金額は半角数字と小数点のみで指定してください');
            expect(error.message).toContain(hint);
        });

        it('空文字は空である旨を伝える', () => {
            const error = expectInvalidAmount(() => normalizeAmount(''));
            expect(error.message).toContain('金額が空です');
        });

        it('負の数の文字列は正の数が必要である旨を伝える', () => {
            for (const value of ['-1', '-0']) {
                const error = expectInvalidAmount(() => normalizeAmount(value));
                expect(error.message).toContain('正の数である必要があります');
            }
        });

        it('長すぎる文字列は即座に拒否する（0が長く続いても処理時間が入力長の2乗にならない）', () => {
            // 上限（100文字）ちょうどなら末尾の0が多くても受け付ける
            const longest = `1.${'0'.repeat(98)}`;
            expect(longest).toHaveLength(100);
            expect(normalizeAmount(longest)).toBe('1');
            expect(parseAmountToWei(longest, 18)).toBe(10n ** 18n);

            expect(expectInvalidAmount(() => normalizeAmount(`${longest}0`)).message).toContain(
                '長すぎます'
            );

            const huge = `1.${'0'.repeat(100_000)}1`;
            const start = performance.now();
            const error = expectInvalidAmount(() => normalizeAmount(huge));
            expect(performance.now() - start).toBeLessThan(100);
            expect(error.message).toContain('長すぎます');
            expect(error.message.length).toBeLessThan(200);
        });

        it('通常の数値を10進数文字列に変換する', () => {
            expect(normalizeAmount(100)).toBe('100');
            expect(normalizeAmount(0.5)).toBe('0.5');
            expect(normalizeAmount(1.23)).toBe('1.23');
            expect(normalizeAmount(0)).toBe('0');
            expect(normalizeAmount(-0)).toBe('0');
        });

        it('指数表記になる数値を正確に展開する', () => {
            expect(normalizeAmount(1e-7)).toBe('0.0000001');
            expect(normalizeAmount(1.5e-7)).toBe('0.00000015');
            expect(normalizeAmount(1e21)).toBe('1000000000000000000000');
            expect(normalizeAmount(1.5e21)).toBe('1500000000000000000000');
            expect(normalizeAmount(1.25e22)).toBe('12500000000000000000000');
            expect(normalizeAmount(5e-324)).toBe(`0.${'0'.repeat(323)}5`);
            expect(normalizeAmount(1e308)).toBe(`1${'0'.repeat(308)}`);
        });

        it('有効数字が15桁を超える数値を拒否し、文字列での指定を案内する', () => {
            // 以前は 0.1 + 0.2 が 300000000000000040 Wei になっていた
            const error = expectInvalidAmount(() => normalizeAmount(0.1 + 0.2));
            expect(error.message).toContain('0.30000000000000004');
            expect(error.message).toContain('計算誤差');
            expect(error.message).toContain('文字列で指定してください');
            expectInvalidAmount(() => normalizeAmount(0.7999999999999999));
            expectInvalidAmount(() => normalizeAmount(Number.MAX_VALUE));
            expectInvalidAmount(() => normalizeAmount(Number.MAX_SAFE_INTEGER));
        });

        it('有効数字がちょうど15桁の数値は許可する', () => {
            expect(normalizeAmount(123456789012345)).toBe('123456789012345');
            expect(normalizeAmount(0.123456789012345)).toBe('0.123456789012345');
            expect(normalizeAmount(1.23456789012345e-10)).toBe('0.000000000123456789012345');
        });

        it('NaN・無限大・負の数を拒否する', () => {
            expectInvalidAmount(() => normalizeAmount(Number.NaN));
            expectInvalidAmount(() => normalizeAmount(Number.POSITIVE_INFINITY));
            expectInvalidAmount(() => normalizeAmount(Number.NEGATIVE_INFINITY));
            const error = expectInvalidAmount(() => normalizeAmount(-1));
            expect(error.message).toContain('正の数である必要があります');
        });

        it('数値・文字列以外を拒否し、渡された型を示す（toStringは呼ばない）', () => {
            for (const value of [null, undefined, true, {}, [], 1n]) {
                expectInvalidAmount(() => normalizeAmount(value as unknown as string));
            }
            const error = expectInvalidAmount(() => normalizeAmount(true as unknown as string));
            expect(error.message).toContain('（booleanが渡されました）');
            const throwing = {
                toString() {
                    throw new Error('boom');
                },
            };
            expect(
                expectInvalidAmount(() => normalizeAmount(throwing as unknown as string)).message
            ).toContain('（objectが渡されました）');
        });
    });

    describe('parseAmountToWei', () => {
        it('金額をWeiのBigIntに変換する', () => {
            expect(parseAmountToWei('1', 18)).toBe(10n ** 18n);
            expect(parseAmountToWei('.5', 18)).toBe(5n * 10n ** 17n);
            expect(parseAmountToWei(1e-7, 18)).toBe(10n ** 11n);
            expect(parseAmountToWei(1e21, 18)).toBe(10n ** 39n);
            expect(parseAmountToWei('0', 18)).toBe(0n);
        });

        it('小数部がdecimals桁ちょうどなら変換できる', () => {
            expect(parseAmountToWei('0.000000000000000001', 18)).toBe(1n);
            expect(parseAmountToWei('1.123456', 6)).toBe(1123456n);
        });

        it('小数部がdecimals桁を超えて0以外の数字を含む場合は切り捨てずに拒否する', () => {
            // 以前は '0' に切り捨てられ、uint256=0 のURIが生成されていた
            const error = expectInvalidAmount(() => parseAmountToWei('0.0000000000000000001', 18));
            expect(error.message).toContain('小数点以下の桁数が多すぎます');
            expect(error.message).toContain('18桁');
            expectInvalidAmount(() => parseAmountToWei('1.1234567', 6));
            expectInvalidAmount(() => parseAmountToWei(5e-324, 18));
        });

        it('decimals桁を超える部分が0だけなら許可する', () => {
            expect(parseAmountToWei('0.0000000000000000010000', 18)).toBe(1n);
            expect(parseAmountToWei('1.1234560000', 6)).toBe(1123456n);
        });

        it('decimals 0では整数のみ受け付ける', () => {
            expect(parseAmountToWei('1', 0)).toBe(1n);
            expect(parseAmountToWei('1.', 0)).toBe(1n);
            expect(parseAmountToWei('1.000', 0)).toBe(1n);
            // 以前は '1' に切り捨てられていた
            expectInvalidAmount(() => parseAmountToWei('1.5', 0));
            expectInvalidAmount(() => parseAmountToWei(1.5, 0));
        });

        it('無効なdecimalsでINVALID_DECIMALSを投げる', () => {
            for (const decimals of [-1, 19, 1.5, Number.NaN]) {
                expect(() => parseAmountToWei('1', decimals)).toThrow(
                    expect.objectContaining({ code: 'INVALID_DECIMALS' })
                );
            }
        });
    });

    describe('jpyToWei', () => {
        it('Wei単位の文字列を返す（decimalsのデフォルトは18）', () => {
            expect(jpyToWei(1)).toBe('1000000000000000000');
            expect(jpyToWei(99.999)).toBe('99999000000000000000');
            expect(jpyToWei('0.123456789012345678')).toBe('123456789012345678');
            expect(jpyToWei(100, 6)).toBe('100000000');
        });

        it('変換できない金額はparseAmountToWeiと同じくエラーを投げる（切り捨てない）', () => {
            expectInvalidAmount(() => jpyToWei('0.0000000000000000001'));
            expectInvalidAmount(() => jpyToWei('1.5', 0));
        });
    });

    describe('weiToJpy', () => {
        it('WeiをJPYに変換し、小数部分の末尾のゼロを削除する', () => {
            expect(weiToJpy('1000000000000000000')).toBe('1');
            expect(weiToJpy('100000000000000000000')).toBe('100');
            expect(weiToJpy('500000000000000000')).toBe('0.5');
            expect(weiToJpy('1230000000000000000')).toBe('1.23');
            expect(weiToJpy('123000000000000000')).toBe('0.123');
            expect(weiToJpy('0')).toBe('0');
            expect(weiToJpy('1')).toBe('0.000000000000000001');
        });

        it('カスタムdecimalsで変換できる', () => {
            expect(weiToJpy('1000000', 6)).toBe('1');
            expect(weiToJpy('100000000', 6)).toBe('100');
            expect(weiToJpy('15', 0)).toBe('15');
        });

        it('無効なdecimalsでエラーを投げる', () => {
            expect(() => weiToJpy('1000000000000000000', -1)).toThrow(JPYCPaymentError);
            expect(() => weiToJpy('1000000000000000000', 19)).toThrow(JPYCPaymentError);
        });

        it('10進整数以外のWei金額でエラーを投げる', () => {
            // 以前は '' → '0'、'0x10' → 16 Wei扱い、'-1' → 壊れた文字列になっていた
            for (const value of ['', '0x10', '-1', ' 1', '1.5', '1e3', '+1', 'abc', '1,000']) {
                const error = expectInvalidAmount(() => weiToJpy(value));
                expect(error.message).toContain('Wei金額（weiAmount）は0以上の整数');
            }
            // details にも見えない文字を見える表記にした値を入れる
            expect(expectInvalidAmount(() => weiToJpy('1 ')).details).toEqual({
                weiAmount: '1\\u2028',
            });
        });

        it('文字列以外のWei金額は渡された型を示してエラーを投げる', () => {
            for (const [value, type] of [
                [100, 'number'],
                [undefined, 'undefined'],
            ] as const) {
                const error = expectInvalidAmount(() => weiToJpy(value as unknown as string));
                expect(error.message).toContain(`（${type}が渡されました）`);
            }
        });

        it('78桁を超えるWei金額は形式チェックの前に即座に拒否する', () => {
            expect(weiToJpy('9'.repeat(78))).toBe(`${'9'.repeat(60)}.${'9'.repeat(18)}`);
            const value = '9'.repeat(10_000_000);
            const start = Date.now();
            const error = expectInvalidAmount(() => weiToJpy(value));
            expect(Date.now() - start).toBeLessThan(500);
            expect(error.message).toContain('長すぎます（最大78桁、入力は10000000文字）');
            expect(error.details).toEqual({ weiAmount: `${'9'.repeat(100)}…（全10000000文字）` });
        });
    });
});
