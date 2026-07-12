import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds ``monitoringStartDate`` to ``magazine_media``. Mirror of
 * the SQLite migration of the same name — see that file for the
 * rationale.
 */
export class AddMonitoringStartDateToMagazineMedia1777000000000
  implements MigrationInterface
{
  name = 'AddMonitoringStartDateToMagazineMedia1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "magazine_media" ADD COLUMN IF NOT EXISTS "monitoringStartDate" varchar`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "magazine_media" DROP COLUMN IF EXISTS "monitoringStartDate"`
    );
  }
}
