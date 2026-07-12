import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds ``coverIsLogo`` to ``magazine_media``. Mirror of the SQLite
 * migration of the same name — see it for the rationale.
 */
export class AddCoverIsLogoToMagazineMedia1777100000000
  implements MigrationInterface
{
  name = 'AddCoverIsLogoToMagazineMedia1777100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "magazine_media" ADD COLUMN IF NOT EXISTS "coverIsLogo" boolean`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "magazine_media" DROP COLUMN IF EXISTS "coverIsLogo"`
    );
  }
}
