// Шрифты PDF: имена и «встроен ли шрифт в файл». Библиотека pdf.js настоящих имён
// не отдаёт, поэтому читаем словари шрифтов из самого файла.
//
// Как устроено в PDF: у шрифта есть словарь с «/BaseFont /Имя». Если программа шрифта
// лежит в файле, в описании шрифта (FontDescriptor) есть ссылка /FontFile, /FontFile2 или
// /FontFile3. Приставка из шести заглавных букв и «+» («ABCDEF+Times…») означает, что в файл
// встроены только нужные буквы — значит, шрифт встроен.
// Словари бывают сжаты внутри «потоков объектов» (ObjStm, PDF 1.5+): их распаковываем.
import { unzlibSync } from 'fflate';
import type { PdfFont } from './analyze.ts';

const NAME = '([^\\s/<>\\[\\]()]+)';

// Байты → строка «как есть» (latin1): так удобно искать ключевые слова PDF.
function latin1(bytes: Uint8Array): string {
  let text = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK)
    text += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return text;
}

// Содержимое сжатых потоков объектов (там могут лежать словари шрифтов).
function objectStreams(bytes: Uint8Array, text: string): string[] {
  const result: string[] = [];
  const marker = /stream\r?\n/g;
  for (let m = marker.exec(text); m; m = marker.exec(text)) {
    const dictStart = text.lastIndexOf('obj', m.index);
    const dict = text.slice(dictStart, m.index);
    if (!/\/Type\s*\/ObjStm/.test(dict) || !/\/FlateDecode/.test(dict)) continue;
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      result.push(latin1(unzlibSync(bytes.subarray(start, end))));
    } catch {
      // Поток не распаковался — пропускаем: это только подсказка о шрифтах.
    }
  }
  return result;
}

// Имена шрифтов, у описания которых есть файл шрифта.
function withFontFile(text: string): Set<string> {
  const names = new Set<string>();
  const pattern = new RegExp(`/FontName\\s*/${NAME}`, 'g');
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    const from = text.lastIndexOf('<<', m.index);
    const to = text.indexOf('>>', m.index);
    if (/\/FontFile[23]?\b/.test(text.slice(from, to < 0 ? undefined : to)) && m[1])
      names.add(m[1]);
  }
  return names;
}

export function pdfFonts(bytes: Uint8Array): PdfFont[] {
  const raw = latin1(bytes);
  const parts = [raw, ...objectStreams(bytes, raw)];
  const embedded = new Set(parts.flatMap((part) => [...withFontFile(part)]));
  const names = new Set<string>();
  const pattern = new RegExp(`/BaseFont\\s*/${NAME}`, 'g');
  for (const part of parts)
    for (let m = pattern.exec(part); m; m = pattern.exec(part)) if (m[1]) names.add(m[1]);
  return [...names].map((name) => ({
    id: name,
    name,
    embedded: /^[A-Z]{6}\+/.test(name) || embedded.has(name),
  }));
}
