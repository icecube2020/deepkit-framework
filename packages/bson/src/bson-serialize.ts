/*
 * Deepkit Framework
 * Copyright (C) 2020 Deepkit UG
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import {ClassSchema, getClassSchema, getGlobalStore, JitStack, PropertySchema} from '@deepkit/type';
import {ClassType, isArray, isObject, toFastProperties} from '@deepkit/core';
import {seekElementSize} from './continuation';
import {
    BSON_BINARY_SUBTYPE_BYTE_ARRAY,
    BSON_BINARY_SUBTYPE_DEFAULT,
    BSON_BINARY_SUBTYPE_UUID,
    BSON_DATA_ARRAY,
    BSON_DATA_BINARY,
    BSON_DATA_BOOLEAN,
    BSON_DATA_DATE,
    BSON_DATA_INT,
    BSON_DATA_LONG,
    BSON_DATA_NULL,
    BSON_DATA_NUMBER,
    BSON_DATA_OBJECT,
    BSON_DATA_OID,
    BSON_DATA_REGEXP,
    BSON_DATA_STRING,
    digitByteSize,
    moment
} from './utils';
import {Binary, Long, ObjectId} from 'bson';

// BSON MAX VALUES
const BSON_INT32_MAX = 0x7fffffff;
const BSON_INT32_MIN = -0x80000000;

const TWO_PWR_32_DBL_N = (1n << 16n) * (1n << 16n);

// JS MAX PRECISE VALUES
export const JS_INT_MAX = 0x20000000000000; // Any integer up to 2^53 can be precisely represented by a double.
export const JS_INT_MIN = -0x20000000000000; // Any integer down to -2^53 can be precisely represented by a double.

export function hexToByte(hex: string, index: number = 0, offset: number = 0): number {
    let code1 = hex.charCodeAt(index * 2 + offset) - 48;
    if (code1 > 9) code1 -= 39;

    let code2 = hex.charCodeAt((index * 2) + offset + 1) - 48;
    if (code2 > 9) code2 -= 39;
    return code1 * 16 + code2;
}

export function uuidStringToByte(hex: string, index: number = 0): number {
    let offset = 0;
    //e.g. bef8de96-41fe-442f-b70c-c3a150f8c96c
    if (index > 3) offset += 1;
    if (index > 5) offset += 1;
    if (index > 7) offset += 1;
    if (index > 9) offset += 1;
    return hexToByte(hex, index, offset);
}

function stringByteLength(str: string): number {
    if (!str) return 0;
    let size = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c < 128) size += 1;
        else if (c > 127 && c < 2048) size += 2;
        else size += 3;
    }
    return size;
}

function isObjectId(value: any): boolean {
    return value && value['_bsontype'] === 'ObjectID';
}

export function getValueSize(value: any): number {
    if ('boolean' === typeof value) {
        return 1;
    } else if ('string' === typeof value) {
        //size + content + null
        return 4 + stringByteLength(value) + 1;
    } else if ('bigint' === typeof value) {
        //long
        return 8;
    } else if ('number' === typeof value) {
        if (Math.floor(value) === value) {
            //it's an int
            if (value >= BSON_INT32_MIN && value <= BSON_INT32_MAX) {
                //32bit
                return 4;
            } else if (value >= JS_INT_MIN && value <= JS_INT_MAX) {
                //double, 64bit
                return 8;
            } else {
                //long
                return 8;
            }
        } else {
            //double
            return 8;
        }
    } else if (value instanceof Date || moment.isMoment(value)) {
        return 8;
    } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        let size = 4; //size
        size += 1; //sub type
        size += value.byteLength;
        return size;
    } else if (isArray(value)) {
        let size = 4; //object size
        for (let i = 0; i < value.length; i++) {
            size += 1; //element type
            size += digitByteSize(i); //element name
            size += getValueSize(value[i]);
        }
        size += 1; //null
        return size;
    } else if (isObjectId(value)) {
        return 12;
    } else if (value && value['_bsontype'] === 'Binary') {
        let size = 4; //size
        size += 1; //sub type
        size += value.buffer.byteLength;
        return size;
    } else if (value instanceof RegExp) {
        return stringByteLength(value.source) + 1
            +
            (value.global ? 1 : 0) +
            (value.ignoreCase ? 1 : 0) +
            (value.multiline ? 1 : 0) +
            1;
    } else if (isObject(value)) {
        let size = 4; //object size
        for (let i in value) {
            if (!value.hasOwnProperty(i)) continue;
            if (value[i] === undefined) continue;
            size += 1; //element type
            size += stringByteLength(i) + 1; //element name + null
            size += getValueSize(value[i]);
        }
        size += 1; //null
        return size;
    } //isObject() should be last

    return 0;
}

function getPropertySizer(context: Map<string, any>, property: PropertySchema, accessor, jitStack: JitStack): string {
    if (property.type === 'class' && property.getResolvedClassSchema().decorator) {
        property = property.getResolvedClassSchema().getDecoratedPropertySchema();
    }

    context.set('getValueSize', getValueSize);
    let code = `size += getValueSize(${accessor});`;

    if (property.type === 'array') {
        context.set('digitByteSize', digitByteSize);
        code = `
        size += 4; //array size
        for (let i = 0; i < ${accessor}.length; i++) {
            size += 1; //element type
            size += digitByteSize(i); //element name
            ${getPropertySizer(context, property.getSubType(), `${accessor}[i]`, jitStack)}
        }
        size += 1; //null
        `;
    } else if (property.type === 'map') {
        context.set('stringByteLength', stringByteLength);
        code = `
        size += 4; //object size
        for (let i in ${accessor}) {
            if (!${accessor}.hasOwnProperty(i)) continue;
            size += 1; //element type
            size += stringByteLength(i) + 1; //element name + null
            ${getPropertySizer(context, property.getSubType(), `${accessor}[i]`, jitStack)}
        }
        size += 1; //null
        `;
    } else if (property.type === 'class' && !property.isReference) {
        const sizer = '_sizer_' + property.name;
        const sizerFn = jitStack.getOrCreate(property.getResolvedClassSchema(), () => createBSONSizer(property.getResolvedClassSchema(), jitStack));
        context.set(sizer, sizerFn);
        code = `size += ${sizer}.fn(${accessor});`;
    } else if (property.type === 'date' || property.type === 'moment') {
        code = `size += 8;`;
    } else if (property.type === 'objectId') {
        code = `size += 12;`;
    } else if (property.type === 'uuid') {
        code = `size += 4 + 1 + 16;`;
    } else if (property.type === 'arrayBuffer' || property.isTypedArray) {
        code = `
            size += 4; //size
            size += 1; //sub type
            if (${accessor}['_bsontype'] === 'Binary') {
                size += ${accessor}.buffer.byteLength
            } else {
                size += ${accessor}.byteLength;
            }
        `;
    }

    return code;
}

/**
 * Creates a JIT compiled function that allows to get the BSON buffer size of a certain object.
 */
