import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds per-media availability counts so the dashboard cards can
 * derive PARTIALLY_AVAILABLE the same way TV uses per-season
 * statuses. The columns are populated by the per-provider
 * availability scanners (Suwayomi for manga, Mylar for comics).
 *   * manga_media: availableChapters, availableVolumes
 *   * comic_media: availableIssues
 */
export class AddPartialAvailabilityCounts1776700000000
  implements MigrationInterface
{
  name = 'AddPartialAvailabilityCounts1776700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const manga = await queryRunner.getTable('manga_media');
    if (manga && !manga.findColumnByName('availableChapters')) {
      await queryRunner.query(
        `ALTER TABLE "manga_media" ADD COLUMN "availableChapters" integer`
      );
    }
    if (manga && !manga.findColumnByName('availableVolumes')) {
      await queryRunner.query(
        `ALTER TABLE "manga_media" ADD COLUMN "availableVolumes" integer`
      );
    }
    const comic = await queryRunner.getTable('comic_media');
    if (comic && !comic.findColumnByName('availableIssues')) {
      await queryRunner.query(
        `ALTER TABLE "comic_media" ADD COLUMN "availableIssues" integer`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Forward-only — SQLite column drops require a table rebuild,
    // consistent with the rest of allseerr's migration history.
    void queryRunner;
  }
}
