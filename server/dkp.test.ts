import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canViewPhoto, dkpRouter } from './routers/dkp';

const db = vi.hoisted(() => ({
  dbInstance: {} as any,
  saveDbToDisk: vi.fn(),
  createAuditLog: vi.fn(async () => {}),
}));
vi.mock('./db', () => db);

process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dkp-test-'));

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString('base64');
const MONTH = '2026-10';

const member = (id: number, cpId: number, extra: Record<string, unknown> = {}) => ({
  id, characterName: `P${id}`, role: 'user', legacyAccess: true, raidCpId: cpId, cpStatus: 'confirmed', isActive: true, ...extra,
});
const admin = { id: 1, characterName: 'Admin', role: 'super_admin' };
const dkpAdmin = { id: 2, characterName: 'Mod', role: 'mapper', legacyAccess: true, dkpAdmin: true };
const leaderA = member(10, 100);
const leaderB = member(20, 200);
const caller = (u: any) => dkpRouter.createCaller({ user: u, req: {} as any, res: {} as any });

beforeEach(() => {
  db.dbInstance = {
    users: [
      admin, dkpAdmin, leaderA, leaderB,
      ...Array.from({ length: 10 }, (_, i) => member(11 + i, 100)),
      member(31, 200), member(32, 200, { cpStatus: 'pending' }),
      { id: 50, characterName: 'SinAcceso', role: 'user' },
    ],
    clans: [{ id: 7, name: 'RaptorSquad' }],
    raidCommandParties: [
      { id: 100, name: 'Alfa', clanId: 7, leaderId: 10, leaderIds: [10] },
      { id: 200, name: 'Beta', clanId: 7, leaderId: 20 },
    ],
    dkpEvents: [], dkpRecords: [], dkpLedger: [],
  };
  db.saveDbToDisk.mockClear();
  db.createAuditLog.mockClear();
});

async function newEvent(date = `${MONTH}-05`, points = 1) {
  const { id } = await caller(admin).createEvent({ name: 'Boss', date, points });
  return id;
}
async function register(u: any, eventId: number, cpId: number, userIds: number[]) {
  await caller(u).setPhoto({ eventId, cpId, dataBase64: JPG });
  await caller(u).saveAttendance({ eventId, cpId, userIds });
  await caller(u).submitRecord({ eventId, cpId });
}

