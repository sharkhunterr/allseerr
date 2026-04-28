import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the comic_media table + the comicMediaId FK column on
 * media_request, and per-user comicQuota{Limit,Days} on user.
 * Mirrors the AddMangaEntities migration: same shape, same
 * forward-only convention. Permission bits 38/39 (REQUEST_COMIC /
 * AUTO_APPROVE_COMIC) need no DDL — user.permissions was already
 * widened in the BigInt permissions migration when game bits landed.
 */
export class AddComicEntities1776400000000 implements MigrationInterface {
  name = 'AddComicEntities1776400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "comic_media" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "mediaType" varchar NOT NULL DEFAULT 'comic',
        "title" varchar NOT NULL,
        "comicVineId" integer NOT NULL,
        "year" integer,
        "coverUrl" varchar,
        "issueCount" integer,
        "publisher" varchar,
        "publisherId" integer,
        "creatorName" varchar,
        "creatorKey" integer,
        "status" integer NOT NULL DEFAULT 1,
        "downloadManagerExternalId" varchar,
        "libraryServerUrl" varchar,
        "libraryServerId" integer,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_comic_media_comicVineId" ON "comic_media" ("comicVineId")`
    );

    const mediaRequestTable = await queryRunner.getTable('media_request');
    if (
      mediaRequestTable &&
      !mediaRequestTable.findColumnByName('comicMediaId')
    ) {
      await queryRunner.query(
        `ALTER TABLE "media_request" ADD COLUMN "comicMediaId" integer`
      );
    }

    const userTable = await queryRunner.getTable('user');
    if (userTable) {
      const addIfMissing = async (name: string, definition: string) => {
        if (!userTable.findColumnByName(name)) {
          await queryRunner.query(
            `ALTER TABLE "user" ADD COLUMN "${name}" ${definition}`
          );
        }
      };
      await addIfMissing('comicQuotaLimit', 'integer');
      await addIfMissing('comicQuotaDays', 'integer');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "comic_media"`);
    void queryRunner;
  }
}
