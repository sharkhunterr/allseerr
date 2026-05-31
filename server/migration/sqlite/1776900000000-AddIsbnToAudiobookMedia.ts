import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds nullable `isbn13` / `isbn10` columns to `audiobook_media`.
 * AudiobookMedia is identified primarily by ASIN, but downstream
 * services that key off OpenLibrary Works (Bindery, Bookshelf,
 * Livrarr) need an ISBN to bridge a Hardcover-shaped foreignBookId
 * to their canonical OL Work ID. Hardcover surfaces both fields on
 * its edition records so we capture them at discovery time.
 *
 * Forward-only — no backfill (Hardcover lookups happen at next
 * request). Existing audiobook rows simply keep ISBN as NULL until
 * re-resolved.
 */
export class AddIsbnToAudiobookMedia1776900000000
  implements MigrationInterface
{
  name = 'AddIsbnToAudiobookMedia1776900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable('audiobook_media');
    if (t && !t.findColumnByName('isbn13')) {
      await queryRunner.query(
        `ALTER TABLE "audiobook_media" ADD COLUMN "isbn13" varchar`
      );
    }
    if (t && !t.findColumnByName('isbn10')) {
      await queryRunner.query(
        `ALTER TABLE "audiobook_media" ADD COLUMN "isbn10" varchar`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite DROP COLUMN requires a table rebuild; rollback is a
    // no-op, consistent with the rest of allseerr's forward-only
    // migration history.
    void queryRunner;
  }
}