export function createBSONSizer(classSchema: ClassSchema, jitStack: JitStack = new JitStack()): (data: object) => number {
    const context = new Map<string, any>();
    let getSizeCode: string[] = [];
    const prepared = jitStack.prepare(classSchema);

    for (const property of classSchema.getClassProperties().values()) {
        //todo, support non-ascii names
        getSizeCode.push(`
            //${property.name}
            if (obj.${property.name} !== undefined) {
                if (obj.${property.name} === null) {
                    size += ${1 + property.name.length + 1};
                } else {
                    size += 1; //type
                    size += ${property.name.length} + 1; //property name
                    ${getPropertySizer(context, property, `obj.${property.name}`, jitStack)}
                }
            }
        `);
    }

    const functionCode = `
        return function(obj) {
            let size = 4; //object size
            
            ${getSizeCode.join('\n')}
            size += 1; //null
            
            return size;
        }
    `;

    const compiled = new Function('Buffer', 'seekElementSize', ...context.keys(), functionCode);
    const fn = compiled.bind(undefined, Buffer, seekElementSize, ...context.values())();
    prepared(fn);
    return fn;
}

export class Writer {
    public offset = 0;
    public dataView: DataView;

    constructor(public buffer: Buffer) {
        this.dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }

    writeUint32(v: number) {
        this.dataView.setUint32(this.offset, v, true);
        this.offset += 4;
    }

    writeInt32(v: number) {
        this.dataView.setInt32(this.offset, v, true);
        this.offset += 4;
    }

    writeDouble(v: number) {
        this.dataView.setFloat64(this.offset, v, true);
        this.offset += 8;
    }

    writeDelayedSize(v: number, position: number) {
        this.dataView.setUint32(position, v, true);
    }

    writeByte(v: number) {
        this.buffer[this.offset++] = v;
    }

