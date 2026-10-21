// Ошибки чтения файла. Ядро возвращает код, а понятный текст берётся из src/i18n/ru.ts.
// Любая неожиданная ошибка внутри разбора превращается в 'broken', чтобы приложение
// никогда не падало с необработанным исключением (бриф, раздел 2.6).

export type DocxErrorCode =
  | 'empty' // файл пустой
  | 'too-large' // больше лимита
  | 'doc-or-encrypted' // старый .doc или .docx с паролем: оба хранятся в формате OLE
  | 'pdf'
  | 'rtf'
  | 'odt'
  | 'not-docx' // не zip или zip, но не Word
  | 'zip-limits' // слишком много записей или слишком большой распакованный размер
  | 'no-document' // в архиве нет word/document.xml
  | 'broken'; // повреждённый zip или XML

export class DocxError extends Error {
  readonly code: DocxErrorCode;

  constructor(code: DocxErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = 'DocxError';
    this.code = code;
  }
}
