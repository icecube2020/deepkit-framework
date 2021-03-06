import 'jest-extended';
import 'reflect-metadata';
import * as moment from 'moment';
import {t} from "@deepkit/type";
import {mongoSerializer} from '../src/mongo-serializer';

test('test moment', () => {
    class Model {
        @t.moment
        created: moment.Moment = moment();
    }

    const m = new Model;
    m.created = moment(new Date('2018-10-13T12:17:35.000Z'));

    const p = mongoSerializer.for(Model).serialize(m);
    expect(p.created).toBeDate();
    expect(p.created.toJSON()).toBe('2018-10-13T12:17:35.000Z');

    {
        const m = mongoSerializer.for(Model).deserialize({
            created: new Date('2018-10-13T12:17:35.000Z')
        });
        expect(moment.isMoment(m.created)).toBe(true);
        expect(m.created.toJSON()).toBe('2018-10-13T12:17:35.000Z' );
    }
});
