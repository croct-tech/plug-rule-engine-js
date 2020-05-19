import {PluginSdk} from '@croct/plug/plugin';
import {Logger, SessionFacade, Tab, UserFacade} from '@croct/plug/sdk';
import EvaluatorFacade from '@croct/sdk/facade/evaluatorFacade';
import TrackerFacade from '@croct/sdk/facade/trackerFacade';
import {Extension} from '../src/extension';
import {Definitions, RuleEnginePlugin} from '../src/plugin';
import {Constant, Variable} from '../src/predicate';
import {Rule} from '../src/rule';
import 'jest-extended';

beforeEach(() => {
    // eslint-disable-next-line
    RuleEnginePlugin['extensionRegistry'] = {};
    window.history.replaceState({}, 'Home Page', '/homepage');
});

function createPluginSdkMock(): PluginSdk {
    const {
        default: EvaluatorMock,
    } = jest.genMockFromModule<{default: {new(): EvaluatorFacade}}>('@croct/sdk/facade/evaluatorFacade');

    const {
        default: TrackerMock,
    } = jest.genMockFromModule<{default: {new(): TrackerFacade}}>('@croct/sdk/facade/trackerFacade');

    const {
        default: SessionFacadeMock,
    } = jest.genMockFromModule<{default: {new(): SessionFacade}}>('@croct/sdk/facade/sessionFacade');

    const {
        default: UserFacadeMock,
    } = jest.genMockFromModule<{default: {new(): UserFacade}}>('@croct/sdk/facade/userFacade');

    const {
        default: TabMock,
    } = jest.genMockFromModule<{default: {new(): Tab}}>('@croct/sdk/tab');

    const sdk: PluginSdk = {
        evaluator: new EvaluatorMock(),
        session: new SessionFacadeMock(),
        tab: new TabMock(),
        tracker: new TrackerMock(),
        user: new UserFacadeMock(),
        getTabStorage: jest.fn(),
        getBrowserStorage: jest.fn(),
        getLogger: jest.fn().mockReturnValue(getLoggerMock()),
    };

    Object.defineProperty(sdk.tab, 'location', {
        value: window.location,
    });

    return sdk;
}

function getLoggerMock(): Logger {
    return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };
}

