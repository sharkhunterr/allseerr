import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the manga_media table + the mangaMediaId FK column on
 * media_request, and per-user mangaQuota{Limit,Days} on user. Mirrors
 * the SQLite migration of the same name + the bigint slice from
 * AddBookGameQuotasAndBigIntPermissions (no widening here — that
 * migration already widened user.permissions to int8 when game bits
 * landed at 2³⁵, and the new manga bits at 2³⁶/2³⁷ still fit).
 */
export class AddMangaEntities1776300000000 implements MigrationInterface {
  name = 'AddMangaEntities1776300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "manga_media" (
        "id" SERIAL PRIMARY KEY,
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
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_manga_media_anilistId" UNIQUE ("anilistId")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_manga_media_anilistId" ON "manga_media" ("anilistId")`
    );

    await queryRunner.query(
      `ALTER TABLE "media_request" ADD COLUMN IF NOT EXISTS "mangaMediaId" integer`
    );

    const quotaColumns: [string, string][] = [
      ['mangaQuotaLimit', 'integer'],
      ['mangaQuotaDays', 'integer'],
    ];
    for (const [name, type] of quotaColumns) {
      await queryRunner.query(
        `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "${name}" ${type}`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of ['mangaQuotaDays', 'mangaQuotaLimit']) {
      await queryRunner.query(
        `ALTER TABLE "user" DROP COLUMN IF EXISTS "${name}"`
      );
    }
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN IF EXISTS "mangaMediaId"`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "manga_media"`);
  }
}
