import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds per-media availability counts so the dashboard cards can
 * derive PARTIALLY_AVAILABLE the same way TV uses per-season
 * statuses. Mirrors the SQLite migration of the same name.
 */
export class AddPartialAvailabilityCounts1776700000000
  implements MigrationInterface
{
  name = 'AddPartialAvailabilityCounts1776700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "manga_media" ADD COLUMN IF NOT EXISTS "availableChapters" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "manga_media" ADD COLUMN IF NOT EXISTS "availableVolumes" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "comic_media" ADD COLUMN IF NOT EXISTS "availableIssues" integer`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "comic_media" DROP COLUMN IF EXISTS "availableIssues"`
    );
    await queryRunner.query(
      `ALTER TABLE "manga_media" DROP COLUMN IF EXISTS "availableVolumes"`
    );
    await queryRunner.query(
      `ALTER TABLE "manga_media" DROP COLUMN IF EXISTS "availableChapters"`
    );
  }
}
