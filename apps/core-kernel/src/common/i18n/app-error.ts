import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { currentLang } from './i18n-context';
import { I18nParams, t } from './translate';

export interface AppErrorBody {
  statusCode: number;
  /** Тогтвортой код (frontend/тест энүүгээр таньна) */
  code: string;
  params: I18nParams;
  /** Хүсэлтийн хэлээр (Accept-Language) орчуулсан текст — хуучин клиент `message`-ийг харуулна */
  message: string;
  [extra: string]: unknown;
}

/** Хариуны body (кодтой) */
export function appErrorBody(status: number, code: string, params: I18nParams = {}, extra: Record<string, unknown> = {}): AppErrorBody {
  return { statusCode: status, code, params, message: t(code, params, currentLang()), ...extra };
}

/**
 * Код + параметртэй HTTP алдаа (v0.2.0 §0.7). Мессежийг шидэх мөчид хүсэлтийн хэлээр (I18nInterceptor-ийн
 * AsyncLocalStorage) + байгууллагын орчуулгын засвараар орчуулна. Хуучин `message` талбар хэвээр → хуучин клиент эвдрэхгүй.
 * Helper-ууд Nest-ийн дэд классыг буцаана → `instanceof BadRequestException` гэх мэт шалгалт хэвээр ажиллана.
 */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus | number,
    readonly code: string,
    readonly params: I18nParams = {},
    extra: Record<string, unknown> = {},
  ) {
    super(appErrorBody(status, code, params, extra), status);
  }
}

type Extra = Record<string, unknown>;
const withCode = <E extends HttpException>(e: E, code: string, params: I18nParams): E & { code: string; params: I18nParams } =>
  Object.assign(e, { code, params });

export const badRequest = (code: string, params: I18nParams = {}, extra?: Extra) =>
  withCode(new BadRequestException(appErrorBody(HttpStatus.BAD_REQUEST, code, params, { error: 'Bad Request', ...extra })), code, params);
export const conflict = (code: string, params: I18nParams = {}, extra?: Extra) =>
  withCode(new ConflictException(appErrorBody(HttpStatus.CONFLICT, code, params, { error: 'Conflict', ...extra })), code, params);
export const notFound = (code: string, params: I18nParams = {}, extra?: Extra) =>
  withCode(new NotFoundException(appErrorBody(HttpStatus.NOT_FOUND, code, params, { error: 'Not Found', ...extra })), code, params);
export const forbidden = (code: string, params: I18nParams = {}, extra?: Extra) =>
  withCode(new ForbiddenException(appErrorBody(HttpStatus.FORBIDDEN, code, params, { error: 'Forbidden', ...extra })), code, params);
export const payloadTooLarge = (code: string, params: I18nParams = {}, extra?: Extra) =>
  withCode(new PayloadTooLargeException(appErrorBody(HttpStatus.PAYLOAD_TOO_LARGE, code, params, { error: 'Payload Too Large', ...extra })), code, params);
