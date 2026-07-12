import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the operator-chosen ``monitoring_start_date`` column to
 * ``magazine_media``. The value is set in the allseerr request
 * modal (date picker — defaults to "today") and forwarded to
 * pressarr's ``POST /api/v1/magazine`` so the dispatched
 * subscription only grabs issues published on/after that date.
 *
 * NULL is the valid "no preference" state — pressarr falls back
 * to its own default of monitoring everything available. Stored
 * as ``varchar`` rather than ``date`` for cross-DB symmetry with
 * the existing free-text fields on this entity.
 */
export class AddMonitoringStartDateToMagazineMedia1777000000000
  implements MigrationInterface
{
  name = 'AddMonitoringStartDateToMagazineMedia1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable('magazine_media');
    if (t && !t.findColumnByName('monitoringStartDate')) {
      await queryRunner.query(
        `ALTER TABLE "magazine_media" ADD COLUMN "monitoringStartDate" varchar`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
  }
}
