import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add per-type quota columns (book / audiobook / game) on `user` and
 * widen `user.permissions` from int4 to int8 so the new
 * AUTO_APPROVE_BOOK / AUTO_APPROVE_AUDIOBOOK / AUTO_APPROVE_GAME /
 * REQUEST_GAME bits (bits 32–35) fit — int4 tops out at 2³¹-1, and
 * REQUEST_AUDIOBOOK already sits at 2³¹ so Postgres instances were
 * technically already running close to the wall.
 */
export class AddBookGameQuotasAndBigIntPermissions1776200000000
  implements MigrationInterface
{
  name = 'AddBookGameQuotasAndBigIntPermissions1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "permissions" TYPE bigint USING "permissions"::bigint`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "permissions" SET DEFAULT 0`
    );

    const columns: Array<[string, string]> = [
      ['bookQuotaLimit', 'integer'],
      ['bookQuotaDays', 'integer'],
      ['audiobookQuotaLimit', 'integer'],
      ['audiobookQuotaDays', 'integer'],
      ['gameQuotaLimit', 'integer'],
      ['gameQuotaDays', 'integer'],
    ];
    for (const [name, type] of columns) {
      await queryRunner.query(
        `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "${name}" ${type}`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columns = [
      'gameQuotaDays',
      'gameQuotaLimit',
      'audiobookQuotaDays',
      'audiobookQuotaLimit',
      'bookQuotaDays',
      'bookQuotaLimit',
    ];
    for (const name of columns) {
      await queryRunner.query(
        `ALTER TABLE "user" DROP COLUMN IF EXISTS "${name}"`
      );
    }
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "permissions" TYPE integer USING "permissions"::integer`
    );
  }
}