    writeBuffer(buffer: Buffer) {
        // buffer.copy(this.buffer, this.buffer.byteOffset + this.offset);
        for (let i = 0; i < buffer.byteLength; i++) {
            this.buffer[this.offset++] = buffer[i];
        }
        // this.offset += buffer.byteLength;
    }

    writeNull() {
        this.writeByte(0);
    }

    writeAsciiString(str: string) {
        for (let i = 0; i < str.length; i++) {
            this.buffer[this.offset++] = str.charCodeAt(i);
        }
    }

    writeString(str: string) {
        if (!str) return;
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            if (c < 128) {
                this.buffer[this.offset++] = c;
            } else if (c > 127 && c < 2048) {
                this.buffer[this.offset++] = (c >> 6) | 192;
                this.buffer[this.offset++] = ((c & 63) | 128);
            } else {
                this.buffer[this.offset++] = (c >> 12) | 224;
                this.buffer[this.offset++] = ((c >> 6) & 63) | 128;
                this.buffer[this.offset++] = (c & 63) | 128;
            }
        }
    }

    writeObjectId(value: any) {
        if ('string' === typeof value) {
            this.buffer[this.offset + 0] = hexToByte(value, 0);
            this.buffer[this.offset + 1] = hexToByte(value, 1);
            this.buffer[this.offset + 2] = hexToByte(value, 2);
            this.buffer[this.offset + 3] = hexToByte(value, 3);
            this.buffer[this.offset + 4] = hexToByte(value, 4);
            this.buffer[this.offset + 5] = hexToByte(value, 5);
            this.buffer[this.offset + 6] = hexToByte(value, 6);
            this.buffer[this.offset + 7] = hexToByte(value, 7);
            this.buffer[this.offset + 8] = hexToByte(value, 8);
            this.buffer[this.offset + 9] = hexToByte(value, 9);
            this.buffer[this.offset + 10] = hexToByte(value, 10);
            this.buffer[this.offset + 11] = hexToByte(value, 11);
        } else {
            if (isObjectId(value)) {
                (value as any).id.copy(this.buffer, this.offset);
            }
        }
        this.offset += 12;
    }

    write(value: any, nameWriter?: () => void): void {
        if ('boolean' === typeof value) {
            if (nameWriter) {
                this.writeByte(BSON_DATA_BOOLEAN);
                nameWriter();
            }
            this.writeByte(value ? 1 : 0);
        } else if ('string' === typeof value) {
            //size + content + null
            if (nameWriter) {
                this.writeByte(BSON_DATA_STRING);
                nameWriter();
            }
            const start = this.offset;
            this.offset += 4; //size placeholder
            this.writeString(value);
            this.writeByte(0); //null
            this.writeDelayedSize(this.offset - start - 4, start);
        } else if ('bigint' === typeof value) {
            if (nameWriter) {
                this.writeByte(BSON_DATA_LONG);
                nameWriter();
            }
            this.writeUint32(Number(value % TWO_PWR_32_DBL_N) | 0);
            this.writeUint32(Number(value / TWO_PWR_32_DBL_N) | 0);
        } else if ('number' === typeof value) {
            if (Math.floor(value) === value) {
                //it's an int
                if (value >= BSON_INT32_MIN && value <= BSON_INT32_MAX) {
                    //32bit
                    if (nameWriter) {
                        this.writeByte(BSON_DATA_INT);
                        nameWriter();
                    }
                    this.writeInt32(value);
                } else if (value >= JS_INT_MIN && value <= JS_INT_MAX) {
                    //double, 64bit
                    if (nameWriter) {
                        this.writeByte(BSON_DATA_NUMBER);
                        nameWriter();
                    }
                    this.writeDouble(value);
                } else {
                    //long, but we serialize as Double, because deserialize will be BigInt
                    if (nameWriter) {
                        this.writeByte(BSON_DATA_NUMBER);
                        nameWriter();
                    }
                    this.writeDouble(value);
                }
            } else {
                //double
                if (nameWriter) {
                    this.writeByte(BSON_DATA_NUMBER);
                    nameWriter();
                }
                this.writeDouble(value);
            }
        } else if (value instanceof Date || moment.isMoment(value)) {
            if (nameWriter) {
                this.writeByte(BSON_DATA_DATE);
                nameWriter();
            }
            const long = Long.fromNumber(value.valueOf());
            this.writeUint32(long.getLowBits());
            this.writeUint32(long.getHighBits());
        } else if (value && value['_bsontype'] === 'Binary') {
            if (nameWriter) {
                this.writeByte(BSON_DATA_BINARY);
                nameWriter();
            }
            this.writeUint32(value.buffer.byteLength);
            this.writeByte(value.sub_type);

            if (value.sub_type === BSON_BINARY_SUBTYPE_BYTE_ARRAY) {
                //deprecated stuff
                this.writeUint32(value.buffer.byteLength - 4);
            }

            for (let i = 0; i < value.buffer.byteLength; i++) {
                this.buffer[this.offset++] = value.buffer[i];
            }

        } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
            if (nameWriter) {
                this.writeByte(BSON_DATA_BINARY);
                nameWriter();
            }
            let view = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
            if (value['_bsontype'] === 'Binary') {
                view = (value as Binary).buffer;
            }

            this.writeUint32(value.byteLength);
            this.writeByte(BSON_BINARY_SUBTYPE_DEFAULT);

            for (let i = 0; i < value.byteLength; i++) {
                this.buffer[this.offset++] = view[i];
            }
        } else if (isArray(value)) {
            if (nameWriter) {
                this.writeByte(BSON_DATA_ARRAY);
                nameWriter();
            }
            const start = this.offset;
            this.offset += 4; //size

            for (let i = 0; i < value.length; i++) {
                this.write(value[i], () => {
                    this.writeAsciiString('' + i);
                    this.writeByte(0);
                });
            }
            this.writeNull();
            this.writeDelayedSize(this.offset - start, start);
        } else if (isObjectId(value)) {
            if (nameWriter) {
                this.writeByte(BSON_DATA_OID);
                nameWriter();
            }
            this.writeObjectId(value);
        } else if (value instanceof RegExp) {
            if (nameWriter) {
                this.writeByte(BSON_DATA_REGEXP);
                nameWriter();
            }
            this.writeString(value.source);
            this.writeNull();
            if (value.ignoreCase) this.writeByte(0x69); // i
            if (value.global) this.writeByte(0x73); // s
            if (value.multiline) this.writeByte(0x6d); // m
            this.writeNull();
        } else if (value === null) {
            if (nameWriter) {
                this.writeByte(BSON_DATA_NULL);
                nameWriter();
            }
        } else if (isObject(value)) {
            if (nameWriter) {
                this.writeByte(BSON_DATA_OBJECT);
                nameWriter();
            }
            const start = this.offset;
            this.offset += 4; //size

            for (let i in value) {
                if (!value.hasOwnProperty(i)) continue;
                this.write(value[i], () => {
                    this.writeString(i);
                    this.writeByte(0);
                });
            }
            this.writeNull();
            this.writeDelayedSize(this.offset - start, start);
        }
    }
}

