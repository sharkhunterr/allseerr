import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the manga_media table + the mangaMediaId FK column on
 * media_request, and per-user mangaQuota{Limit,Days} on user. Mirrors
 * the shape of AddBookAudiobookEntities + the gameQuota slice from
 * AddBookGameQuotasAndBigIntPermissions.
 *
 * Permission bits 36/37 (REQUEST_MANGA / AUTO_APPROVE_MANGA) require
 * no DDL change here — the user.permissions column was already widened
 * in the BigInt permissions migration when game bits were added.
 */
export class AddMangaEntities1776300000000 implements MigrationInterface {
  name = 'AddMangaEntities1776300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "manga_media" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "mediaType" varchar NOT NULL DEFAULT 'manga',
        "title" varchar NOT NULL,
        "anilistId" integer NOT NULL,
        "malId" integer,
        "titleNative" varchar,
        "coverUrl" varchar,
        "year" integer,
        "format" varchar,
        "status_anilist" varchar,
        "chapters" integer,
        "volumes" integer,
        "countryOfOrigin" varchar,
        "authorName" varchar,
        "status" integer NOT NULL DEFAULT 1,
        "downloadManagerExternalId" varchar,
        "libraryServerUrl" varchar,
        "libraryServerId" integer,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_manga_media_anilistId" ON "manga_media" ("anilistId")`
    );

    // Nullable FK column on media_request so a manga request can point
    // at the manga_media row that backs it.
    const mediaRequestTable = await queryRunner.getTable('media_request');
    if (mediaRequestTable && !mediaRequestTable.findColumnByName('mangaMediaId')) {
      await queryRunner.query(
        `ALTER TABLE "media_request" ADD COLUMN "mangaMediaId" integer`
      );
    }

    // Per-user manga quota columns. SQLite stores arbitrary-width
    // integers in any "integer" column so no widening dance needed.
    const userTable = await queryRunner.getTable('user');
    if (userTable) {
      const addIfMissing = async (name: string, definition: string) => {
        if (!userTable.findColumnByName(name)) {
          await queryRunner.query(
            `ALTER TABLE "user" ADD COLUMN "${name}" ${definition}`
          );
        }
      };
      await addIfMissing('mangaQuotaLimit', 'integer');
      await addIfMissing('mangaQuotaDays', 'integer');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "manga_media"`);
    // SQLite ALTER TABLE DROP COLUMN requires a table rebuild — skipping
    // the cleanup of media_request.mangaMediaId / user.mangaQuota* on
    // rollback, consistent with the rest of allseerr's forward-only
    // migration history.
    void queryRunner;
  }
}
