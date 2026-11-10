import { BadRequestException } from '@nestjs/common';
import { IsEmail, MinLength } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { i18nStorage } from '../i18n/i18n-context';
import { createValidationPipe } from './configure-app';

class InvalidRequestDto {
  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;
}

describe('global validation errors', () => {
  it('returns stable error codes and localized messages while retaining the legacy message list', async () => {
    const error = await i18nStorage.run(
      { lang: 'en', overrides: new Map() },
      async () => {
        try {
          await createValidationPipe().transform(
            { email: 'not-an-email', password: 'short', unexpected: true },
            { type: 'body', metatype: InvalidRequestDto, data: '' },
          );
          throw new Error('Expected request validation to fail');
        } catch (caught) {
          if (!(caught instanceof BadRequestException)) throw caught;
          return caught;
        }
      },
    );

    expect(error.getResponse()).toEqual(expect.objectContaining({
      code: 'validation.failed',
      errors: expect.arrayContaining([
        expect.objectContaining({ property: 'email', code: 'validation.email', message: 'email must be an email address' }),
        expect.objectContaining({ property: 'password', code: 'validation.min_length', message: 'password is too short' }),
        expect.objectContaining({ property: 'unexpected', code: 'validation.unknown_field', message: 'unexpected is not an allowed field' }),
      ]),
      message: expect.arrayContaining([
        'email: email must be an email address',
        'password: password is too short',
      ]),
    }));
  });
});
