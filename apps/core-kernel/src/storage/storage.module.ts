import { Module } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ImageProcessorService } from './image-processor.service';
import { LocalDiskStorage } from './local-disk.storage';
import { MediaService } from './media.service';
import { MEDIA_URL_SIGNER, MediaUrlSigner, mediaUrlSecret } from './media-url';
import { STORAGE_SERVICE } from './storage.service';

/** `STORAGE_DIR` (pilot.ps1: PILOT_STORAGE_DIR) → эс бөгөөс repo root (`pnpm-workspace.yaml`)-ийн `storage/` (.gitignore) */
export function storageDir(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  if (env['STORAGE_DIR']) return resolve(env['STORAGE_DIR']);
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return join(dir, 'storage');
    const up = dirname(dir);
    if (up === dir) return join(resolve(cwd), 'storage');
    dir = up;
  }
}

/** Файл хадгалалт (v0.2.3 Блок 5): LocalDiskStorage — хостинг шийдэгдвэл (ADR-002) энд л солигдоно */
@Module({
  providers: [
    ImageProcessorService,
    MediaService,
    { provide: STORAGE_SERVICE, useFactory: () => new LocalDiskStorage(storageDir()) },
    { provide: MEDIA_URL_SIGNER, useFactory: () => new MediaUrlSigner(mediaUrlSecret()) },
  ],
  exports: [MediaService, MEDIA_URL_SIGNER, STORAGE_SERVICE],
})
export class StorageModule {}
