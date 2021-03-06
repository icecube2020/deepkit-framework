import 'jest';
import {createClassDecoratorContext, createFreeDecoratorContext, createPropertyDecoratorContext, mergeDecorator} from '../src/decorator-builder';
import {entity, getClassSchema, t} from '../index';

test('without host', () => {
    class Dec1Model {
        name: string = '';
    }

    const dec1 = createFreeDecoratorContext(
        class {
            t = new Dec1Model;

            name(name: string) {
                this.t.name = name;
            };
        }
    );

    {
        const c2 = dec1.name('Peter')();
        expect(c2).toBeInstanceOf(Dec1Model)
        expect(c2.name).toBe('Peter');
    }

    {
        const c2 = dec1();
        expect(c2).toBeInstanceOf(Dec1Model)
        expect(c2.name).toBe('');
    }
});

test('collapsing correcly', () => {
    class ArgDefinition {
        optional: boolean = false;
        default?: any;
    }

    const dec1 = createFreeDecoratorContext(
        class {
            t = new ArgDefinition;

            get optional() {
                this.t.optional = true;
                return;
            }

            default(value: any) {
                this.t.default = value;
            }

        }
    );

    {
        const c2 = dec1.optional.default('Peter')();
        expect(c2).toBeInstanceOf(ArgDefinition)
        expect(c2.default).toBe('Peter');
    }

    {
        const c2 = dec1.optional();
        expect(c2).toBeInstanceOf(ArgDefinition)
        expect(c2.default).toBe(undefined);
    }
});

test('inheritance', () => {
    class Dec1Model {
        name: string = '';
    }

    class A {
        t = new Dec1Model();

        methodA() {

        }
    }


    class B extends A {
        methodB() {

        }
    }

    const dec1 = createFreeDecoratorContext(B);

    {
        const r = dec1.methodB()();
        expect(r).toBeInstanceOf(Dec1Model)
    }

    {
        const r = dec1.methodA()();
        expect(r).toBeInstanceOf(Dec1Model)
    }
});


test('merge', () => {
    const dec1 = createClassDecoratorContext(
        class {
            t = new class {
                name = '';
            };

            name(name: string) {
                this.t.name = name;
            };
        }
    );

    const dec2 = createClassDecoratorContext(
        class {
            t = new class {
                title = '';
            };

            title(name: string) {
                this.t.title = name;
            };
        }
    );

    const dec3 = mergeDecorator(dec1, dec2);

    @dec3.name('myName')
    class Peter {

    }

    expect(dec1._fetch(Peter)!.name).toBe('myName');
    expect(dec2._fetch(Peter)).toBe(undefined);

    @dec3.title('myTitle')
    class Peter2 {

    }

    expect(dec1._fetch(Peter)!.name).toBe('myName');
    expect(dec1._fetch(Peter2)).toBe(undefined);
    expect(dec2._fetch(Peter)).toBe(undefined);
    expect(dec2._fetch(Peter2)!.title).toBe('myTitle');
});

test('basic', () => {
    class EntityInfo {
        name: string = '';
        title: string = '';
    }

    const dec = createClassDecoratorContext(
        class {
            t = new EntityInfo;

            name(name: string) {
                this.t.name = name;
            };

            title(title: string) {
                this.t.title = title;
            };
        }
    );

    @dec.name('peter')
    class Peter {
    }

    expect(dec._fetch(Peter)).toBeInstanceOf(EntityInfo);
    expect(dec._fetch(Peter)!.name).toBe('peter');

    @dec
    class Peter2 {

    }

    expect(dec._fetch(Peter2)).toBeInstanceOf(EntityInfo);
    expect(dec._fetch(Peter2)!.name).toBe('');

    @dec.name('peter').title('asd')
    class Peter3 {

    }

    expect(dec._fetch(Peter3)).toBeInstanceOf(EntityInfo);
    expect(dec._fetch(Peter3)!.name).toBe('peter');
    expect(dec._fetch(Peter3)!.title).toBe('asd');
});

