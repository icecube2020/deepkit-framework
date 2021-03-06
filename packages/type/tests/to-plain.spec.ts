import 'jest-extended';
import 'reflect-metadata';
import {jsonSerializer, t} from '../index';
import {Plan, SimpleModel, SubModel} from './entities';
import {getClassSchema} from '../src/decorators';

test('test simple model', () => {
    const instance = new SimpleModel('myName');
    const classSchema = getClassSchema(SimpleModel);
    expect(classSchema.getProperty('id').type).toBe('uuid');

    expect(instance['id']).toBeString();
    const json = jsonSerializer.for(SimpleModel).serialize(instance);

    expect(json['id']).toBeString();
    expect(json['name']).toBe('myName');
});

test('test simple model all fields', () => {
    const instance = new SimpleModel('myName');
    instance.plan = Plan.PRO;
    instance.type = 5;
    instance.created = new Date('Sat Oct 13 2018 14:17:35 GMT+0200');
    instance.children.push(new SubModel('fooo'));
    instance.children.push(new SubModel('barr'));

    instance.childrenMap.foo = new SubModel('bar');
    instance.childrenMap.foo2 = new SubModel('bar2');

    const json = jsonSerializer.for(SimpleModel).serialize(instance);

    console.log('json', json);

    expect(json['id']).toBeString();
    expect(json['name']).toBe('myName');
    expect(json['type']).toBe(5);
    expect(json['plan']).toBe(Plan.PRO);
    expect(json['created']).toBe('2018-10-13T12:17:35.000Z');
    expect(json['children']).toBeArrayOfSize(2);
    expect(json['children'][0]).toBeObject();
    expect(json['children'][0].label).toBe('fooo');
    expect(json['children'][1].label).toBe('barr');

    expect(json['childrenMap']).toBeObject();
    expect(json['childrenMap'].foo).toBeObject();
    expect(json['childrenMap'].foo.label).toBe('bar');
    expect(json['childrenMap'].foo2.label).toBe('bar2');
});


test('nullable', () => {
    const s = t.schema({
        username: t.string,
        password: t.string.nullable,
        optional: t.string.optional,
    });

    const item = new s.classType;
    item.username = 'asd';

    expect(jsonSerializer.for(s).serialize(item)).toEqual({username: 'asd'});

    item.password = null;
    expect(jsonSerializer.for(s).serialize(item)).toEqual({username: 'asd', password: null});

    item.optional = undefined;
    expect(jsonSerializer.for(s).serialize(item)).toEqual({username: 'asd', password: null});

    item.optional = 'yes';
    expect(jsonSerializer.for(s).serialize(item)).toEqual({username: 'asd', password: null, optional: 'yes'});

    item.password = 'secret';
    expect(jsonSerializer.for(s).serialize(item)).toEqual({username: 'asd', password: 'secret', optional: 'yes'});
});
