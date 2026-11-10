import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { badRequest } from '../i18n/app-error';
import { t } from '../i18n/translate';
import { registerMultipart } from './multipart';

/**
 * App-ийн HTTP тохиргоо — main.ts болон БҮХ integration тест ЭНИЙГ дуудна [VALID-001]:
 * тестийн app production-оос өөр тохиргоотой байвал (implicit conversion, forbidNonWhitelisted, multipart)
 * production алдаа нуугдана.
 */
export const GLOBAL_PREFIX = 'api/v1';

const VALIDATION_MESSAGES: Record<string, string> = {
  arrayMaxSize: 'validation.array_max_size',
  arrayMinSize: 'validation.array_min_size',
  isArray: 'validation.array',
  isBoolean: 'validation.boolean',
  isDateString: 'validation.date',
  isDefined: 'validation.required',
  isEmail: 'validation.email',
  isEnum: 'validation.choice',
  isInt: 'validation.integer',
  isNotEmpty: 'validation.required',
  isNumber: 'validation.number',
  isObject: 'validation.object',
  isString: 'validation.string',
  isUUID: 'validation.uuid',
  max: 'validation.max',
  maxLength: 'validation.max_length',
  min: 'validation.min',
  minLength: 'validation.min_length',
  whitelistValidation: 'validation.unknown_field',
};

function validationMessages(errors: ValidationError[]): { message: string[]; errors: Record<string, unknown>[] } {
  const messages: string[] = [];
  const details: Record<string, unknown>[] = [];
  const visit = (error: ValidationError, parent = ''): void => {
    const property = parent ? `${parent}.${error.property}` : error.property;
    for (const constraint of Object.keys(error.constraints ?? {})) {
      const code = VALIDATION_MESSAGES[constraint] ?? 'validation.invalid';
      const message = t(code, { property });
      messages.push(`${property}: ${message}`);
      details.push({ property, code, constraint, message });
    }
    error.children?.forEach((child) => visit(child, property));
  };
  errors.forEach((error) => visit(error));
  return { message: messages, errors: details };
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errors: ValidationError[]) => {
      const localized = validationMessages(errors);
      return badRequest('validation.failed', {}, localized);
    },
  });
}

export async function configureApp(app: NestFastifyApplication): Promise<void> {
  app.useGlobalPipes(createValidationPipe());
  app.setGlobalPrefix(GLOBAL_PREFIX);
  await registerMultipart(app);
}

/** JSON body-ийн дээд хэмжээ (main.ts FastifyAdapter) — хүснэгтээр оруулах ≤5000 мөр */
export const JSON_BODY_LIMIT = 4 * 1024 * 1024;
