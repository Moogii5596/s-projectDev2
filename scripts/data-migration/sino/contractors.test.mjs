// node --test scripts/data-migration/sino/contractors.test.mjs — зохиомол өгөгдөл (хувийн мэдээлэлгүй)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignCodes, classifyContractor, contractorIdentity, normName, routeOf } from './contractors.mjs';

const rules = [
  { id: 'guard', shift: ['Z'], match: ['ХАРУУЛ'], key: 'name' },
  { id: 'shuttle', shift: ['Z'], match: ['АВТОБУС', 'БАЯНХОНГОР', 'ЭЭЛЖИЙН УНАА'], key: 'route', routeWords: ['Автобус', 'Баянхонгор'], driverFirstName: 'Жолооч {n}' },
  { id: 'tire', shift: ['W'], match: ['ДУГУЙ'], key: 'name' },
];
const row = (p) => ({ shift: '', idText: '', lastName: '', firstName: '', position: '', ...p });

test('ангилал: ээлж + текст; таарахгүй → null', () => {
  assert.equal(classifyContractor(row({ shift: 'Z', idText: 'Харуул', firstName: 'А' }), rules).id, 'guard');
  assert.equal(classifyContractor(row({ shift: 'z', position: 'Харуул ахлах' }), rules).id, 'guard');
  assert.equal(classifyContractor(row({ shift: 'Z', position: 'Баянхонгор 2' }), rules).id, 'shuttle');
  assert.equal(classifyContractor(row({ shift: 'Z', idText: 'Ээлжийн унаа', lastName: 'Автобус 1' }), rules).id, 'shuttle');
  assert.equal(classifyContractor(row({ shift: 'W', idText: 'ШИНЭ', position: 'Дугуйчин轮胎' }), rules).id, 'tire');
  assert.equal(classifyContractor(row({ shift: '', idText: 'NEW', position: 'Дампын операторч' }), rules), null);
  assert.equal(classifyContractor(row({ shift: 'A', position: 'Харуул' }), rules), null);
});

test('жолооч: чиглэл = нэг ажилтан (албан тушаал эсвэл овгоос)', () => {
  const sh = rules[1];
  assert.deepEqual(routeOf(row({ position: 'Автобус 3' }), sh), { label: 'Автобус', n: 3 });
  assert.deepEqual(contractorIdentity(row({ lastName: 'Автобус 1' }), sh), { key: 'shuttle:автобус:1', lastName: 'Автобус', firstName: 'Жолооч 1' });
  assert.deepEqual(contractorIdentity(row({ position: 'Баянхонгор 2', firstName: 'Хэн нэгэн' }), sh), { key: 'shuttle:баянхонгор:2', lastName: 'Баянхонгор', firstName: 'Жолооч 2' });
  assert.ok(contractorIdentity(row({ position: 'Жолооч' }), sh).error);
});

test('нэрээр: «Sino» хасна, ганц нэр → Нэр; нэргүй → алдаа', () => {
  const g = rules[0];
  assert.deepEqual(contractorIdentity(row({ lastName: 'Бат', firstName: 'Дорж Sino' }), g), { key: 'guard:бат|дорж', lastName: 'Бат', firstName: 'Дорж' });
  assert.deepEqual(contractorIdentity(row({ lastName: '', firstName: 'Лхагва' }), g), { key: 'guard:|лхагва', lastName: null, firstName: 'Лхагва' });
  assert.deepEqual(contractorIdentity(row({ lastName: 'Ганц', firstName: '' }), g), { key: 'guard:|ганц', lastName: null, firstName: 'Ганц' });
  assert.ok(contractorIdentity(row({}), g).error);
  assert.equal(normName(' Бат  SINO '), 'бат');
});

test('код: дүрмийн дараалал → түлхүүр, --z-start-аас', () => {
  const m = assignCodes(
    [{ key: 'tire:a|b', ruleId: 'tire' }, { key: 'shuttle:автобус:2', ruleId: 'shuttle' }, { key: 'shuttle:автобус:10', ruleId: 'shuttle' }, { key: 'guard:|в', ruleId: 'guard' }],
    rules, 'Z', 5,
  );
  assert.deepEqual([...m.entries()], [['guard:|в', 'Z0005'], ['shuttle:автобус:2', 'Z0006'], ['shuttle:автобус:10', 'Z0007'], ['tire:a|b', 'Z0008']]);
});
