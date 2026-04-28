import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the comic_media table + the comicMediaId FK column on
 * media_request, and per-user comicQuota{Limit,Days} on user.
 * Mirrors AddMangaEntities — the user.permissions column was
 * already widened to bigint in the BigInt permissions migration.
 */
export class AddComicEntities1776400000000 implements MigrationInterface {
  name = 'AddComicEntities1776400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "comic_media" (
        "id" SERIAL PRIMARY KEY,
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
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_comic_media_comicVineId" UNIQUE ("comicVineId")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_comic_media_comicVineId" ON "comic_media" ("comicVineId")`
    );

    await queryRunner.query(
      `ALTER TABLE "media_request" ADD COLUMN IF NOT EXISTS "comicMediaId" integer`
    );

    const quotaColumns: [string, string][] = [
      ['comicQuotaLimit', 'integer'],
      ['comicQuotaDays', 'integer'],
    ];
    for (const [name, type] of quotaColumns) {
      await queryRunner.query(
        `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "${name}" ${type}`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of ['comicQuotaDays', 'comicQuotaLimit']) {
      await queryRunner.query(
        `ALTER TABLE "user" DROP COLUMN IF EXISTS "${name}"`
      );
    }
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN IF EXISTS "comicMediaId"`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "comic_media"`);
  }
}