test('basic magic property', () => {
    class EntityInfo {
        name: string = '';
        important = false;
    }

    const dec = createClassDecoratorContext(
        class {
            t = new EntityInfo;

            name(name: string) {
                this.t.name = name;
            }

            get important() {
                return this.t.important = true;
            }
        }
    );

    @dec.important
    class Peter2 {

    }

    expect(dec._fetch(Peter2)).toBeInstanceOf(EntityInfo);
    expect(dec._fetch(Peter2)!.name).toBe('');
    expect(dec._fetch(Peter2)!.important).toBe(true);

    @dec.important.name('peter3')
    class Peter3 {

    }

    expect(dec._fetch(Peter3)).toBeInstanceOf(EntityInfo);
    expect(dec._fetch(Peter3)!.name).toBe('peter3');
    expect(dec._fetch(Peter3)!.important).toBe(true);

    {
        @dec.name('peter4').important
        class Peter4 {

        }

        expect(dec._fetch(Peter4)).toBeInstanceOf(EntityInfo);
        expect(dec._fetch(Peter4)!.name).toBe('peter4');
        expect(dec._fetch(Peter4)!.important).toBe(true);
    }

    {
        @dec.name('peter4')
        @dec.important
        class Peter4 {

        }

        expect(dec._fetch(Peter4)).toBeInstanceOf(EntityInfo);
        expect(dec._fetch(Peter4)!.name).toBe('peter4');
        expect(dec._fetch(Peter4)!.important).toBe(true);
    }
});

test('basic multiple', () => {
    class EntityInfo {
        name: string = '';
    }

    const dec = createClassDecoratorContext(
        class {
            t = new EntityInfo;

            name(name: string) {
                this.t.name = name;
            }
        }
    );

    @dec.name('peter')
    class Peter {
    }

    @dec.name('peter2')
    class Peter2 {
    }


    @dec.name('peter3')
    class Peter3 {
    }

    expect(dec._fetch(Peter)).toBeInstanceOf(EntityInfo);
    expect(dec._fetch(Peter)!.name).toBe('peter');

    expect(dec._fetch(Peter2)).toBeInstanceOf(EntityInfo);
    expect(dec._fetch(Peter2)!.name).toBe('peter2');

    expect(dec._fetch(Peter3)).toBeInstanceOf(EntityInfo);
    expect(dec._fetch(Peter3)!.name).toBe('peter3');
});

test('basic property', () => {
    class PropertyInfo {
        important = false;

        constructor(
            public name: string = ''
        ) {
        }
    }

    const dec = createPropertyDecoratorContext(
        class {
            t = new PropertyInfo;

            name(name: string) {
                this.t.name = name;
            }

            get important() {
                return this.t.important = true;
            }
        }
    );

    {
        class Peter {
            @dec name!: string;
        }

        expect(dec._fetch(Peter, 'name')).toBeInstanceOf(PropertyInfo);
        expect(dec._fetch(Peter, 'name')!.name).toBe('');
        expect(dec._fetch(Peter, 'name')!.important).toBe(false);
    }

    {
        class Peter {
            @dec.name('peter') name!: string;
        }

        expect(dec._fetch(Peter, 'name')).toBeInstanceOf(PropertyInfo);
        expect(dec._fetch(Peter, 'name')!.name).toBe('peter');
        expect(dec._fetch(Peter, 'name')!.important).toBe(false);
    }

    {
        class Peter {
            @dec.important name!: string;
        }

        expect(dec._fetch(Peter, 'name')).toBeInstanceOf(PropertyInfo);
        expect(dec._fetch(Peter, 'name')!.name).toBe('');
        expect(dec._fetch(Peter, 'name')!.important).toBe(true);
    }

    {
        class Peter {
            @dec.important.name('peter') name!: string;
        }

        expect(dec._fetch(Peter, 'name')).toBeInstanceOf(PropertyInfo);
        expect(dec._fetch(Peter, 'name')!.name).toBe('peter');
        expect(dec._fetch(Peter, 'name')!.important).toBe(true);
    }

    {
        class Peter {
            @dec.important
            @dec.name('peter')
            name!: string;
        }

        expect(dec._fetch(Peter, 'name')).toBeInstanceOf(PropertyInfo);
        expect(dec._fetch(Peter, 'name')!.name).toBe('peter');
        expect(dec._fetch(Peter, 'name')!.important).toBe(true);
    }
});

test('@entity', () => {
    @entity.name('book')
    class Book {
        constructor(
            @t.primary public id: number,
            @t public name: string,
        ) {
        }
    }

    const book = getClassSchema(Book);
    expect(book.name).toBe('book');
});