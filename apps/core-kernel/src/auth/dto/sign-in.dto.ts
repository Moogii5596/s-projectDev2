import { IsString, MaxLength, MinLength } from 'class-validator';

/** v0.2.2 D-10 — утас / username / имэйл + нууц үг */
export class SignInDto {
  @IsString() @MinLength(1) @MaxLength(254)
  identifier!: string;

  @IsString() @MinLength(1) @MaxLength(128)
  password!: string;
}

/** Tenant-ийн бодлогыг үйлчилгээ шалгана; нийтлэг доод хязгаар = 6 */
export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(128)
  currentPassword!: string;

  @IsString() @MinLength(6, { message: 'Шинэ нууц үг хамгийн багадаа 6 тэмдэгт байна' }) @MaxLength(72)
  newPassword!: string;
}

/** v0.2.2 Блок 3 — урилга / reset хүлээн авах */
export class AcceptInviteDto {
  @IsString() @MinLength(6, { message: 'Шинэ нууц үг хамгийн багадаа 6 тэмдэгт байна' }) @MaxLength(72)
  password!: string;
}

export class ForgotPasswordDto {
  @IsString() @MinLength(1) @MaxLength(254)
  identifier!: string;
}
