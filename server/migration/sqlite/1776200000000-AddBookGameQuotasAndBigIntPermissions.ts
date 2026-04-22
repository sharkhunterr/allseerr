import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add per-type quota columns (book / audiobook / game) on `user` and
 * widen `user.permissions` to bigint so the new AUTO_APPROVE_BOOK /
 * AUTO_APPROVE_AUDIOBOOK / AUTO_APPROVE_GAME / REQUEST_GAME bits
 * (bits 32–35) fit without overflowing int32.
 *
 * SQLite doesn't enforce column types the way PG does — the existing
 * `integer` column already stores arbitrary-width integers — so the
 * "widen" step is a no-op at the storage layer. The column type
 * annotation on the entity still matters for TypeORM's transformer
 * and for parity with the PG migration.
 */
export class AddBookGameQuotasAndBigIntPermissions1776200000000
  implements MigrationInterface
{
  name = 'AddBookGameQuotasAndBigIntPermissions1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('user');
    if (!table) return;

    const addIfMissing = async (name: string, definition: string) => {
      if (!table.findColumnByName(name)) {
        await queryRunner.query(
          `ALTER TABLE "user" ADD COLUMN "${name}" ${definition}`
        );
      }
    };

    await addIfMissing('bookQuotaLimit', 'integer');
    await addIfMissing('bookQuotaDays', 'integer');
    await addIfMissing('audiobookQuotaLimit', 'integer');
    await addIfMissing('audiobookQuotaDays', 'integer');
    await addIfMissing('gameQuotaLimit', 'integer');
    await addIfMissing('gameQuotaDays', 'integer');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite ALTER TABLE DROP COLUMN requires a table rebuild and is
    // rarely worth it here — rollback is a no-op. TypeORM migrations
    // for allseerr are forward-only in practice.
    void queryRunner;
  }
}