describe('A rule engine plugin', () => {
    test('should apply all steps matching a given path', async () => {
        const fooExtension: Extension = {
            apply: jest.fn(),
            getPredicate: jest.fn()
                .mockReturnValueOnce(new Constant(false))
                .mockReturnValueOnce(new Constant(true))
                .mockReturnValueOnce(new Constant(true)),
        };

        RuleEnginePlugin.extend('foo', () => fooExtension);

        const firstRule: Rule = {name: 'firstRule', properties: {}};
        const secondRule: Rule = {name: 'secondRule', properties: {}};
        const thirdRule: Rule = {name: 'thirdRule', properties: {}};
        const fourthRule: Rule = {name: 'fourthRule', properties: {}};

        const definitions: Definitions = {
            extensions: {
                foo: true,
            },
            pages: {
                'homepage\\?foo=bar#anchor': [
                    {
                        rules: [firstRule],
                    },
                    {
                        rules: [secondRule],
                    },
                ],
                page: [
                    {
                        rules: [thirdRule],
                    },
                ],
                other: [
                    {
                        rules: [fourthRule],
                    },
                ],
            },
        };

        const sdk: PluginSdk = createPluginSdkMock();
        const engine = new RuleEnginePlugin(definitions, sdk);

        window.history.replaceState({}, 'Home page', '/homepage?foo=bar#anchor');

        await engine.enable();

        expect(fooExtension.getPredicate).toHaveBeenCalledTimes(3);
        expect(fooExtension.getPredicate).toHaveBeenNthCalledWith(1, firstRule);
        expect(fooExtension.getPredicate).toHaveBeenNthCalledWith(2, secondRule);
        expect(fooExtension.getPredicate).toHaveBeenNthCalledWith(3, thirdRule);
        expect(fooExtension.apply).toHaveBeenCalledTimes(2);
        expect(fooExtension.apply).toHaveBeenNthCalledWith(1, secondRule, expect.anything());
        expect(fooExtension.apply).toHaveBeenNthCalledWith(2, thirdRule, expect.anything());
    });

    test('should run extensions considering their priority', async () => {
        const barExtension: Extension = {
            enable: jest.fn(),
            apply: jest.fn(),
            getPredicate: jest.fn().mockReturnValueOnce(new Constant(true)),
            getVariables: jest.fn(),
            disable: jest.fn(),
            getPriority: jest.fn().mockReturnValue(-2),
        };

        const quxExtension: Extension = {
            enable: jest.fn(),
            apply: jest.fn(),
            getPredicate: jest.fn().mockReturnValueOnce(new Constant(true)),
            getVariables: jest.fn(),
            disable: jest.fn(),
        };

        const fooExtension: Extension = {
            enable: jest.fn(),
            apply: jest.fn(),
            getPredicate: jest.fn().mockReturnValueOnce(new Constant(true)),
            getVariables: jest.fn(),
            disable: jest.fn(),
            getPriority: jest.fn().mockReturnValue(1),
        };

        const bazExtension: Extension = {
            enable: jest.fn(),
            apply: jest.fn(),
            getPredicate: jest.fn().mockReturnValueOnce(new Constant(true)),
            getVariables: jest.fn(),
            disable: jest.fn(),
            getPriority: jest.fn().mockReturnValue(2),
        };

        RuleEnginePlugin.extend('bar', () => barExtension);
        RuleEnginePlugin.extend('qux', () => quxExtension);
        RuleEnginePlugin.extend('foo', () => fooExtension);
        RuleEnginePlugin.extend('baz', () => bazExtension);

        const rule: Rule = {name: 'rule', properties: {}};

        const definitions: Definitions = {
            extensions: {
                foo: true,
                bar: true,
                baz: true,
                qux: true,
            },
            pages: {
                '/': [
                    {
                        rules: [rule],
                    },
                ],
            },
        };

        const sdk: PluginSdk = createPluginSdkMock();
        const engine = new RuleEnginePlugin(definitions, sdk);

        await engine.enable();
        await engine.disable();

        expect(barExtension.enable).toHaveBeenCalledBefore(quxExtension.enable as jest.Mock);
        expect(quxExtension.enable).toHaveBeenCalledBefore(fooExtension.enable as jest.Mock);
        expect(fooExtension.enable).toHaveBeenCalledBefore(bazExtension.enable as jest.Mock);

        expect(barExtension.apply).toHaveBeenCalledBefore(quxExtension.apply as jest.Mock);
        expect(quxExtension.apply).toHaveBeenCalledBefore(fooExtension.apply as jest.Mock);
        expect(fooExtension.apply).toHaveBeenCalledBefore(bazExtension.apply as jest.Mock);

        expect(barExtension.getPredicate).toHaveBeenCalledBefore(quxExtension.getPredicate as jest.Mock);
        expect(quxExtension.getPredicate).toHaveBeenCalledBefore(fooExtension.getPredicate as jest.Mock);
        expect(fooExtension.getPredicate).toHaveBeenCalledBefore(bazExtension.getPredicate as jest.Mock);

        expect(barExtension.getVariables).toHaveBeenCalledBefore(quxExtension.getVariables as jest.Mock);
        expect(quxExtension.getVariables).toHaveBeenCalledBefore(fooExtension.getVariables as jest.Mock);
        expect(fooExtension.getVariables).toHaveBeenCalledBefore(bazExtension.getVariables as jest.Mock);

        expect(barExtension.disable).toHaveBeenCalledBefore(quxExtension.disable as jest.Mock);
        expect(quxExtension.disable).toHaveBeenCalledBefore(fooExtension.disable as jest.Mock);
        expect(fooExtension.disable).toHaveBeenCalledBefore(bazExtension.disable as jest.Mock);
    });

    test('should apply rules which the predicate is satisfied', async () => {
        const fooExtension: Extension = {
            apply: jest.fn(),
            getPredicate: jest.fn()
                .mockReturnValueOnce(new Variable('a'))
                .mockReturnValueOnce(new Variable('b')),
            getVariables: jest.fn().mockReturnValueOnce({
                a: (): Promise<any> => Promise.resolve(false),
                b: (): Promise<any> => Promise.resolve(true),
            }),
        };

        RuleEnginePlugin.extend('foo', () => fooExtension);

        const firstRule: Rule = {name: 'firstRule', properties: {}};
        const secondRule: Rule = {name: 'secondRule', properties: {}};

        const definitions: Definitions = {
            extensions: {
                foo: true,
            },
            pages: {
                home: [
                    {
                        rules: [firstRule],
                    },
                    {
                        rules: [secondRule],
                    },
                ],
            },
        };

        const sdk: PluginSdk = createPluginSdkMock();
        const engine = new RuleEnginePlugin(definitions, sdk);

        await engine.enable();

        window.history.replaceState({}, 'Home page', '/homepage');

        expect(fooExtension.getPredicate).toHaveBeenCalledTimes(2);
        expect(fooExtension.getPredicate).toHaveBeenCalledWith(firstRule);
        expect(fooExtension.getPredicate).toHaveBeenCalledWith(secondRule);
        expect(fooExtension.apply).toHaveBeenCalledTimes(1);
        expect(fooExtension.apply).toHaveBeenLastCalledWith(secondRule, expect.anything());
    });

    test('should apply a single rule per set', async () => {
        const fooExtension: Extension = {
            apply: jest.fn(),
            getPredicate: jest.fn()
                .mockReturnValueOnce(new Constant(false))
                .mockReturnValueOnce(new Constant(true)),
        };

        RuleEnginePlugin.extend('foo', () => fooExtension);

        const firstRule: Rule = {name: 'firstRule', properties: {}};
        const secondRule: Rule = {name: 'secondRule', properties: {}};
        const thirdRule: Rule = {name: 'thirdRule', properties: {}};

        const definitions: Definitions = {
            extensions: {
                foo: true,
            },
            pages: {
                home: [
                    {
                        rules: [firstRule, secondRule, thirdRule],
                    },
                ],
            },
        };

        const sdk: PluginSdk = createPluginSdkMock();
        const engine = new RuleEnginePlugin(definitions, sdk);

        window.history.replaceState({}, 'Home page', '/homepage');

        await engine.enable();

        expect(fooExtension.getPredicate).toHaveBeenCalledTimes(2);
        expect(fooExtension.getPredicate).toHaveBeenCalledWith(firstRule);
        expect(fooExtension.getPredicate).toHaveBeenCalledWith(secondRule);
        expect(fooExtension.apply).toHaveBeenCalledTimes(1);
        expect(fooExtension.apply).toHaveBeenCalledWith(secondRule, expect.anything());
    });

    test('should combine predicates into a conjunction', async () => {
        const fooExtension: Extension = {
            apply: jest.fn(),
            disable: jest.fn(),
            enable: jest.fn(),
            getPredicate: jest.fn()
                .mockReturnValueOnce(new Constant(false))
                .mockReturnValueOnce(new Constant(true)),
            getVariables: jest.fn(),
        };

        const barExtension: Extension = {
            apply: jest.fn(),
            getPredicate: jest.fn()
                .mockReturnValueOnce(new Constant(true))
                .mockReturnValueOnce(new Constant(true)),
        };

        RuleEnginePlugin.extend('foo', () => fooExtension);
        RuleEnginePlugin.extend('bar', () => barExtension);

        const firstRule: Rule = {name: 'firstRule', properties: {}};
        const secondRule: Rule = {name: 'firstRule', properties: {}};

        const definitions: Definitions = {
            extensions: {
                foo: true,
                bar: true,
            },
            pages: {
                home: [
                    {
                        rules: [firstRule],
                    },
                    {
                        rules: [secondRule],
                    },
                ],
            },
        };

        const sdk: PluginSdk = createPluginSdkMock();
        const engine = new RuleEnginePlugin(definitions, sdk);

        window.history.replaceState({}, 'Home page', '/homepage');

        await engine.enable();

        expect(fooExtension.getPredicate).toHaveBeenCalledTimes(2);
        expect(fooExtension.getPredicate).toHaveBeenCalledWith(firstRule);
        expect(fooExtension.getPredicate).toHaveBeenCalledWith(secondRule);
        expect(barExtension.apply).toHaveBeenCalledTimes(1);
        expect(barExtension.apply).toHaveBeenCalledWith(secondRule, expect.anything());
    });

    test('should enable all registered extensions', async () => {
        const fooExtension: Extension = {
            enable: jest.fn(),
        };

        const barExtension: Extension = {
            enable: jest.fn().mockReturnValue(Promise.resolve()),
        };

        RuleEnginePlugin.extend('foo', () => fooExtension);
        RuleEnginePlugin.extend('bar', () => barExtension);

        const definitions: Definitions = {
            extensions: {
                foo: true,
                bar: true,
            },
            pages: {},
        };

        const sdk: PluginSdk = createPluginSdkMock();
        const engine = new RuleEnginePlugin(definitions, sdk);

        await engine.enable();

        expect(fooExtension.enable).toHaveBeenCalled();
        expect(barExtension.enable).toHaveBeenCalled();
    });

    test('should allow to disable all registered extensions', async () => {
        const fooExtension: Extension = {
            disable: jest.fn(),
        };

        const barExtension: Extension = {
            disable: jest.fn().mockReturnValue(Promise.resolve()),
        };

        const bazExtension: Extension = {};

        RuleEnginePlugin.extend('foo', () => fooExtension);
        RuleEnginePlugin.extend('bar', () => barExtension);
        RuleEnginePlugin.extend('baz', () => bazExtension);

        const definitions: Definitions = {
            extensions: {
                foo: true,
                bar: true,
                baz: true,
            },
            pages: {},
        };

        const sdk: PluginSdk = createPluginSdkMock();
        const engine = new RuleEnginePlugin(definitions, sdk);

        await engine.disable();

        expect(fooExtension.disable).toHaveBeenCalled();
        expect(barExtension.disable).toHaveBeenCalled();
    });

    test('should instantiate an isolated SDK for each extension', async () => {
        const sdk: PluginSdk = createPluginSdkMock();

        sdk.getLogger = jest.fn().mockReturnValue(getLoggerMock());
        sdk.getBrowserStorage = jest.fn().mockReturnValue(window.localStorage);
        sdk.getTabStorage = jest.fn().mockReturnValue(window.sessionStorage);

        const fooExtension = jest.fn().mockImplementation(({sdk: extensionSdk}) => {
            expect(extensionSdk.tracker).toBe(extensionSdk.tracker);
            expect(extensionSdk.evaluator).toBe(extensionSdk.evaluator);
            expect(extensionSdk.session).toBe(extensionSdk.session);
            expect(extensionSdk.user).toBe(extensionSdk.user);
            expect(extensionSdk.tab).toBe(extensionSdk.tab);

            extensionSdk.getBrowserStorage('browser');
            extensionSdk.getTabStorage('tab');
            extensionSdk.getLogger('logger');

            return {
                enable: jest.fn(),
            };
        });

        RuleEnginePlugin.extend('foo', fooExtension);

        const definitions: Definitions = {
            extensions: {
                foo: true,
            },
            pages: {
                '/': [
                    {
                        rules: [{name: 'someRule', properties: {}}],
                    },
                ],
            },
        };

        const engine = new RuleEnginePlugin(definitions, sdk);

        await engine.enable();

        expect(fooExtension).toHaveBeenCalled();
        expect(sdk.getTabStorage).toHaveBeenCalledWith('extension', 'foo', 'tab');
        expect(sdk.getBrowserStorage).toHaveBeenCalledWith('extension', 'foo', 'browser');
        expect(sdk.getLogger).toHaveBeenCalledWith('extension', 'foo', 'logger');
    });

    test('should log an error message if a registered extension is unknown', async () => {
        const definitions: Definitions = {
            extensions: {
                foo: true,
            },
            pages: {},
        };

        const sdk: PluginSdk = createPluginSdkMock();
        const engine = new RuleEnginePlugin(definitions, sdk);

        await engine.enable();

        const logger = sdk.getLogger();

        expect(logger.error).toHaveBeenCalledWith('Unknown extension "foo".');
    });
});