function getPropertySerializerCode(
    property: PropertySchema,
    context: Map<string, any>,
    accessor: string,
    jitStack: JitStack,
    nameAccessor?: string,
): string {
    let nameWriter = `
        writer.writeAsciiString(${nameAccessor});
        writer.writeByte(0); 
    `;
    if (!nameAccessor) {
        const nameSetter: string[] = [];
        for (let i = 0; i < property.name.length; i++) {
            nameSetter.push(`writer.buffer[writer.offset++] = ${property.name.charCodeAt(i)};`);
        }
        nameWriter = `
        ${nameSetter.join('\n')};
        writer.writeByte(0); //null
     `;
    }

    let code = `writer.write(${accessor}, () => {
        ${nameWriter}
    });`;

    //important to put it after nameWriter and nullable check, since we want to keep the name
    if (property.type === 'class' && property.getResolvedClassSchema().decorator) {
        property = property.getResolvedClassSchema().getDecoratedPropertySchema();
    }

    function numberSerializer() {
        context.set('Long', Long);
        context.set('TWO_PWR_32_DBL_N', TWO_PWR_32_DBL_N);
        return `
            if ('bigint' === typeof ${accessor}) {
                //long
                writer.writeByte(${BSON_DATA_LONG});
                ${nameWriter}
                writer.writeUint32(Number(${accessor} % TWO_PWR_32_DBL_N) | 0); //low
                writer.writeUint32(Number(${accessor} / TWO_PWR_32_DBL_N) | 0); //high
            } else if (Math.floor(${accessor}) === ${accessor}) {
                //it's an int
                if (${accessor} >= ${BSON_INT32_MIN} && ${accessor} <= ${BSON_INT32_MAX}) {
                    //32bit
                    writer.writeByte(${BSON_DATA_INT});
                    ${nameWriter}
                    writer.writeInt32(${accessor});
                } else if (${accessor} >= ${JS_INT_MIN} && ${accessor} <= ${JS_INT_MAX}) {
                    //double, 64bit
                    writer.writeByte(${BSON_DATA_NUMBER});
                    ${nameWriter}
                    writer.writeDouble(${accessor});
                } else {
                    //long, but we serialize as Double, because deserialize will be BigInt
                    writer.writeByte(${BSON_DATA_NUMBER});
                    ${nameWriter}
                    writer.writeDouble(${accessor});
                }
            } else {
                //double, 64bit
                writer.writeByte(${BSON_DATA_NUMBER});
                ${nameWriter}
                writer.writeDouble(${accessor});
            }
        `;
    }

    if (property.type === 'class' && !property.isReference) {
        const propertySerializer = `_serializer_${property.name}`;
        const serializerFn = jitStack.getOrCreate(property.getResolvedClassSchema(), () => createBSONSerialize(property.getResolvedClassSchema(), jitStack));
        context.set(propertySerializer, serializerFn);

        code = `
            writer.writeByte(${BSON_DATA_OBJECT});
            ${nameWriter}
            ${propertySerializer}.fn(${accessor}, writer);
        `;
    } else if (property.type === 'string') {
        code = `
            writer.writeByte(${BSON_DATA_STRING});
            ${nameWriter}
            const start = writer.offset;
            writer.offset += 4; //size placeholder
            writer.writeString(${accessor});
            writer.writeByte(0); //null
            writer.writeDelayedSize(writer.offset - start - 4, start);
        `;
    } else if (property.type === 'boolean') {
        code = `
            writer.writeByte(${BSON_DATA_BOOLEAN});
            ${nameWriter}
            writer.writeByte(${accessor} ? 1 : 0);
        `;
    } else if (property.type === 'date') {
        context.set('Long', Long);
        code = `
            writer.writeByte(${BSON_DATA_DATE});
            ${nameWriter}
            if (!(${accessor} instanceof Date)) {
                throw new Error(${JSON.stringify(accessor)} + " not a Date object");
            }
            const long = Long.fromNumber(${accessor}.getTime());
            writer.writeUint32(long.getLowBits());
            writer.writeUint32(long.getHighBits());
        `;
    } else if (property.type === 'objectId') {
        context.set('hexToByte', hexToByte);
        context.set('ObjectId', ObjectId);
        code = `
            writer.writeByte(${BSON_DATA_OID});
            ${nameWriter}
            
            writer.writeObjectId(${accessor});
        `;
    } else if (property.type === 'uuid') {
        context.set('uuidStringToByte', uuidStringToByte);
        context.set('Binary', Binary);
        code = `
            writer.writeByte(${BSON_DATA_BINARY});
            ${nameWriter}
            writer.writeUint32(16);
            writer.writeByte(${BSON_BINARY_SUBTYPE_UUID});
            
            if ('string' === typeof ${accessor}) {
                writer.buffer[writer.offset+0] = uuidStringToByte(${accessor}, 0);
                writer.buffer[writer.offset+1] = uuidStringToByte(${accessor}, 1);
                writer.buffer[writer.offset+2] = uuidStringToByte(${accessor}, 2);
                writer.buffer[writer.offset+3] = uuidStringToByte(${accessor}, 3);
                //-
                writer.buffer[writer.offset+4] = uuidStringToByte(${accessor}, 4);
                writer.buffer[writer.offset+5] = uuidStringToByte(${accessor}, 5);
                //-
                writer.buffer[writer.offset+6] = uuidStringToByte(${accessor}, 6);
                writer.buffer[writer.offset+7] = uuidStringToByte(${accessor}, 7);
                //-
                writer.buffer[writer.offset+8] = uuidStringToByte(${accessor}, 8);
                writer.buffer[writer.offset+9] = uuidStringToByte(${accessor}, 9);
                //-
                writer.buffer[writer.offset+10] = uuidStringToByte(${accessor}, 10);
                writer.buffer[writer.offset+11] = uuidStringToByte(${accessor}, 11);
                writer.buffer[writer.offset+12] = uuidStringToByte(${accessor}, 12);
                writer.buffer[writer.offset+13] = uuidStringToByte(${accessor}, 13);
                writer.buffer[writer.offset+14] = uuidStringToByte(${accessor}, 14);
                writer.buffer[writer.offset+15] = uuidStringToByte(${accessor}, 15);
            } else {
                if (${accessor}.buffer && 'function' === typeof ${accessor}.buffer.copy) {
                    ${accessor}.buffer.copy(writer.buffer, writer.offset);
                } else {
                    ${accessor}.copy(writer.buffer, writer.offset);
                }
            }
            writer.offset += 16;
        `;
    } else if (property.type === 'moment') {
        context.set('Long', Long);
        code = `
            writer.writeByte(${BSON_DATA_DATE});
            ${nameWriter}
            const long = Long.fromNumber(${accessor}.valueOf());
            writer.writeUint32(long.getLowBits());
            writer.writeUint32(long.getHighBits());
        `;
    } else if (property.type === 'number') {
        code = numberSerializer();
    } else if (property.type === 'array') {
        code = `
            writer.writeByte(${BSON_DATA_ARRAY});
            ${nameWriter}
            const start = writer.offset;
            writer.offset += 4; //size
            
            for (let i = 0; i < ${accessor}.length; i++) {
                //${property.getSubType().type}
                ${getPropertySerializerCode(property.getSubType(), context, `${accessor}[i]`, jitStack, `''+i`)}
            }
            writer.writeNull();
            writer.writeDelayedSize(writer.offset - start, start);
        `;
    } else if (property.type === 'map') {
        code = `
            writer.writeByte(${BSON_DATA_OBJECT});
            ${nameWriter}
            const start = writer.offset;
            writer.offset += 4; //size
            
            for (let i in ${accessor}) {
                if (!${accessor}.hasOwnProperty(i)) continue;
                //${property.getSubType().type}
                ${getPropertySerializerCode(property.getSubType(), context, `${accessor}[i]`, jitStack, `i`)}
            }
            writer.writeNull();
            writer.writeDelayedSize(writer.offset - start, start);
        `;
    }

    return `
    if (${accessor} !== undefined) {
        if (${accessor} === null) {
            writer.writeByte(${BSON_DATA_NULL});
            ${nameWriter}
        } else {
            ${code}
        }
    }
        `;
}

