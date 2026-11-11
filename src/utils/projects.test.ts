import { describe, expect, it } from 'vitest';
import type { CustomField, MyTask } from '@/types/projects';
import { addDays, avatarColor, dueState, fieldValueText, groupMyTasks, initials, linkRoute, localIsoDate, neighbours, fileKind } from './projects';

const task = (over: Partial<MyTask>): MyTask => ({
  id: over.id ?? 'x',
  parentTaskId: null,
  kind: 'task',
  approvalStatus: null,
  title: 't',
  description: null,
  descriptionDoc: null,
  assigneeUserId: 'me',
  assignedAt: '2026-10-01T10:00:00.000Z',
  startOn: null,
  dueOn: null,
  estimatedMinutes: null,
  completedAt: null,
  completedBy: null,
  createdBy: 'me',
  version: 1,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  parent: null,
  projects: [],
  subtasks: { total: 0, completed: 0 },
  ...over,
});

describe('fechas', () => {
  it('la fecha local no salta al día siguiente por la noche (toISOString lo haría en UTC-5)', () => {
    expect(localIsoDate(new Date(2026, 10, 4, 23, 30))).toBe('2026-11-04');
  });

  it('suma días cruzando el fin de mes', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });

  it('estado de la fecha de entrega', () => {
    const today = '2026-11-04';
    expect(dueState('2026-11-03', today)).toBe('overdue');
    expect(dueState('2026-11-04', today)).toBe('today');
    expect(dueState('2026-11-05', today)).toBe('soon');
    expect(dueState('2026-11-20', today)).toBe('later');
    expect(dueState(null, today)).toBe('none');
    expect(dueState('2026-11-01', today, true)).toBe('none');
  });
});

describe('Mis tareas', () => {
  it('reparte como Asana: hoy (incluye vencidas), próximas 7 días, recién asignadas y más tarde', () => {
    const now = new Date('2026-11-04T15:00:00Z');
    const g = groupMyTasks(
      [
        task({ id: 'vencida', dueOn: '2026-11-01' }),
        task({ id: 'hoy', dueOn: '2026-11-04' }),
        task({ id: 'semana', dueOn: '2026-11-10' }),
        task({ id: 'nueva', assignedAt: '2026-11-03T12:00:00.000Z' }),
        task({ id: 'vieja' }),
        task({ id: 'lejana', dueOn: '2026-12-20' }),
      ],
      '2026-11-04',
      now,
    );
    expect(g.today.map((t) => t.id)).toEqual(['vencida', 'hoy']);
    expect(g.upcoming.map((t) => t.id)).toEqual(['semana']);
    expect(g.recent.map((t) => t.id)).toEqual(['nueva']);
    expect(g.later.map((t) => t.id)).toEqual(['lejana', 'vieja']);
  });
});

describe('arrastrar', () => {
  it('las vecinas son las de la lista completa, en el orden en que quedó', () => {
    const list = [{ id: 'a' }, { id: 'n' }, { id: 'b' }];
    expect(neighbours(list, 'n')).toEqual({ beforeId: 'a', afterId: 'b' });
    expect(neighbours(list, 'a')).toEqual({ beforeId: null, afterId: 'n' });
    expect(neighbours(list, 'b')).toEqual({ beforeId: 'n', afterId: null });
  });
});

describe('avatares', () => {
  it('color estable y siempre un token del tema; iniciales del nombre o del correo', () => {
    expect(avatarColor('u1')).toBe(avatarColor('u1'));
    expect(['primary', 'secondary', 'success', 'warning', 'info', 'error']).toContain(avatarColor('otro'));
    expect(initials({ id: '1', email: 'ana.perez@x.com', fullName: null, avatarFileId: null })).toBe('AP');
    expect(initials({ id: '1', email: 'x@x.com', fullName: 'María José Ruiz', avatarFileId: null })).toBe('MJ');
  });
});

describe('campos personalizados y vínculos', () => {
  const field = (over: Partial<CustomField>): CustomField => ({ id: 'f', projectId: 'p', name: 'Campo', type: 'text', options: [], rank: 'm', ...over });
  const users = new Map([['u1', { id: 'u1', email: 'ana@x.com', fullName: 'Ana Pérez', avatarFileId: null }]]);

  it('muestra cada tipo de valor como se lee: la opción por su nombre, la persona por su nombre, el número con formato local', () => {
    const select = field({ type: 'select', options: [{ id: 'o1', label: 'Alta', color: 'error' }] });
    expect(fieldValueText(select, 'o1', users, 'es')).toBe('Alta');
    expect(fieldValueText(select, 'borrada', users, 'es')).toBe('');
    expect(fieldValueText(field({ type: 'person' }), 'u1', users, 'es')).toBe('Ana Pérez');
    expect(fieldValueText(field({ type: 'number' }), 1500.5, users, 'es')).toBe('1500,5');
    expect(fieldValueText(field({ type: 'number' }), 1500.5, users, 'en')).toBe('1,500.5');
    expect(fieldValueText(field({ type: 'date' }), '2026-12-09', users, 'es')).toBe('9 dic');
    expect(fieldValueText(field({ type: 'text' }), null, users, 'es')).toBe('');
  });

  it('cada vínculo abre la pantalla de su registro; la cotización aún no tiene', () => {
    expect(linkRoute('customer', 'c1')).toBe('/customers/c1');
    expect(linkRoute('purchase_order', 'o1')).toBe('/purchasing/orders/o1');
    expect(linkRoute('quote', 'q1')).toBeNull();
  });
});

