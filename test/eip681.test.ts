import { describe, expect, it } from 'vitest';
import { type EIP681DecodeErrorDetails, decodeEIP681, encodeEIP681 } from '../src/encoder.js';
import { JPYCPaymentError } from '../src/errors.js';

const CONTRACT_LOWER = '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29';
const CONTRACT = '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29';
// チェックサムが一致しない（先頭の 'E' を小文字にした）アドレス
const CONTRACT_BAD_CHECKSUM = '0xe7C3D8C9a439feDe00D2600032D5dB0Be71C3c29';
const RECIPIENT = '0x1234567890123456789012345678901234567890';
const MAX_UINT256 = ((1n << 256n) - 1n).toString();

/** 正常なURIを組み立てる（各部を差し替えてテストする） */
function buildURI({
    scheme = 'ethereum',
    target = CONTRACT,
    chain = '@137',
    fn = '/transfer',
    query = `?address=${RECIPIENT}&uint256=1000`,
}: {
    scheme?: string;
    target?: string;
    chain?: string;
    fn?: string;
    query?: string;
} = {}): string {
    return `${scheme}:${target}${chain}${fn}${query}`;
}

/** 例外を捕捉して返す */
function catchError(fn: () => unknown): JPYCPaymentError {
    try {
        fn();
    } catch (error) {
        expect(error).toBeInstanceOf(JPYCPaymentError);
        return error as JPYCPaymentError;
    }
    throw new Error('例外が投げられませんでした');
}

/**
 * デコードが ENCODING_FAILED で失敗し、details が期待どおりであることを確認する
 * @param uri - デコードする入力
 * @param expected - details に期待する値（kind / name / value 等）
 * @param reason - メッセージに含まれるべき文字列
 * @returns details
 */
function expectDecodeFailure(
    uri: unknown,
    expected: Partial<EIP681DecodeErrorDetails> = {},
    reason?: string
): EIP681DecodeErrorDetails {
    const error = catchError(() => decodeEIP681(uri as string));
    expect(error.code).toBe('ENCODING_FAILED');
    const details = error.details as EIP681DecodeErrorDetails;
    expect(error.message).toBe(`EIP-681 URIのデコードに失敗しました: ${details.reason}`);
    expect(details.reason).not.toBe('');
    if (reason !== undefined) {
        expect(error.message).toContain(reason);
    }
    expect(details).toMatchObject(expected);
    // details.uri は切り詰め済みで、内部エラーオブジェクトは含まない
    // （見えない文字を含む場合は expected.uri にエスケープ後の値を指定する）
    if (typeof uri === 'string' && uri.length <= 256 && expected.uri === undefined) {
        expect(details.uri).toBe(uri);
    }
    expect(details.uri.length).toBeLessThanOrEqual(300);
    expect(Object.keys(details).sort()).toEqual(expect.arrayContaining(['kind', 'reason', 'uri']));
    for (const key of Object.keys(details)) {
        expect(['kind', 'reason', 'name', 'value', 'uri']).toContain(key);
    }
    return details;
}

