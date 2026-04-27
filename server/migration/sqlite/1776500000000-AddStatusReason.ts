import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a `statusReason` column to every non-TMDB media entity so the
 * subscriber can persist a human-readable explanation of why the
 * request is in its current state ("no download manager configured",
 * "no Suwayomi source matched the title", "Mylar rejected the
 * addComic command", …). Null = nothing to say beyond what the
 * status badge already shows.
 *
 * Phase 1 only: just persists what the dispatchers already produce.
 * Live remote lookups (Radarr/Sonarr queue state) and release-date
 * awareness are out of scope here.
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
      const t = await queryRunner.getTable(table);
      if (t && !t.findColumnByName('statusReason')) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ADD COLUMN "statusReason" varchar`
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite ALTER TABLE DROP COLUMN requires a table rebuild and is
    // rarely worth it — rollback is a no-op, consistent with the rest
    // of allseerr's forward-only migration history.
    void queryRunner;
  }
}