describe('dkp router', () => {
  it('es visible para usuarios con acceso y bloquea a quien no tiene ninguno', async () => {
    await expect(caller({ id: 50, role: 'user' }).overview({ month: MONTH })).rejects.toThrow('No tienes acceso');
    const ov = await caller(member(11, 100)).overview({ month: MONTH });
    expect(ov.canAdmin).toBe(false);
    expect(ov.cps.map((c) => [c.name, c.leaders, c.memberCount])).toEqual([['Alfa', ['P10'], 11], ['Beta', ['P20'], 2]]);
    expect((await caller(dkpAdmin).overview({ month: MONTH })).canAdmin).toBe(true);
  });

  it('solo Admin DKP o Super Admin crean eventos', async () => {
    await expect(caller(leaderA).createEvent({ name: 'Boss', date: `${MONTH}-01`, points: 1 })).rejects.toThrow('Solo un Admin DKP');
    await expect(caller(dkpAdmin).createEvent({ name: 'Boss', date: `${MONTH}-01`, points: 2 })).resolves.toMatchObject({ id: 1 });
  });

  it('el líder marca hasta 9 de su CP, necesita foto y al enviar ya no puede modificar', async () => {
    const ev = await newEvent();
    await expect(caller(leaderB).saveAttendance({ eventId: ev, cpId: 100, userIds: [11] })).rejects.toThrow('Solo el líder');
    await expect(caller(leaderA).saveAttendance({ eventId: ev, cpId: 100, userIds: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] })).rejects.toThrow('Máximo 9');
    await expect(caller(leaderA).saveAttendance({ eventId: ev, cpId: 100, userIds: [31] })).rejects.toThrow('miembros confirmados');
    await expect(caller(leaderB).saveAttendance({ eventId: ev, cpId: 200, userIds: [32] })).rejects.toThrow('miembros confirmados');
    await caller(leaderA).saveAttendance({ eventId: ev, cpId: 100, userIds: [10, 11, 12] });
    await expect(caller(leaderA).submitRecord({ eventId: ev, cpId: 100 })).rejects.toThrow('foto');
    await expect(caller(leaderA).setPhoto({ eventId: ev, cpId: 100, dataBase64: Buffer.from('no es una imagen').toString('base64') })).rejects.toThrow('JPG, PNG o WebP');
    const { photoUrl } = await caller(leaderA).setPhoto({ eventId: ev, cpId: 100, dataBase64: JPG });
    expect(fs.existsSync(path.join(process.env.UPLOADS_DIR!, 'dkp-evidence', path.basename(photoUrl!)))).toBe(true);
    await caller(leaderA).submitRecord({ eventId: ev, cpId: 100 });
    await expect(caller(leaderA).saveAttendance({ eventId: ev, cpId: 100, userIds: [10] })).rejects.toThrow('Ya enviaste');
    const detail = await caller(leaderA).eventDetail({ eventId: ev });
    expect(detail.cps.find((c) => c.cpId === 100)).toMatchObject({ canEdit: false, record: { status: 'submitted', submittedBy: 'P10' } });
  });

  it('al cerrar exige escribir CERRAR; quien no registró queda en 0 y nadie más que un admin puede tocar', async () => {
    const ev = await newEvent(`${MONTH}-05`, 2);
    await register(leaderA, ev, 100, [10, 11, 12, 13]);
    await caller(leaderB).saveAttendance({ eventId: ev, cpId: 200, userIds: [20, 31] });
    await expect(caller(leaderA).closeEvent({ eventId: ev, confirm: 'CERRAR' })).rejects.toThrow('Solo un Admin DKP');
    await expect(caller(admin).closeEvent({ eventId: ev, confirm: 'cerrar?' })).rejects.toThrow('Escribe CERRAR');
    await caller(admin).closeEvent({ eventId: ev, confirm: 'cerrar' });
    await expect(caller(leaderB).submitRecord({ eventId: ev, cpId: 200 })).rejects.toThrow('cerrado');
    await expect(caller(leaderB).saveAttendance({ eventId: ev, cpId: 200, userIds: [20] })).rejects.toThrow('cerrado');

    const ov = await caller(leaderA).overview({ month: MONTH });
    expect(ov.cps.find((c) => c.id === 100)).toMatchObject({ balance: 8, participated: 1, closedEvents: 1, percent: 100 });
    expect(ov.cps.find((c) => c.id === 200)).toMatchObject({ balance: 0, participated: 0, percent: 0 });
    const beta = await caller(leaderB).cpDetail({ cpId: 200, month: MONTH });
    expect(beta.history[0]).toMatchObject({ title: 'Boss', points: 0, comment: 'Sin registro enviado' });
  });

  it('% de la CP = eventos con participación ÷ eventos cerrados; % del miembro = asistencias ÷ eventos cerrados', async () => {
    const e1 = await newEvent(`${MONTH}-01`);
    const e2 = await newEvent(`${MONTH}-02`);
    const e3 = await newEvent(`${MONTH}-03`);
    const e4 = await newEvent(`${MONTH}-04`);
    await register(leaderA, e1, 100, [10, 11]);
    await register(leaderA, e2, 100, [10]);
    await register(leaderA, e3, 100, [10, 11]);
    for (const e of [e1, e2, e3]) await caller(admin).closeEvent({ eventId: e, confirm: 'CERRAR' });
    await caller(admin).cancelEvent({ eventId: e4, reason: 'no se hizo' });
    await newEvent(`${MONTH}-20`);
    await newEvent('2026-11-01');

    const ov = await caller(admin).overview({ month: MONTH });
    expect(ov.cps.find((c) => c.id === 100)).toMatchObject({ closedEvents: 3, participated: 3, percent: 100, balance: 5 });
    const alfa = await caller(admin).cpDetail({ cpId: 100, month: MONTH });
    const p = (name: string) => alfa.members.find((m) => m.name === name);
    expect(p('P10')).toMatchObject({ attended: 3, eligible: 3, percent: 100 });
    expect(p('P11')).toMatchObject({ attended: 2, eligible: 3, percent: 67 });
    expect(p('P12')).toMatchObject({ attended: 0, percent: 0 });
    expect(alfa.members[0].name).toBe('P10');
    expect(alfa.monthPoints).toBe(5);
  });

  it('un miembro que entró a la CP a mitad de mes solo cuenta los eventos desde su ingreso', async () => {
    db.dbInstance.users.find((u: any) => u.id === 12).cpJoinedAt = `${MONTH}-03T12:00:00.000Z`;
    const e1 = await newEvent(`${MONTH}-01`);
    const e2 = await newEvent(`${MONTH}-04`);
    await register(leaderA, e1, 100, [10]);
    await register(leaderA, e2, 100, [10, 12]);
    for (const e of [e1, e2]) await caller(admin).closeEvent({ eventId: e, confirm: 'CERRAR' });
    const alfa = await caller(admin).cpDetail({ cpId: 100, month: MONTH });
    expect(alfa.members.find((m) => m.name === 'P12')).toMatchObject({ attended: 1, eligible: 1, percent: 100 });
  });

  it('el admin corrige con motivo (también tras el cierre), valida y los puntos se recalculan', async () => {
    const ev = await newEvent();
    await register(leaderA, ev, 100, [10, 11, 12]);
    await caller(admin).closeEvent({ eventId: ev, confirm: 'CERRAR' });
    await expect(caller(dkpAdmin).saveAttendance({ eventId: ev, cpId: 100, userIds: [10, 11] })).rejects.toThrow('motivo');
    await caller(dkpAdmin).saveAttendance({ eventId: ev, cpId: 100, userIds: [10, 11], reason: 'P12 no sale en la foto' });
    await caller(dkpAdmin).validateRecord({ eventId: ev, cpId: 100 });
    const alfa = await caller(leaderA).cpDetail({ cpId: 100, month: MONTH });
    expect(alfa.balance).toBe(2);
    expect(alfa.history[0].comment).toContain('validado');
    expect(alfa.history[0].comment).toContain('corregido por Mod: P12 no sale en la foto');
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'DKP_RECORD_CORRECTED' }));
  });

  it('el admin puede devolver el registro al líder y reabrir un evento cerrado', async () => {
    const ev = await newEvent();
    await register(leaderA, ev, 100, [10]);
    await caller(admin).reopenRecord({ eventId: ev, cpId: 100, reason: 'faltó marcar a P11' });
    await caller(leaderA).saveAttendance({ eventId: ev, cpId: 100, userIds: [10, 11] });
    await caller(leaderA).submitRecord({ eventId: ev, cpId: 100 });
    await caller(admin).closeEvent({ eventId: ev, confirm: 'CERRAR' });
    await expect(caller(admin).reopenRecord({ eventId: ev, cpId: 100, reason: 'x' })).rejects.toThrow();
    await caller(admin).reopenEvent({ eventId: ev, reason: 'faltó la CP Beta' });
    await register(leaderB, ev, 200, [20]);
    await caller(admin).closeEvent({ eventId: ev, confirm: 'CERRAR' });
    const ov = await caller(admin).overview({ month: MONTH });
    expect(ov.cps.map((c) => c.balance)).toEqual([2, 1]);
    const detail = await caller(admin).eventDetail({ eventId: ev });
    expect(detail.event.log.map((l) => l.action)).toContain('reopened');
  });

  it('compras y entregas descuentan del saldo de la CP y no permiten saldo negativo', async () => {
    const ev = await newEvent(`${MONTH}-05`, 3);
    await register(leaderA, ev, 100, [10, 11]);
    await caller(admin).closeEvent({ eventId: ev, confirm: 'CERRAR' });
    await expect(caller(leaderA).addLedger({ cpId: 100, type: 'purchase', points: 1, itemName: 'Arma', comment: 'compra', date: `${MONTH}-06` })).rejects.toThrow('Solo un Admin DKP');
    await expect(caller(admin).addLedger({ cpId: 100, type: 'purchase', points: 7, itemName: 'Arma', comment: 'compra', date: `${MONTH}-06` })).rejects.toThrow('Saldo insuficiente');
    await caller(admin).addLedger({ cpId: 100, type: 'purchase', points: 4, itemName: 'Arma', comment: 'compra', date: `${MONTH}-06` });
    const { id } = await caller(admin).addLedger({ cpId: 100, type: 'adjust', points: -1, comment: 'penalización', date: `${MONTH}-07` });
    let alfa = await caller(member(11, 100)).cpDetail({ cpId: 100, month: MONTH });
    expect(alfa.balance).toBe(1);
    expect(alfa.history.map((h) => [h.title, h.points])).toEqual([['Ajuste', -1], ['Compra: Arma', -4], ['Boss', 6]]);
    await caller(admin).deleteLedger({ id, reason: 'error de tipeo' });
    alfa = await caller(admin).cpDetail({ cpId: 100, month: MONTH });
    expect(alfa.balance).toBe(2);
  });

  it('un evento anulado no cuenta y el líder no puede registrar en él', async () => {
    const ev = await newEvent();
    await caller(admin).cancelEvent({ eventId: ev, reason: 'se suspendió' });
    await expect(caller(leaderA).saveAttendance({ eventId: ev, cpId: 100, userIds: [10] })).rejects.toThrow('anulado');
    expect((await caller(admin).overview({ month: MONTH })).cps[0]).toMatchObject({ closedEvents: 0, percent: null });
  });

  it('con el evento abierto cada líder solo ve su CP (y su foto); al cerrar lo ven todos', async () => {
    const ev = await newEvent();
    await register(leaderA, ev, 100, [10, 11]);
    const photo = db.dbInstance.dkpRecords.find((r: any) => r.cpId === 100).photoUrl.split('/').pop();

    const asB = await caller(leaderB).eventDetail({ eventId: ev });
    expect(asB.cps.map((c) => c.cpName)).toEqual(['Beta']);
    expect(asB).toMatchObject({ hiddenCps: 1, totalCps: 2, submittedCps: 1 });
    expect((await caller(member(11, 100)).eventDetail({ eventId: ev })).cps).toEqual([]);
    expect((await caller(dkpAdmin).eventDetail({ eventId: ev })).cps).toHaveLength(2);
    const alfaForB = (await caller(leaderB).overview({ month: MONTH })).events[0].records.find((r) => r.cpId === 100);
    expect(alfaForB).toMatchObject({ status: 'submitted', attendeeCount: 0, hasPhoto: false });

    expect(canViewPhoto(leaderB, photo)).toBe(false);
    expect(canViewPhoto(member(11, 100), photo)).toBe(false);
    expect(canViewPhoto(leaderA, photo)).toBe(true);
    expect(canViewPhoto(dkpAdmin, photo)).toBe(true);
    expect(canViewPhoto({ id: 50, role: 'user' }, photo)).toBe(false);

    await caller(admin).closeEvent({ eventId: ev, confirm: 'CERRAR' });
    expect((await caller(member(31, 200)).eventDetail({ eventId: ev })).cps).toHaveLength(2);
    expect(canViewPhoto(leaderB, photo)).toBe(true);
  });

  it('el admin gestiona tipos de evento con sus puntos y los usa al crear eventos', async () => {
    await expect(caller(leaderA).saveEventType({ name: 'Boss épico', points: 2 })).rejects.toThrow('Solo un Admin DKP');
    const { id } = await caller(dkpAdmin).saveEventType({ name: 'Boss épico', points: 2 });
    await expect(caller(admin).saveEventType({ name: 'boss ÉPICO', points: 3 })).rejects.toThrow('Ya existe');
    await caller(admin).saveEventType({ id, name: 'Boss épico', points: 3 });
    expect((await caller(leaderA).overview({ month: MONTH })).eventTypes).toEqual([{ id, name: 'Boss épico', points: 3 }]);

    const { id: ev } = await caller(admin).createEvent({ typeId: id, name: 'Boss épico', date: `${MONTH}-03`, points: 3 });
    expect((await caller(admin).eventDetail({ eventId: ev })).event).toMatchObject({ typeId: id, points: 3 });

    await caller(admin).archiveEventType({ id });
    expect(await caller(admin).eventTypes()).toEqual([]);
    await expect(caller(admin).createEvent({ typeId: id, name: 'Boss épico', date: `${MONTH}-04`, points: 3 })).rejects.toThrow('no existe');
  });
});
