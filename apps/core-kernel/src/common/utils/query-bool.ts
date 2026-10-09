/**
 * Query string boolean хөрвүүлэгч — [VALID-001]
 * main.ts-ийн ValidationPipe `enableImplicitConversion: true` нь `@Transform`-оос ӨМНӨ `Boolean('false') === true`
 * болгодог тул `value`-д найдаж болохгүй → АНХНЫ утгыг (`obj[key]`) уншина.
 * 'true' / true → true · 'false' / false → false · бусад → өөрчлөхгүй (@IsBoolean 400 өгнө)
 */
export const queryBool = ({ obj, key, value }: { obj: Record<string, unknown>; key: string; value: unknown }): unknown => {
  const raw = obj && key in obj ? obj[key] : value;
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  return raw;
};
