export const encodeCursor = (id: string, createdAt: Date): string =>
  Buffer.from(JSON.stringify({ id, createdAt: createdAt.toISOString() })).toString('base64url');

export const decodeCursor = (cursor: string): { id: string; createdAt: Date } => {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      id: string;
      createdAt: string;
    };

    if (!decoded.id || Number.isNaN(new Date(decoded.createdAt).getTime())) {
      throw new Error('Invalid pagination cursor');
    }

    return { id: decoded.id, createdAt: new Date(decoded.createdAt) };
  } catch {
    throw new Error('Invalid pagination cursor');
  }
};