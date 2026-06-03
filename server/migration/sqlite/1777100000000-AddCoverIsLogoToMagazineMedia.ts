import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the boolean ``coverIsLogo`` column to ``magazine_media``.
 *
 * The flag is set at request-creation time when the cascade hit
 * the operator picked has ``coverUrl`` pointing to a brand logo
 * (Wikidata P154) rather than a real cover (Wikidata P18 / Google
 * Books / ZDB). All downstream card renderers consume the flag
 * to switch from the default "fill + cover crop" treatment to a
 * "contained on a light background" layout — otherwise logos get
 * zoom-cropped to fill the tile and look unreadable.
 */
export class AddCoverIsLogoToMagazineMedia1777100000000
  implements MigrationInterface
{
  name = 'AddCoverIsLogoToMagazineMedia1777100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable('magazine_media');
    if (t && !t.findColumnByName('coverIsLogo')) {
      await queryRunner.query(
        `ALTER TABLE "magazine_media" ADD COLUMN "coverIsLogo" boolean`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
  }
}
