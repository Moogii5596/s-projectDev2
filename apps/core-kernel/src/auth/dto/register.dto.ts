import { IsEmail, IsString, MinLength, IsOptional, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Зөв email хаяг оруулна уу' })
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой' })
  @MaxLength(72)
  password!: string;

  @IsString()
  @IsOptional()
  fullName?: string;
}
