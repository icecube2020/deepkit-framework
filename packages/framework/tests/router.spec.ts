import 'jest';
import 'reflect-metadata';
import {Router} from '../src/router';
import {HttpHandler} from '../src/http';
import {http} from '../src/decorator';
import {Application} from '../src/application';
import {ServiceContainer} from '../src/service-container';

test('router', () => {
    class Controller {
        @http.GET()
        helloWorld() {
        }

        @http.GET(':name')
        hello(name: string) {
        }

        @http.GET('/user/:id/static')
        userStatic(id: string) {
        }

        @http.GET('/user/:id/static2')
        userStatic2(id: string) {
        }

        @http.GET('/user/:id/static3')
        userStatic3(id: string) {
        }

        @http.GET('/user2/:id/static3')
        user2Static3(id: string) {
        }

        @http.GET('/static')
        static() {
        }
    }

    const router = Router.forControllers([Controller]);

    expect(router.resolve('GET', '/')).toEqual({controller: Controller, parameters: [], method: 'helloWorld'});
    expect(router.resolve('GET', '/peter')).toEqual({controller: Controller, parameters: ['peter'], method: 'hello'});
    expect(router.resolve('GET', '/user/1233/static')).toEqual({controller: Controller, parameters: ['1233'], method: 'userStatic'});
});

test('router parameters', async () => {
    class Controller {
        @http.GET('/user/:name')
        string(name: string) {
            return name;
        }

        @http.GET('/user-id/:id')
        number(id: number) {
            return id;
        }

        @http.GET('/boolean/:yes')
        boolean(yes: boolean) {
            return yes;
        }
    }

    const app = Application.root({controllers: [Controller]});
    ServiceContainer.assignStandaloneInjector([Controller]);
    const httpHandler = app.get(HttpHandler);

    expect(await httpHandler.handleRequestFor('GET', '/user/peter')).toBe('peter');
    expect(await httpHandler.handleRequestFor('GET', '/user-id/123')).toBe(123);
    await expect(httpHandler.handleRequestFor('GET', '/user-id/asd')).rejects.toThrow('Validation error');
    expect(await httpHandler.handleRequestFor('GET', '/boolean/1')).toBe(true);
    expect(await httpHandler.handleRequestFor('GET', '/boolean/false')).toBe(false);
});