describe('fileKind: icono y color de cada tipo de archivo', () => {
  const X = 'application/vnd.openxmlformats-officedocument';
  it.each([
    // [nombre, tipo MIME, icono, color]
    ['ventas.xlsx', `${X}.spreadsheetml.sheet`, 'mdi-file-excel-outline', 'success'],
    ['macro.xlsm', 'application/vnd.ms-excel.sheet.macroEnabled.12', 'mdi-file-excel-outline', 'success'],
    ['viejo.xls', 'application/vnd.ms-excel', 'mdi-file-excel-outline', 'success'],
    ['datos.csv', 'text/csv', 'mdi-file-excel-outline', 'success'],
    ['libre.ods', 'application/vnd.oasis.opendocument.spreadsheet', 'mdi-file-excel-outline', 'success'],
    ['factura.pdf', 'application/pdf', 'mdi-file-pdf-box', 'error'],
    ['contrato.docx', `${X}.wordprocessingml.document`, 'mdi-file-word-outline', 'primary'],
    ['viejo.doc', 'application/msword', 'mdi-file-word-outline', 'primary'],
    ['libre.odt', 'application/vnd.oasis.opendocument.text', 'mdi-file-word-outline', 'primary'],
    ['nota.rtf', 'application/rtf', 'mdi-file-word-outline', 'primary'],
    ['charla.pptx', `${X}.presentationml.presentation`, 'mdi-file-powerpoint-outline', 'warning'],
    ['vieja.ppt', 'application/vnd.ms-powerpoint', 'mdi-file-powerpoint-outline', 'warning'],
    ['libre.odp', 'application/vnd.oasis.opendocument.presentation', 'mdi-file-powerpoint-outline', 'warning'],
    ['foto.png', 'image/png', 'mdi-file-image-outline', 'secondary'],
    ['foto.jpg', 'image/jpeg', 'mdi-file-image-outline', 'secondary'],
    ['anim.gif', 'image/gif', 'mdi-file-image-outline', 'secondary'],
    ['logo.svg', 'image/svg+xml', 'mdi-file-image-outline', 'secondary'],
    ['factura-001.xml', 'application/xml', 'mdi-file-code-outline', undefined],
    ['sri.xml', 'text/xml', 'mdi-file-code-outline', undefined],
    ['datos.json', 'application/json', 'mdi-file-code-outline', undefined],
    ['leeme.txt', 'text/plain', 'mdi-file-document-outline', undefined],
    ['demo.mp4', 'video/mp4', 'mdi-file-video-outline', undefined],
    ['audio.mp3', 'audio/mpeg', 'mdi-file-music-outline', undefined],
    ['todo.zip', 'application/zip', 'mdi-folder-zip-outline', undefined],
    ['todo.rar', 'application/vnd.rar', 'mdi-folder-zip-outline', undefined],
    ['raro.bin', 'application/octet-stream', 'mdi-file-outline', undefined],
  ])('%s (%s)', (name, mime, icon, color) => {
    expect(fileKind(mime, name)).toEqual({ icon, color });
  });

  it('manda la extensión: Office subido como application/octet-stream conserva su icono y color', () => {
    expect(fileKind('application/octet-stream', 'cotizacion.xlsx')).toEqual({ icon: 'mdi-file-excel-outline', color: 'success' });
    expect(fileKind('application/octet-stream', 'propuesta.pptx')).toEqual({ icon: 'mdi-file-powerpoint-outline', color: 'warning' });
    expect(fileKind('', 'contrato.DOCX')).toEqual({ icon: 'mdi-file-word-outline', color: 'primary' });
  });

  it('sin extensión, decide por el tipo MIME', () => {
    expect(fileKind('application/pdf', 'escaneo')).toEqual({ icon: 'mdi-file-pdf-box', color: 'error' });
    expect(fileKind('image/webp', 'captura')).toEqual({ icon: 'mdi-file-image-outline', color: 'secondary' });
  });
});
