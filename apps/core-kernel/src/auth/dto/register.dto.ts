import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Зөв email хаяг оруулна уу' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Нууц үг хамгийн багадаа 8 тэмдэгт байх ёстой' })
  password!: string;

  @IsString()
  @IsOptional()
  fullName?: string;
}
