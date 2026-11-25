import { describe, expect, it } from 'vitest';
import { MAX_CHART_POINTS, parseAssistantBlocks, parseChart } from './assistant-blocks';

describe('bloques de una respuesta del asistente', () => {
  it('solo texto: un único bloque de texto', () => {
    expect(parseAssistantBlocks('Hola.\n- uno\n- dos')).toEqual([{ kind: 'text', text: 'Hola.\n- uno\n- dos' }]);
  });

  it('una tabla markdown entre texto se separa en su propio bloque', () => {
    const blocks = parseAssistantBlocks(
      'Tu stock:\n\n| Producto | Disponible |\n|---|---:|\n| **Martillo** | 34 |\n| Clavos | 120 |\n\nNada más.',
    );
    expect(blocks).toEqual([
      { kind: 'text', text: 'Tu stock:' },
      // La negrita se queda: el chat la pinta en la celda. `---:` alinea las cifras a la derecha.
      { kind: 'table', head: ['Producto', 'Disponible'], rows: [['**Martillo**', '34'], ['Clavos', '120']], align: [null, 'right'] },
      { kind: 'text', text: 'Nada más.' },
    ]);
  });

  it('una fila corta se completa con celdas vacías', () => {
    const [table] = parseAssistantBlocks('| a | b | c |\n|---|---|---|\n| 1 | 2 |');
    expect(table).toEqual({ kind: 'table', head: ['a', 'b', 'c'], rows: [['1', '2', '']], align: [null, null, null] });
  });

  it('un gráfico válido se convierte en bloque de gráfico', () => {
    const blocks = parseAssistantBlocks(
      'Ventas por cliente:\n```grafico\n{"type":"bar","title":"Octubre","labels":["Clavo","Sana"],"values":[1315,230.5],"unit":"USD"}\n```\nEl Clavo compra más.',
    );
    expect(blocks).toEqual([
      { kind: 'text', text: 'Ventas por cliente:' },
      { kind: 'chart', chart: { type: 'bar', title: 'Octubre', labels: ['Clavo', 'Sana'], values: [1315, 230.5], unit: 'USD' } },
      { kind: 'text', text: 'El Clavo compra más.' },
    ]);
  });

  it('un gráfico mal formado se queda como texto: la respuesta no se rompe', () => {
    const text = '```grafico\n{"type":"bar","labels":["a"],"values":[1,2]}\n```';
    expect(parseAssistantBlocks(text)).toEqual([{ kind: 'text', text }]);
  });
});

describe('validación de gráficos', () => {
  it('rechaza tipos desconocidos, valores no numéricos y anillos con negativos', () => {
    expect(parseChart('{"type":"radar","labels":["a"],"values":[1]}')).toBeNull();
    expect(parseChart('{"type":"bar","labels":["a"],"values":["x"]}')).toBeNull();
    expect(parseChart('{"type":"pie","labels":["a","b"],"values":[5,-1]}')).toBeNull();
    expect(parseChart('no es json')).toBeNull();
  });

  it(`no dibuja más de ${MAX_CHART_POINTS} puntos`, () => {
    const n = MAX_CHART_POINTS + 1;
    expect(parseChart(JSON.stringify({ type: 'line', labels: Array.from({ length: n }, (_, i) => String(i)), values: Array(n).fill(1) }))).toBeNull();
  });

  it('acepta números en texto (el modelo a veces los manda así)', () => {
    expect(parseChart('{"type":"line","labels":["oct","nov"],"values":["10.5","20"]}')?.values).toEqual([10.5, 20]);
  });
});
