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

import {ClassSchema, JitStack, PropertySchema, reserveVariable} from '@deepkit/type';
import {getInstanceState} from './identity-map';
import {empty} from '@deepkit/core';
import {getJITConverterForSnapshot} from './converter';
import {Changes, changeSetSymbol, ItemChanges} from './changes';

function genericEqualArray(a: any[], b: any[]): boolean {
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
        if (!genericEqual(a[i], b[i])) return false;
    }

    return true;
}

function genericEqualObject(a: { [name: string]: any }, b: { [name: string]: any }): boolean {
    for (let i in a) {
        if (!a.hasOwnProperty(i)) continue;
        if (!genericEqual(a[i], b[i])) return false;
    }

    //is there a faster way?
    for (let i in b) {
        if (!b.hasOwnProperty(i)) continue;
        if (!genericEqual(a[i], b[i])) return false;
    }

    return true;
}

/**
 * This is a comparator function for the snapshots. They are either string, number, boolean, array, or objects.
 * No date, moment, or custom classes involved here.
 */
function genericEqual(a: any, b: any): boolean {
    //is array, the fast way
    const aIsArray = a && 'string' !== typeof a && 'function' === a.slice && 'number' === typeof a.length;
    const bIsArray = b && 'string' !== typeof b && 'function' === b.slice && 'number' === typeof b.length;
    if (aIsArray) return bIsArray ? genericEqualArray(a, b) : false;
    if (bIsArray) return aIsArray ? genericEqualArray(a, b) : false;

    const aIsObject = 'object' === typeof a && a !== null;
    const bIsObject = 'object' === typeof b && b !== null;
    if (aIsObject) return bIsObject ? genericEqualObject(a, b) : false;
    if (aIsObject) return bIsObject ? genericEqualObject(a, b) : false;

    return a === b;
}