function createBSONSerialize(classSchema: ClassSchema, jitStack: JitStack = new JitStack()): (data: object) => Buffer {
    const context = new Map<string, any>();
    const prepared = jitStack.prepare(classSchema);

    let getPropertyCode: string[] = [];

    for (const property of classSchema.getClassProperties().values()) {
        getPropertyCode.push(`
            //${property.name}:${property.type}
            ${getPropertySerializerCode(property, context, `obj.${property.name}`, jitStack)}
        `);
    }

    const functionCode = `
        return function(obj, writer) {
            const size = _sizer(obj);
            writer = writer || new Writer(Buffer.allocUnsafe(size));
            writer.writeUint32(size);
            
            ${getPropertyCode.join('\n')}
            writer.writeNull();
            
            return writer.buffer;
        }
    `;

    // console.log('functionCode', functionCode);

    context.set('_global', getGlobalStore());
    context.set('_sizer', getBSONSizer(classSchema));
    context.set('Writer', Writer);
    context.set('seekElementSize', seekElementSize);

    const compiled = new Function(...context.keys(), functionCode);
    const fn = compiled.bind(undefined, ...context.values())();
    prepared(fn);
    return fn;
}

/**
 * Serializes an schema instance to BSON.
 *
 * Note: The instances needs to be in the mongo format already since it does not resolve decorated properties.
 *       So call it with the result of classToMongo(Schema, item).
 */
export function getBSONSerializer(schema: ClassSchema | ClassType): (data: any) => Buffer {
    schema = getClassSchema(schema);

    const jit = schema.jit;
    if (jit.bsonSerializer) return jit.bsonSerializer;

    jit.bsonSerializer = createBSONSerialize(schema);
    toFastProperties(jit);
    return jit.bsonSerializer;
}

export function getBSONSizer(schema: ClassSchema | ClassType): (data: any) => number {
    schema = getClassSchema(schema);

    const jit = schema.jit;
    if (jit.bsonSizer) return jit.bsonSizer;

    jit.bsonSizer = createBSONSizer(schema);
    toFastProperties(jit);
    return jit.bsonSizer;
}
