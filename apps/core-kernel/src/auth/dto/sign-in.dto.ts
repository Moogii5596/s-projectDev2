import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

/** v0.2.2 D-10 — утас / username / имэйл + нууц үг */
export class SignInDto {
  @IsString() @MinLength(1) @MaxLength(254)
  identifier!: string;

  @IsString() @MinLength(1) @MaxLength(128)
  password!: string;
}

/** D-06, D-12 — шинэ нууц үг ≥ 12 (Supabase `minimum_password_length` = 12) */
export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(128)
  currentPassword!: string;

  @IsString() @MinLength(12, { message: 'Шинэ нууц үг хамгийн багадаа 12 тэмдэгт байна' }) @MaxLength(72)
  newPassword!: string;
}

/** v0.2.2 Блок 3 — урилга / reset хүлээн авах */
export class AcceptInviteDto {
  @IsString() @MinLength(12, { message: 'Шинэ нууц үг хамгийн багадаа 12 тэмдэгт байна' }) @MaxLength(72)
  password!: string;
}

export class ForgotPasswordDto {
  @IsString() @MinLength(1) @MaxLength(254)
  identifier!: string;
}

export class CreateInviteDto {
  @IsIn(['LINK', 'EMAIL'])
  channel!: 'LINK' | 'EMAIL';
}
