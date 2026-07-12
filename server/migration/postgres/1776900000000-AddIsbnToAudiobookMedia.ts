import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds nullable `isbn13` / `isbn10` columns to `audiobook_media`.
 * Mirror of the SQLite migration of the same name — see that file
 * for the rationale.
 */
export class AddIsbnToAudiobookMedia1776900000000
  implements MigrationInterface
{
  name = 'AddIsbnToAudiobookMedia1776900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audiobook_media" ADD COLUMN IF NOT EXISTS "isbn13" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "audiobook_media" ADD COLUMN IF NOT EXISTS "isbn10" varchar`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audiobook_media" DROP COLUMN IF EXISTS "isbn10"`
    );
    await queryRunner.query(
      `ALTER TABLE "audiobook_media" DROP COLUMN IF EXISTS "isbn13"`
    );
  }
}
