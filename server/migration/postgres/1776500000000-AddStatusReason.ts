import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a `statusReason` column to every non-TMDB media entity so the
 * subscriber can persist a human-readable explanation of why the
 * request is in its current state. Mirrors the SQLite migration of
 * the same name.
 */
export class AddStatusReason1776500000000 implements MigrationInterface {
  name = 'AddStatusReason1776500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'book_media',
      'audiobook_media',
      'game_media',
      'manga_media',
      'comic_media',
    ];
    for (const table of tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "statusReason" varchar`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'comic_media',
      'manga_media',
      'game_media',
      'audiobook_media',
      'book_media',
    ];
    for (const table of tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "statusReason"`
      );
    }
  }
}