function createJITChangeDetectorForSnapshot(schema: ClassSchema, jitStack: JitStack = new JitStack()): (lastSnapshot: any, currentSnapshot: any) => ItemChanges<any> {
    const context = new Map<any, any>();
    const prepared = jitStack.prepare(schema);
    context.set('genericEqual', genericEqual);
    context.set('empty', empty);
    const props: string[] = [];

    function has(accessor: string): string {
        return `(changeSet.$inc && '${accessor}' in changeSet.$inc) || (changeSet.$unset && '${accessor}' in changeSet.$unset)`;
    }

    function getComparator(property: PropertySchema, last: string, current: string, changedName: string, onChanged: string, jitStack: JitStack): string {
        if (property.isArray) {
            const l = reserveVariable(context, 'l');
            return `
                if (!${has(changedName)}) {
                if (!${current} && !${last}) {
                
                } else if ((${current} && !${last}) || (!${current} && ${last})) {
                    changes.${changedName} = item.${changedName};
                    ${onChanged}
                } else if (${current}.length !== ${last}.length) {
                    changes.${changedName} = item.${changedName};
                    ${onChanged}
                } else {
                    let ${l} = ${last}.length;
                    ${onChanged ? '' : 'root:'}
                    while (${l}--) {
                         ${getComparator(property.getSubType(), `${last}[${l}]`, `${current}[${l}]`, changedName, 'break root;', jitStack)}
                    }
                }
                }
            `;

        } else if (property.isMap || property.isPartial) {
            const i = reserveVariable(context, 'i');
            return `
                if (!${has(changedName)}) {
                if (!${current} && !${last}) {
                    
                } else if ((${current} && !${last}) || (!${current} && ${last})) {
                    changes.${changedName} = item.${changedName};
                    ${onChanged}
                } else if (${current}.length !== ${last}.length) {
                    changes.${changedName} = item.${changedName};
                    ${onChanged}
                } else {
                    ${onChanged ? '' : 'root:'}
                    for (let ${i} in ${last}) {
                        if (!${last}.hasOwnProperty(${i})) continue;
                         ${getComparator(property.getSubType(), `${last}[${i}]`, `${current}[${i}]`, changedName, 'break root;', jitStack)}
                    }
                }
                }
            `;
        } else if (property.type === 'class') {
            if (property.isReference) {
                const checks: string[] = [];

                for (const primaryField of property.getResolvedClassSchema().getPrimaryFields()) {
                    checks.push(`
                         ${getComparator(primaryField, `${last}.${primaryField.name}`, `${current}.${primaryField.name}`, changedName, onChanged, jitStack)}
                    `);
                }
                return `
                if (!${has(changedName)}) {
                if (!${current} && !${last}) {
                
                } else if ((${current} && !${last}) || (!${current} && ${last})) {
                    changes.${changedName} = item.${changedName};
                    ${onChanged}
                } else {
                    ${checks.join('\n')}
                }
                }
            `;
            }

            const classSchema = property.getResolvedClassSchema();
            const jitChangeDetectorThis = reserveVariable(context, 'jitChangeDetector');
            context.set(jitChangeDetectorThis, jitStack.getOrCreate(classSchema, () => createJITChangeDetectorForSnapshot(classSchema, jitStack)));

            return `
                if (!${has(changedName)}) {
                if (!${current} && !${last}) {
                
                } else if ((${current} && !${last}) || (!${current} && ${last})) {
                    changes.${changedName} = item.${changedName};
                    ${onChanged}
                } else {
                    const thisChanged = ${jitChangeDetectorThis}.fn(${last}, ${current}, item);
                    if (!empty(thisChanged)) {
                        changes.${changedName} = item.${changedName};
                        ${onChanged}    
                    }
                }
                }
            `;
        } else if (property.type === 'any' || property.type === 'union') {
            return `
                if (!${has(changedName)}) {
                if (!genericEqual(${last}, ${current})) {
                    changes.${changedName} = item.${changedName};
                    ${onChanged}
                }
                }
            `;
        } else {
            //binary, date, boolean, etc are encoded as simple JSON objects (number, boolean, or string) primitives
            return `
            if (!${has(changedName)}) {
            if (${last} !== ${current}) {
                changes.${changedName} = item.${changedName};
                ${onChanged}
            }
            }
            `;
        }
    }

    for (const property of schema.getClassProperties().values()) {
        if (property.isParentReference) continue;
        if (property.backReference) continue;

        props.push(getComparator(property, `last.${property.name}`, `current.${property.name}`, property.name, '', jitStack));
    }

    context.set('changeSetSymbol', changeSetSymbol);
    context.set('ItemChanges', ItemChanges);

    const functionCode = `
        return function(last, current, item) {
            var changeSet = item[changeSetSymbol] || new ItemChanges(item);
            var changes = {};
            ${props.join('\n')}
            changeSet.replaceSet(changes);
            return changeSet.empty ? undefined : changeSet;
        }
        `;

    // console.log('functionCode', functionCode);

    try {
        const compiled = new Function(...context.keys(), functionCode);
        const fn = compiled(...context.values());
        prepared(fn);
        fn.buildId = schema.buildId;
        return fn;
    } catch (error) {
        console.log('functionCode', functionCode);
        throw error;
    }
}

const changeDetectorSymbol = Symbol('changeDetector');

export function getJitChangeDetector<T>(classSchema: ClassSchema<T>): (last: any, current: any, item: T) => ItemChanges<T> | undefined {
    return classSchema.getJit(changeDetectorSymbol, () => createJITChangeDetectorForSnapshot(classSchema));
}

export function buildChanges<T>(item: T): Changes<T> {
    const state = getInstanceState(item);
    const lastSnapshot = state.getSnapshot();
    const currentSnapshot = getJITConverterForSnapshot(state.classSchema)(item);
    return getJitChangeDetector(state.classSchema)(lastSnapshot, currentSnapshot, item) || new Changes;
}

export function buildChangeOld<T>(item: T) {
    const state = getInstanceState(item);
    const lastSnapshot = state.getSnapshot() as any;
    const currentSnapshot = getJITConverterForSnapshot(state.classSchema)(item) as any;
    const changes: { [path: string]: any } = {};

    for (const i of state.classSchema.getClassProperties().keys()) {
        if (!genericEqual(lastSnapshot[i], currentSnapshot[i])) changes[i] = (item as any)[i];
    }

    return changes;
}
