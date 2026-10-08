import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Зөв email хаяг оруулна уу' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Нууц үг оруулна уу' })
  password!: string;
}
