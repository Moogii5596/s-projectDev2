import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaTenantClientService } from '../../db/prisma-tenant-client.service';
import { CacheService } from '../../cache/cache.service';
import { requireRole } from '../../common/helpers/require-role.helper';
import { decodeCursor, encodeCursor } from '../../common/utils/cursor';
import { AdjustInventoryDto, CreateInventoryItemDto, QueryInventoryDto } from './inventory.dto';

type Tx = Prisma.TransactionClient;
const WRITE_ROLES = [UserRole.OWNER, UserRole.ADMIN];

interface ItemRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  quantity: Prisma.Decimal;
  min_threshold: Prisma.Decimal;
  created_at: Date;
}

export interface InventoryItemView {
  id: string;
  sku: string;
  name: string;
  unit: string;
  quantity: string;
  minThreshold: string;
  lowStock: boolean;
  createdAt: Date;
}

const toView = (r: ItemRow): InventoryItemView => ({
  id: r.id,
  sku: r.sku,
  name: r.name,
  unit: r.unit,
  quantity: new Prisma.Decimal(r.quantity).toString(),
  minThreshold: new Prisma.Decimal(r.min_threshold).toString(),
  lowStock: new Prisma.Decimal(r.quantity).lessThanOrEqualTo(r.min_threshold),
  createdAt: r.created_at,
});

/**
 * Inventory-lite — Phase 4.2 (платформ батлах хөнгөн модуль)
 * Батлах зүйл: шинэ модуль 1 хүснэгтээр, cursor pagination (index range-тэй), Redis cache + invalidate,
 * атомик үлдэгдэл өөрчлөлт (`quantity + delta >= 0` нөхцөлтэй UPDATE).
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly cache: CacheService,
  ) {}

  private inTenantTx<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx: Tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  async list(tenantId: string, query: QueryInventoryDto) {
    const limit = query.limit ?? 20;
    let cursor: { id: string; createdAt: Date } | null = null;
    if (query.cursor) {
      try {
        cursor = decodeCursor(query.cursor);
      } catch {
        throw new BadRequestException('cursor буруу байна');
      }
    }

    const key = this.cache.buildKey('inventory', tenantId, 'list', JSON.stringify({ c: query.cursor ?? null, limit, low: !!query.lowStock }));
    const cached = await this.cache.get<{ data: InventoryItemView[]; nextCursor: string | null; hasMore: boolean }>(key);
    if (cached) return cached;

    const rows = await this.inTenantTx(tenantId, (tx) =>
      tx.$queryRaw<ItemRow[]>`
        SELECT id, sku, name, unit, quantity, min_threshold, created_at
        FROM inventory_items
        WHERE tenant_id = ${tenantId}::uuid
          AND (${query.lowStock === true} = false OR quantity <= min_threshold)
          AND (${cursor?.createdAt ?? null}::timestamptz IS NULL
               OR (created_at <= ${cursor?.createdAt ?? null}::timestamptz
                   AND (created_at < ${cursor?.createdAt ?? null}::timestamptz OR id < ${cursor?.id ?? null}::uuid)))
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit + 1}
      `,
    );
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const result = {
      data: page.map(toView),
      nextCursor: hasMore && last ? encodeCursor(last.id, last.created_at) : null,
      hasMore,
    };
    await this.cache.set(key, result, 60);
    return result;
  }

  async create(tenantId: string, authId: string, dto: CreateInventoryItemDto) {
    const item = await this.inTenantTx(tenantId, async (tx) => {
      await requireRole(tx, tenantId, authId, WRITE_ROLES);
      try {
        return await tx.inventoryItem.create({
          data: {
            tenantId,
            sku: dto.sku,
            name: dto.name,
            unit: dto.unit || 'EA',
            quantity: new Prisma.Decimal(dto.quantity ?? 0),
            minThreshold: new Prisma.Decimal(dto.minThreshold ?? 0),
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException(`SKU "${dto.sku}" аль хэдийн бүртгэгдсэн`);
        }
        throw err;
      }
    });
    await this.cache.invalidateTenant(tenantId);
    return item;
  }

  async adjust(tenantId: string, authId: string, id: string, dto: AdjustInventoryDto) {
    const row = await this.inTenantTx(tenantId, async (tx) => {
      await requireRole(tx, tenantId, authId, WRITE_ROLES);
      const delta = new Prisma.Decimal(dto.delta).toString();
      const updated = await tx.$queryRaw<ItemRow[]>`
        UPDATE inventory_items
        SET quantity = quantity + ${delta}::numeric, updated_at = clock_timestamp()
        WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid AND quantity + ${delta}::numeric >= 0
        RETURNING id, sku, name, unit, quantity, min_threshold, created_at
      `;
      if (updated[0]) return updated[0];
      const exists = await tx.inventoryItem.findFirst({ where: { id, tenantId }, select: { quantity: true } });
      if (!exists) throw new NotFoundException('Бараа олдсонгүй');
      throw new BadRequestException(`Үлдэгдэл хүрэлцэхгүй: одоо ${new Prisma.Decimal(exists.quantity).toString()}, өөрчлөлт ${delta}`);
    });
    await this.cache.invalidateTenant(tenantId);
    return toView(row);
  }
}