describe('EIP-681', () => {
    describe('encodeEIP681', () => {
        it('正常な入力でURIを生成する', () => {
            expect(encodeEIP681(CONTRACT_LOWER, RECIPIENT, '1000000000000000000', 137)).toBe(
                `ethereum:${CONTRACT}@137/transfer?address=${RECIPIENT}&uint256=1000000000000000000`
            );
        });

        it('uint256の最大値を受け付ける', () => {
            expect(encodeEIP681(CONTRACT, RECIPIENT, MAX_UINT256, 1)).toContain(
                `uint256=${MAX_UINT256}`
            );
        });

        it('金額によるクエリパラメータの注入を拒否する', () => {
            const error = catchError(() =>
                encodeEIP681(CONTRACT, RECIPIENT, '1&value=1000000000000000000', 137)
            );
            expect(error.code).toBe('INVALID_AMOUNT');
        });

        it.each([
            ['0'],
            ['00'],
            ['01'],
            ['-1'],
            ['+1'],
            [''],
            ['1.5'],
            ['1e18'],
            ['0x10'],
            [' 1'],
            ['1 '],
            // uint256の最大値 + 1（78桁）
            [(1n << 256n).toString()],
            // 79桁（長さだけで範囲外と判定する）
            [`1${'0'.repeat(78)}`],
        ])('無効な金額 %j を INVALID_AMOUNT で拒否する', (amount) => {
            const error = catchError(() => encodeEIP681(CONTRACT, RECIPIENT, amount, 137));
            expect(error.code).toBe('INVALID_AMOUNT');
        });

        it.each([
            [Number.NaN],
            [0],
            [-1],
            [1.5],
            [Number.POSITIVE_INFINITY],
            [Number.MAX_SAFE_INTEGER + 1],
        ])('無効なチェーンID %s を INVALID_NETWORK で拒否する', (chainId) => {
            const error = catchError(() => encodeEIP681(CONTRACT, RECIPIENT, '1', chainId));
            expect(error.code).toBe('INVALID_NETWORK');
        });

        it('無効なアドレスを INVALID_ADDRESS で拒否する', () => {
            expect(catchError(() => encodeEIP681('invalid', RECIPIENT, '1', 137)).code).toBe(
                'INVALID_ADDRESS'
            );
            expect(catchError(() => encodeEIP681(CONTRACT, '0x1234', '1', 137)).code).toBe(
                'INVALID_ADDRESS'
            );
        });

        it('チェックサム不一致のアドレスを CHECKSUM_FAILED で拒否する', () => {
            expect(
                catchError(() => encodeEIP681(CONTRACT_BAD_CHECKSUM, RECIPIENT, '1', 137)).code
            ).toBe('CHECKSUM_FAILED');
            expect(
                catchError(() => encodeEIP681(CONTRACT, CONTRACT_BAD_CHECKSUM, '1', 137)).code
            ).toBe('CHECKSUM_FAILED');
        });

        it('どの引数が不正かを details に含める', () => {
            expect(catchError(() => encodeEIP681('invalid', RECIPIENT, '1', 137)).details).toEqual({
                field: 'contractAddress',
                value: 'invalid',
            });
            expect(
                catchError(() => encodeEIP681(CONTRACT, CONTRACT_BAD_CHECKSUM, '1', 137)).details
            ).toEqual({ field: 'recipientAddress', value: CONTRACT_BAD_CHECKSUM });
            expect(catchError(() => encodeEIP681(CONTRACT, RECIPIENT, '1.5', 137)).details).toEqual(
                { field: 'amount', value: '1.5' }
            );
            expect(catchError(() => encodeEIP681(CONTRACT, RECIPIENT, '1', 0)).details).toEqual({
                field: 'chainId',
                value: '0',
            });
        });

        it('メッセージに引数名と値を含める', () => {
            const error = catchError(() => encodeEIP681(CONTRACT, 'invalid', '1', 137));
            expect(error.message).toBe(
                '受取アドレス（recipientAddress）が不正です。アドレスは 0x で始まる必要があります: invalid'
            );
            // アドレスの原因の説明（normalizeAddress のメッセージ）をそのまま含め、値を重複させない
            const spaced = catchError(() => encodeEIP681(CONTRACT, ` ${RECIPIENT}`, '1', 137));
            expect(spaced.code).toBe('INVALID_ADDRESS');
            expect(spaced.message).toBe(
                `受取アドレス（recipientAddress）が不正です。アドレスの前後に空白や改行が含まれています。取り除いてください: " ${RECIPIENT}"`
            );
            expect(
                catchError(() => encodeEIP681(CONTRACT, RECIPIENT, '01', 137)).message
            ).toContain('金額（amount）');
            expect(catchError(() => encodeEIP681(CONTRACT, RECIPIENT, '0', 137)).message).toBe(
                '金額（amount）が0です。1以上の金額を指定してください: 0'
            );
        });

        it.each([
            ['数値', 1000],
            ['Object.create(null)', Object.create(null)],
            [
                'toStringが例外を投げるオブジェクト',
                {
                    toString() {
                        throw new Error('boom');
                    },
                },
            ],
            [
                'Symbol.toPrimitiveが例外を投げるオブジェクト',
                {
                    [Symbol.toPrimitive]() {
                        throw new RangeError('boom');
                    },
                },
            ],
            ['Symbol', Symbol('x')],
            ['関数', () => '1'],
        ])('金額に %s を渡しても INVALID_AMOUNT になる', (_label, amount) => {
            const error = catchError(() =>
                encodeEIP681(CONTRACT, RECIPIENT, amount as unknown as string, 137)
            );
            expect(error.code).toBe('INVALID_AMOUNT');
            expect(error.details).toMatchObject({ field: 'amount' });
        });

        it.each([
            ['文字列', '137'],
            ['Object.create(null)', Object.create(null)],
            [
                'toStringが例外を投げるオブジェクト',
                {
                    toString() {
                        throw new Error('boom');
                    },
                },
            ],
            ['Symbol', Symbol('x')],
            ['BigInt', 137n],
        ])('チェーンIDに %s を渡しても INVALID_NETWORK になる', (_label, chainId) => {
            const error = catchError(() =>
                encodeEIP681(CONTRACT, RECIPIENT, '1', chainId as unknown as number)
            );
            expect(error.code).toBe('INVALID_NETWORK');
            expect(error.details).toMatchObject({ field: 'chainId' });
        });

        it('アドレスに Object.create(null) を渡しても INVALID_ADDRESS になる', () => {
            const error = catchError(() =>
                encodeEIP681(Object.create(null) as string, RECIPIENT, '1', 137)
            );
            expect(error.code).toBe('INVALID_ADDRESS');
            expect(error.details).toEqual({ field: 'contractAddress', value: '[object]' });
        });

        it('巨大な数字列の金額を即座に拒否し、メッセージとdetailsを切り詰める', () => {
            const amount = '1'.repeat(1_000_000);
            const start = Date.now();
            const error = catchError(() => encodeEIP681(CONTRACT, RECIPIENT, amount, 137));
            expect(Date.now() - start).toBeLessThan(500);
            expect(error.code).toBe('INVALID_AMOUNT');
            expect(error.message.length).toBeLessThan(200);
            expect(error.message).toContain('（全1000000文字）');
            const details = error.details as { field: string; value: string };
            expect(details.field).toBe('amount');
            expect(details.value).toBe(`${'1'.repeat(100)}…（全1000000文字）`);
        });
    });

    describe('decodeEIP681 正常系', () => {
        it('EIP-681 URIの各部をデコードできる', () => {
            expect(
                decodeEIP681(
                    `ethereum:${CONTRACT}@137/transfer?address=${RECIPIENT}&uint256=1000000000000000000`
                )
            ).toEqual({
                scheme: 'ethereum',
                contractAddress: CONTRACT,
                chainId: 137,
                functionName: 'transfer',
                recipientAddress: RECIPIENT,
                amount: '1000000000000000000',
            });
        });

        it('大文字のスキームを受け付け、ethereumに正規化する', () => {
            expect(decodeEIP681(buildURI({ scheme: 'ETHEREUM' })).scheme).toBe('ethereum');
            expect(decodeEIP681(buildURI({ scheme: 'Ethereum' })).scheme).toBe('ethereum');
        });

        it("'pay-' プレフィックスを除去する", () => {
            const decoded = decodeEIP681(buildURI({ target: `pay-${CONTRACT}` }));
            expect(decoded.contractAddress).toBe(CONTRACT);
        });

        it('小文字のアドレスをチェックサム形式に正規化する', () => {
            const decoded = decodeEIP681(
                buildURI({
                    target: CONTRACT_LOWER,
                    query: `?address=${CONTRACT_LOWER}&uint256=1`,
                })
            );
            expect(decoded.contractAddress).toBe(CONTRACT);
            expect(decoded.recipientAddress).toBe(CONTRACT);
        });

        it('パラメータの順序が逆でもデコードできる', () => {
            const decoded = decodeEIP681(buildURI({ query: `?uint256=5&address=${RECIPIENT}` }));
            expect(decoded.recipientAddress).toBe(RECIPIENT);
            expect(decoded.amount).toBe('5');
        });

        it.each([
            ['1000', '1000'],
            ['1e18', '1000000000000000000'],
            ['1E18', '1000000000000000000'],
            ['1.5e18', '1500000000000000000'],
            ['0.5e1', '5'],
            ['1.0', '1'],
            ['1.000e0', '1'],
            ['12.50e1', '125'],
            ['1e0', '1'],
            [MAX_UINT256, MAX_UINT256],
        ])('uint256 %j を %j に正規化する', (value, expected) => {
            expect(
                decodeEIP681(buildURI({ query: `?address=${RECIPIENT}&uint256=${value}` })).amount
            ).toBe(expected);
        });

        it('巨大なチェーンIDでも安全な整数の範囲なら受け付ける', () => {
            const chainId = Number.MAX_SAFE_INTEGER;
            expect(decodeEIP681(buildURI({ chain: `@${chainId}` })).chainId).toBe(chainId);
        });
    });

    describe('decodeEIP681 異常系', () => {
        it('文字列以外の入力を INVALID_URI で拒否する', () => {
            expectDecodeFailure(undefined, { kind: 'INVALID_URI', uri: 'undefined' }, '文字列');
            expectDecodeFailure(null, { kind: 'INVALID_URI', uri: 'null' }, '文字列');
            expectDecodeFailure(123, { kind: 'INVALID_URI', uri: '123' }, '文字列');
            // 呼び出し側のtoStringを実行しない
            expectDecodeFailure(
                {
                    toString() {
                        throw new Error('boom');
                    },
                },
                { kind: 'INVALID_URI', uri: '[object]' }
            );
            expectDecodeFailure(Object.create(null), { kind: 'INVALID_URI', uri: '[object]' });
        });

        it('長すぎるURIを拒否し、details.uri を切り詰める', () => {
            const uri = buildURI({ query: `?address=${RECIPIENT}&uint256=${'1'.repeat(2048)}` });
            const details = expectDecodeFailure(uri, { kind: 'INVALID_URI' }, '長すぎ');
            expect(details.uri).toBe(`${uri.slice(0, 256)}…（全${uri.length}文字）`);
        });

        it('数MBの入力でも details.uri とメッセージは短い', () => {
            const uri = `ethereum:${'a'.repeat(5_000_000)}`;
            const error = catchError(() => decodeEIP681(uri));
            expect(error.message.length).toBeLessThan(200);
            expect((error.details as EIP681DecodeErrorDetails).uri).toBe(
                `${'ethereum:'}${'a'.repeat(256 - 9)}…（全${uri.length}文字）`
            );
        });

        it('内部エラーオブジェクトを details に含めない', () => {
            const error = catchError(() =>
                decodeEIP681(buildURI({ target: CONTRACT_BAD_CHECKSUM }))
            );
            expect(error.details).not.toHaveProperty('error');
            expect(JSON.parse(JSON.stringify(error))).toMatchObject({
                code: 'ENCODING_FAILED',
                details: { kind: 'CHECKSUM_MISMATCH' },
            });
        });

        // 125文字のURI（禁止文字を前後に付けて位置を確認する）
        const BASE = buildURI({ query: `?address=${RECIPIENT}&uint256=1` });
        const SPACE = 'URIに空白が含まれています';
        const INVISIBLE = 'URIに制御文字などの見えない文字が含まれています';

        it.each([
            [
                '末尾の半角スペース',
                `${BASE} `,
                `${SPACE}（126文字目（末尾）: 半角スペース U+0020）。前後の空白を取り除いてください`,
                undefined,
            ],
            [
                '先頭の半角スペース',
                ` ${BASE}`,
                `${SPACE}（1文字目（先頭）: 半角スペース U+0020）。前後の空白を取り除いてください`,
                undefined,
            ],
            [
                '途中のタブ',
                buildURI({ query: `?address=${RECIPIENT}&uint256=\t1` }),
                `${SPACE}（125文字目: タブ U+0009）。空白を取り除いてください`,
                buildURI({ query: `?address=${RECIPIENT}&uint256=\\t1` }),
            ],
            ['改行', `${BASE}\n`, `${SPACE}（126文字目（末尾）: 改行 U+000A）`, `${BASE}\\n`],
            [
                '全角スペース',
                `${BASE}　`,
                `${SPACE}（126文字目（末尾）: 全角スペース U+3000）`,
                `${BASE}\\u3000`,
            ],
            [
                'NUL',
                `${BASE}\u0000`,
                `${INVISIBLE}（126文字目（末尾）: NUL U+0000）。取り除いてください`,
                `${BASE}\\u0000`,
            ],
            [
                'DEL',
                `${BASE}\u007f`,
                `${INVISIBLE}（126文字目（末尾）: DEL U+007F）`,
                `${BASE}\\u007F`,
            ],
            [
                'C1制御文字',
                `${BASE}\u0085`,
                `${INVISIBLE}（126文字目（末尾）: 制御文字 U+0085）`,
                `${BASE}\\u0085`,
            ],
            [
                'ゼロ幅スペース',
                `${BASE}\u200B`,
                `${INVISIBLE}（126文字目（末尾）: ゼロ幅スペース U+200B）`,
                `${BASE}\\u200B`,
            ],
            [
                '双方向制御文字',
                `${BASE}\u202E`,
                `${INVISIBLE}（126文字目（末尾）: 双方向制御文字 U+202E）`,
                `${BASE}\\u202E`,
            ],
            [
                'フラグメント（金額の直後）',
                `${BASE}#x`,
                'URIに # が含まれています（126文字目）。# 以降（フラグメント）には対応していないため、取り除いてください',
                undefined,
            ],
        ])(
            '%sを含むURIを INVALID_URI で拒否し、位置と文字名を示す',
            (_label, uri, reason, shown) => {
                // details.uri では見えない文字を \n や \u0000 のように表示する
                expectDecodeFailure(uri, { kind: 'INVALID_URI', uri: shown ?? uri }, reason);
            }
        );

        it.each([
            ['スキームの全角 e', buildURI({ scheme: 'ｅthereum' }), "1文字目（先頭）: 'ｅ' U+FF45"],
            [
                '金額の全角数字',
                buildURI({ query: `?address=${RECIPIENT}&uint256=１００` }),
                "125文字目: '１' U+FF11",
            ],
            [
                'アドレス中のキリル文字の а',
                buildURI({ target: CONTRACT.replace('a', 'а') }),
                "20文字目: 'а' U+0430",
            ],
            ['絵文字（サロゲートペア）', `${BASE}😀`, "126文字目（末尾）: '😀' U+1F600"],
        ])(
            '%sを含むURIを INVALID_URI で拒否し、ASCII以外の文字を特定する',
            (_label, uri, where) => {
                expectDecodeFailure(
                    uri,
                    { kind: 'INVALID_URI' },
                    `URIに全角文字などのASCII以外の文字が含まれています（${where}）。半角の英数字・記号で入力してください`
                );
            }
        );

        it('? が2つ以上あるURIを INVALID_URI で拒否し、2つ目の位置を示す', () => {
            expectDecodeFailure(
                `${BASE}?x=1`,
                { kind: 'INVALID_URI' },
                'URIに ? が2つ以上含まれています（2つ目の ? は126文字目）。クエリパラメータは最初の ? の後に & で区切って指定してください'
            );
        });

        it('ethereum以外のスキームを UNSUPPORTED_SCHEME で拒否する', () => {
            expectDecodeFailure(
                buildURI({ scheme: 'bitcoin' }),
                { kind: 'UNSUPPORTED_SCHEME', value: 'bitcoin' },
                'スキームがethereumではありません: bitcoin（このライブラリは ethereum: で始まるURIのみ対応）'
            );
            expectDecodeFailure(buildURI({ scheme: 'ethereumx' }), {
                kind: 'UNSUPPORTED_SCHEME',
                value: 'ethereumx',
            });
            expectDecodeFailure(buildURI({ scheme: '' }), {
                kind: 'UNSUPPORTED_SCHEME',
                value: '',
            });
        });

        it('スキームのない文字列を INVALID_URI で拒否する', () => {
            expectDecodeFailure('invalid-uri', { kind: 'INVALID_URI' }, 'スキームがありません');
        });

        it('アドレス形式でないtargetを INVALID_ADDRESS で拒否する', () => {
            expectDecodeFailure(
                'ethereum:hello@137/transfer?address=world&uint256=abc',
                { kind: 'INVALID_ADDRESS', name: 'target', value: 'hello' },
                'コントラクトアドレスが0x + 40桁の16進数ではありません: hello'
            );
            for (const [target, reason] of <[string, string | undefined][]>[
                // ENS名は非対応
                ['jpyc.eth', '（ENS名には対応していません）'],
                [CONTRACT.slice(0, -1), '（0x の後が39桁です）'],
                [`${CONTRACT}0`, '（0x の後が41桁です）'],
                [CONTRACT.slice(2), '（先頭に 0x を付けてください）'],
                [
                    `0x${'g'.repeat(40)}`,
                    '（0x の後に16進数（0-9, a-f, A-F）以外の文字が含まれています）',
                ],
                [`PAY-${CONTRACT}`, undefined],
                [`pay-pay-${CONTRACT}`, undefined],
                ['', 'コントラクトアドレスが空です（0x + 40桁の16進数で指定してください）'],
            ]) {
                expectDecodeFailure(
                    buildURI({ target }),
                    { kind: 'INVALID_ADDRESS', name: 'target', value: target },
                    reason
                );
            }
        });

        it('チェックサム不一致のアドレスを CHECKSUM_MISMATCH で拒否する', () => {
            expectDecodeFailure(
                buildURI({ target: CONTRACT_BAD_CHECKSUM }),
                { kind: 'CHECKSUM_MISMATCH', name: 'target', value: CONTRACT_BAD_CHECKSUM },
                `コントラクトアドレスのEIP-55チェックサムが一致しません: ${CONTRACT_BAD_CHECKSUM}`
            );
            expectDecodeFailure(buildURI({ target: `pay-${CONTRACT_BAD_CHECKSUM}` }), {
                kind: 'CHECKSUM_MISMATCH',
                name: 'target',
                value: `pay-${CONTRACT_BAD_CHECKSUM}`,
            });
            expectDecodeFailure(
                buildURI({ query: `?address=${CONTRACT_BAD_CHECKSUM}&uint256=1` }),
                { kind: 'CHECKSUM_MISMATCH', name: 'address', value: CONTRACT_BAD_CHECKSUM },
                '受取アドレス（address）のEIP-55チェックサムが一致しません'
            );
        });

        it('chain_idの省略を MISSING_PARAM（chain_id）で拒否する', () => {
            const details = expectDecodeFailure(
                buildURI({ chain: '' }),
                { kind: 'MISSING_PARAM', name: 'chain_id' },
                'チェーンIDがありません（誤ったチェーンでの送金を防ぐため必須です。コントラクトアドレスの後に @137 のように指定してください）'
            );
            expect(details).not.toHaveProperty('value');
        });

        it.each([
            ['@', '', 'チェーンIDが空です'],
            ['@0', '0', 'チェーンIDは1以上である必要があります: 0'],
            ['@0137', '0137', 'チェーンIDに先頭ゼロは使えません: 0137'],
            ['@00', '00', 'チェーンIDに先頭ゼロは使えません: 00'],
            ['@-1', '-1', 'チェーンIDが10進数の正の整数ではありません: -1'],
            ['@+1', '+1', 'チェーンIDが10進数の正の整数ではありません'],
            ['@1.0', '1.0', 'チェーンIDが10進数の正の整数ではありません'],
            ['@0x89', '0x89', 'チェーンIDが10進数の正の整数ではありません: 0x89'],
            [
                '@137@1',
                '137@1',
                'チェーンIDが10進数の正の整数ではありません: 137@1（@ が2つ以上含まれています）',
            ],
            ['@%31', '%31', '%31（パーセントエンコードには対応していません）'],
            ['@9007199254740993', '9007199254740993', 'チェーンIDが大きすぎます'],
            [`@${'9'.repeat(30)}`, '9'.repeat(30), 'チェーンIDが大きすぎます'],
        ])(
            '不正なchain_id %j を INVALID_CHAIN_ID で拒否する（丸めない）',
            (chain, value, reason) => {
                expectDecodeFailure(
                    buildURI({ chain }),
                    { kind: 'INVALID_CHAIN_ID', value },
                    reason
                );
            }
        );

        it.each([
            ['関数部分なし', buildURI({ fn: '' })],
            ['関数部分が空', buildURI({ fn: '/' })],
            ['ネイティブ通貨の送金', `ethereum:${CONTRACT}@137?value=1e18`],
            ['クエリもなし', `ethereum:${CONTRACT}@137`],
        ])(
            '関数呼び出しがないURI（%s）を UNSUPPORTED_FUNCTION（name: ""）で拒否する',
            (_label, uri) => {
                expectDecodeFailure(
                    uri,
                    { kind: 'UNSUPPORTED_FUNCTION', name: '' },
                    // 正しい形式を示す
                    '関数名がありません（関数のないURIはネイティブ通貨の送金を表します）。ERC20の送金URIは ethereum:<コントラクトアドレス>@<チェーンID>/transfer?address=<受取アドレス>&uint256=<Wei単位の金額> の形式です'
                );
            }
        );

        it.each([
            ['approve', '（このライブラリはERC20のtransferのみ対応）'],
            ['Transfer', '（関数名は小文字の transfer で指定してください）'],
            ['transfer/', '（このライブラリはERC20のtransferのみ対応）'],
            ['transferFrom', '（このライブラリはERC20のtransferのみ対応）'],
            ['transf%65r', '（パーセントエンコードには対応していません）'],
        ])('transfer以外の関数名 %j を UNSUPPORTED_FUNCTION で拒否する', (name, hint) => {
            expectDecodeFailure(
                buildURI({ fn: `/${name}` }),
                { kind: 'UNSUPPORTED_FUNCTION', name },
                `関数名がtransferではありません: ${name}${hint}`
            );
        });

        it('クエリのないURIを MISSING_PARAM（address）で拒否する', () => {
            expectDecodeFailure(buildURI({ query: '' }), {
                kind: 'MISSING_PARAM',
                name: 'address',
            });
        });

        it.each([
            ['?', '?の後が空です'],
            [`?address=${RECIPIENT}&`, '空のパラメータがあります'],
            [`?&address=${RECIPIENT}&uint256=1`, '空のパラメータがあります'],
            [`?address=${RECIPIENT}&&uint256=1`, '空のパラメータがあります'],
            [`?address=${RECIPIENT}&uint256`, 'uint256（key=value の形式で指定してください）'],
            [`?address=${RECIPIENT}&=1`, '=1（パラメータ名がありません）'],
            [`?address=${RECIPIENT}&uint256=1=2`, 'uint256=1=2（値に=が含まれています）'],
        ])('不正な形式のクエリ %j を INVALID_URI で拒否する', (query, reason) => {
            expectDecodeFailure(
                buildURI({ query }),
                { kind: 'INVALID_URI' },
                `クエリパラメータの形式が不正です: ${reason}`
            );
        });

        it('重複したパラメータを DUPLICATE_PARAM で拒否する（先勝ちにしない）', () => {
            expectDecodeFailure(
                buildURI({ query: `?address=${RECIPIENT}&uint256=1&uint256=999` }),
                { kind: 'DUPLICATE_PARAM', name: 'uint256' },
                'クエリパラメータ uint256 が重複しています'
            );
            expectDecodeFailure(
                buildURI({ query: `?address=${RECIPIENT}&address=${CONTRACT}&uint256=1` }),
                { kind: 'DUPLICATE_PARAM', name: 'address' },
                'クエリパラメータ address が重複しています'
            );
        });

        it.each([
            ['value', 'ネイティブ通貨の送金を伴うため'],
            ['gas', 'ガスの指定はウォレットに任せるため'],
            ['gasPrice', 'ガスの指定はウォレットに任せるため'],
            ['gasLimit', 'ガスの指定はウォレットに任せるため'],
            ['__proto__', '対応しているのは address と uint256 のみです'],
            ['constructor', '対応しているのは address と uint256 のみです'],
            ['Address', 'パラメータ名は小文字で指定してください'],
            ['to', '対応しているのは address と uint256 のみです'],
            [
                'addr%65ss',
                'パーセントエンコードは使えません。address と uint256 はそのまま記述してください',
            ],
        ])('未対応のパラメータ %j を UNSUPPORTED_PARAM で拒否する', (key, why) => {
            expectDecodeFailure(
                buildURI({ query: `?address=${RECIPIENT}&uint256=1&${key}=1` }),
                { kind: 'UNSUPPORTED_PARAM', name: key },
                `クエリパラメータ ${key} には対応していません（${why}）`
            );
        });

        it('必須パラメータの欠落を MISSING_PARAM で拒否する', () => {
            expectDecodeFailure(
                buildURI({ query: '?uint256=1' }),
                { kind: 'MISSING_PARAM', name: 'address' },
                '受取アドレス（クエリパラメータ address）がありません（ethereum:<コントラクトアドレス>@<チェーンID>/transfer?address=<受取アドレス>&uint256=<Wei単位の金額> の形式で指定してください）'
            );
            expectDecodeFailure(
                buildURI({ query: `?address=${RECIPIENT}` }),
                { kind: 'MISSING_PARAM', name: 'uint256' },
                '金額（クエリパラメータ uint256）がありません'
            );
        });

        it('アドレス形式でない受取アドレスを INVALID_ADDRESS で拒否する', () => {
            const label = '受取アドレス（address）';
            for (const [address, reason] of [
                ['world', `${label}が0x + 40桁の16進数ではありません: world`],
                [`pay-${RECIPIENT}`, `${label}が0x + 40桁の16進数ではありません: pay-`],
                [RECIPIENT.replace('0x', '0x%31'), '（パーセントエンコードには対応していません）'],
                ['alice.eth', '（ENS名には対応していません）'],
                ['', `${label}が空です（0x + 40桁の16進数で指定してください）`],
            ]) {
                expectDecodeFailure(
                    buildURI({ query: `?address=${address}&uint256=1` }),
                    { kind: 'INVALID_ADDRESS', name: 'address', value: address },
                    reason
                );
            }
        });

        it('空の uint256 を INVALID_AMOUNT で拒否する', () => {
            expectDecodeFailure(
                buildURI({ query: `?address=${RECIPIENT}&uint256=` }),
                { kind: 'INVALID_AMOUNT', name: 'uint256', value: '' },
                '金額（uint256）が空です'
            );
        });

        it.each([
            ['abc'],
            ['.5'],
            ['1.'],
            ['1.e18'],
            ['1e'],
            ['1e+18'],
            ['1e-18'],
            ['0x10'],
            ['1_000'],
        ])('不正な形式の uint256 %j を INVALID_AMOUNT で拒否する', (value) => {
            expectDecodeFailure(
                buildURI({ query: `?address=${RECIPIENT}&uint256=${value}` }),
                { kind: 'INVALID_AMOUNT', name: 'uint256', value },
                `金額（uint256）の形式が不正です: ${value}（10進数、または 1.5e18 のような指数表記で指定してください。符号・16進数は使えません）`
            );
        });

        it.each([
            ['-1', '金額（uint256）に負の数は使えません: -1'],
            ['+1', '金額（uint256）に符号（+）は付けられません: +1'],
            ['01000', '金額（uint256）に先頭ゼロは使えません: 01000'],
            ['00', '金額（uint256）に先頭ゼロは使えません: 00'],
            [
                '1%30',
                '金額（uint256）の形式が不正です: 1%30（パーセントエンコードには対応していません）',
            ],
            [
                '1%ZZ',
                '金額（uint256）の形式が不正です: 1%ZZ（パーセントエンコードには対応していません）',
            ],
            [
                '%2B1',
                '金額（uint256）の形式が不正です: %2B1（パーセントエンコードには対応していません）',
            ],
        ])('uint256 %j を INVALID_AMOUNT で拒否し、原因を特定する', (value, reason) => {
            expectDecodeFailure(
                buildURI({ query: `?address=${RECIPIENT}&uint256=${value}` }),
                { kind: 'INVALID_AMOUNT', name: 'uint256', value },
                reason
            );
        });

        it.each([['1.5'], ['1.25e1'], ['1.0000000000000000001e18'], ['0.00000000001e10']])(
            '整数にならない uint256 %j を INVALID_AMOUNT で拒否する',
            (value) => {
                expectDecodeFailure(
                    buildURI({ query: `?address=${RECIPIENT}&uint256=${value}` }),
                    { kind: 'INVALID_AMOUNT', name: 'uint256', value },
                    `金額（uint256）が整数ではありません: ${value}`
                );
            }
        );

        it.each([['0'], ['0e5'], ['0.0'], ['0.000e3']])(
            '0の uint256 %j を INVALID_AMOUNT で拒否する',
            (value) => {
                expectDecodeFailure(
                    buildURI({ query: `?address=${RECIPIENT}&uint256=${value}` }),
                    { kind: 'INVALID_AMOUNT', name: 'uint256', value },
                    '0より大きい'
                );
            }
        );

        it('指数が極端に長くても0の uint256 は0として拒否する', () => {
            const value = `0e${'9'.repeat(400)}`;
            expectDecodeFailure(
                buildURI({ query: `?address=${RECIPIENT}&uint256=${value}` }),
                {
                    kind: 'INVALID_AMOUNT',
                    name: 'uint256',
                    value: `${value.slice(0, 100)}…（全402文字）`,
                },
                '0より大きい'
            );
        });

        it.each([
            [(1n << 256n).toString()],
            ['1e78'],
            ['1e79'],
            ['0.1e79'],
            ['1e1000000000'],
            [`1e${'9'.repeat(400)}`],
            [`1e${'9'.repeat(1900)}`],
            [`1${'0'.repeat(1900)}`],
        ])(
            'uint256の最大値を超える %s を INVALID_AMOUNT で拒否する（巨大なBigInt計算をしない）',
            (value) => {
                const start = Date.now();
                const details = expectDecodeFailure(
                    buildURI({ query: `?address=${RECIPIENT}&uint256=${value}` }),
                    { kind: 'INVALID_AMOUNT', name: 'uint256' },
                    '最大値（2^256-1）を超えています'
                );
                expect(Date.now() - start).toBeLessThan(500);
                expect(details.value?.length).toBeLessThanOrEqual(120);
            }
        );

        it.each([
            ['0.00000000001e79', `1${'0'.repeat(68)}`],
            ['0.1e78', `1${'0'.repeat(77)}`],
            ['100e75', `1${'0'.repeat(77)}`],
            [`0.${'0'.repeat(100)}1e101`, '1'],
            [`${MAX_UINT256.slice(0, -2)}.${MAX_UINT256.slice(-2)}e2`, MAX_UINT256],
        ])('指数と小数を合わせて範囲内になる uint256 %j を受理する', (value, expected) => {
            expect(
                decodeEIP681(buildURI({ query: `?address=${RECIPIENT}&uint256=${value}` })).amount
            ).toBe(expected);
        });

        it('長い値は details.value とメッセージで切り詰める', () => {
            const value = `${'1'.repeat(1500)}x`;
            const details = expectDecodeFailure(
                buildURI({ query: `?address=${RECIPIENT}&uint256=${value}` }),
                { kind: 'INVALID_AMOUNT', name: 'uint256' }
            );
            expect(details.value).toBe(`${'1'.repeat(100)}…（全1501文字）`);
            expect(details.reason.length).toBeLessThan(300);
        });

        it('最大長付近の悪意ある入力でも速やかに失敗する', () => {
            const inputs = [
                `ethereum:${'@'.repeat(2030)}`,
                `ethereum:${CONTRACT}@137/transfer?${'a=1&'.repeat(480)}`,
                buildURI({ query: `?address=${RECIPIENT}&uint256=1.${'0'.repeat(1900)}1` }),
                buildURI({ query: `?address=${RECIPIENT}&uint256=${'1'.repeat(1900)}x` }),
            ];
            const start = Date.now();
            for (const uri of inputs) {
                expectDecodeFailure(uri);
            }
            expect(Date.now() - start).toBeLessThan(1000);
        });
    });
});
