import 'jest-extended';
import 'reflect-metadata';
import {t} from '../index';

export class DeepkitModel {
    @t ready?: boolean;

    @t.array(String) tags: string[] = [];

    @t priority: number = 0;

    constructor(
        @t public id: number,
        @t public name: string
    ) {
    }
}

test('nix', () => {
});

// test('benchmark plainToClass', () => {
//     const benchSuite = new BenchSuite('Deserialize JSON');
//
//     benchSuite.add('manual new DeepkitModel', () => {
//         const instance = new DeepkitModel(1, 'Peter');
//         instance.tags = ['a', 'b', 'c'];
//         instance.priority = 5;
//         instance.ready = true;
//     });
//
//     const serializer = jsonSerializer.for(DeepkitModel);
//
//     benchSuite.add('Deserialize JSON', () => {
//         const instance = serializer.deserialize({
//             name: 'name',
//             id: 1,
//             tags: ['a', 'b', 'c'],
//             priority: 5,
//             ready: true,
//         });
//     });
//
//     benchSuite.run();
//
//     // console.log('jit', getJitFunctionPlainToClass(DeepkitModel).toString());
//
//     const b = serializer.deserialize({
//         name: 'name1',
//         id: 1,
//         tags: ['a', 2, 'c'],
//         priority: 5,
//         ready: true,
//     });
//     expect(b.name).toBe('name1');
//     expect(b.id).toBe(1);
//     expect(b.tags).toEqual(['a', '2', 'c']);
//     expect(b.priority).toBe(5);
//     expect(b.ready).toBe(true);
// });

// test('benchmark classToPlain', () => {
//     const count = 100_000;
//
//     const b = jitjsonSerializer.for(DeepkitModel).deserialize({
//         name: 'name1',
//         id: 1,
//         tags: ['a', 2, 'c'],
//         priority: 5,
//         ready: true,
//     });
//
//     bench(count, 'classToPlain manual obj = {}', () => {
//         const obj: any = {};
//         obj['name'] = b.name;
//         obj['id'] = b.id;
//         obj['tags'] = b.tags;
//         obj['priority'] = b.priority;
//         obj['ready'] = b.ready;
//     });
//
//     bench(count, 'classToPlain jit', () => {
//         const plain = jitjsonSerializer.for(DeepkitModel).serialize(b);
//     });
//
//     // console.log('jit', JITToPlainCacheFN.get(DeepkitModel).toString());
//
//     const plain = jitjsonSerializer.for(DeepkitModel).serialize(b);
//     expect(plain.name).toBe('name1');
//     expect(plain.id).toBe(1);
//     expect(plain.tags).toEqual(['a', '2', 'c']);
//     expect(plain.priority).toBe(5);
//     expect(plain.ready).toBe(true);
// });

// test('benchmark partialPlainToClass', () => {
//     const partial = {
//         name: 'name1',
//         id: '2',
//         'tags.0': 3,
//         priority: 5,
//         ready: 'false',
//     };
//
//     const count = 100_000;
//
//     bench(count, 'partialPlainToClass jit', () => {
//         const partialWithClassValues = jitjsonSerializer.for(DeepkitModel).partialDeserialize(partial);
//     });
//
//     const partialWithClassValues = jitjsonSerializer.for(DeepkitModel).partialDeserialize(partial);
//
//     expect(partialWithClassValues.name).toBe('name1');
//     expect(partialWithClassValues.id).toBe(2);
//     expect(partialWithClassValues['tags.0']).toBe('3');
//     expect(partialWithClassValues.priority).toBe(5);
//     expect(partialWithClassValues.ready).toBe(false);
// });

//     const count = 10_000;
//
//     bench(count, 'supersimple non-jit', (i) => {
//         const instance = jsonSerializer.for(DeepkitSuperSimple).deserialize({
//             name: 'name' + i,
//             id: i,
//         });
//     });
//
//     bench(count, 'supersimple new DeepkitModel', (i) => {
//         const instance = new DeepkitSuperSimple(i, name + 'i');
//     });
//
//     bench(count, 'supersimple jit', (i) => {
//         const instance = jitjsonSerializer.for(DeepkitSuperSimple).deserialize({
//             name: 'name' + i,
//             id: i,
//         });
//     });
// });

// test('if filling a instance of prototype with fields is faster than a blank object', () => {
//     const suite = new BenchSuite('filling object');
//
//     suite.add('normal', function () {
//         const obj: any = {};
//         obj.a = 1;
//         obj.another_key_jo = 'yes';
//         obj.title = 'title';
//         obj.index = 5;
//     });
//
//     const prototype = {
//         a: 1,
//         another_key_jo: 1,
//         title: 1,
//         index: 1,
//     }
//     function f() {}
//     f.prototype = prototype;
//
//     suite.add('prototype fn', function () {
//         const obj2: any = new (f as any)();
//         obj2.a = 1;
//         obj2.another_key_jo = 'yes';
//         obj2.title = 'title';
//         obj2.index = 5;
//     });
//
//     function f2(this: any) {
//         (this as any).a = 1;
//         (this as any).another_key_jo = 1;
//         (this as any).title = 'yes';
//         (this as any).index = 5;
//     }
//     suite.add('constructor fn', function () {
//         const obj3: any = new (f2 as any)();
//         obj3.a = 1;
//         obj3.another_key_jo = 'yes';
//         obj3.title = 'title';
//         obj3.index = 5;
//     });
//
//     suite.add('direct', function () {
//         const obj = {
//             a: 1,
//             another_key_jo: 'yes',
//             title: 'title',
//             index: 5,
//         }
//     });
//
//     suite.run();
// });

// test('string convertion', () => {
//     const suite = new BenchSuite('filling object');
//
//     suite.add('+', () => {
//         // const r = ''+23;
//     });
//
//     suite.add('String()', () => {
//         // const r = String(24);
//     });
//
//     suite.run();
// });

// test('number convertion', () => {
//     const suite = new BenchSuite('filling object');
//
//     suite.add('+', () => {
//         const r = '23'+0;
//     });
//
//     suite.add('Number()', () => {
//         const r = Number('24');
//     });
//
//     suite.run();
// });


// test('worth to check type first?', () => {
//     const suite = new BenchSuite('check typeof worth it');
//
//     const valueString: any = '23';
//     const valueNumber: any = 24;
//
//     suite.add('string typeof', () => {
//         const r1 = typeof valueString === 'string' ? valueString : ''+valueString;
//         const r2 = typeof valueNumber === 'string' ? valueNumber : ''+valueNumber;
//     });
//
//     suite.add('string without typeof', () => {
//         const r1 = ''+valueString;
//         const r2 = ''+valueNumber;
//     });
//
//     suite.add('number typeof', () => {
//         const r1 = typeof valueString === 'number' ? valueString : 0+valueString;
//         const r2 = typeof valueNumber === 'number' ? valueNumber : 0+valueNumber;
//     });
//
//     suite.add('number without typeof', () => {
//         const r1 = 0+valueString;
//         const r2 = 0+valueNumber;
//     });
//
//     suite.run();
// });
