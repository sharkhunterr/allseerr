import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the magazine_media table + the magazineMediaId FK column
 * on media_request, and per-user magazineQuota{Limit,Days} on
 * user. Mirrors the SQLite migration of the same name.
 */
export class AddMagazineEntities1776800000000 implements MigrationInterface {
  name = 'AddMagazineEntities1776800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "magazine_media" (
        "id" SERIAL PRIMARY KEY,
        "mediaType" varchar NOT NULL DEFAULT 'magazine',
        "title" varchar NOT NULL,
        "externalKey" varchar NOT NULL,
        "issn" varchar,
        "googleBooksId" varchar,
        "publisher" varchar,
        "coverUrl" varchar,
        "year" integer,
        "frequency" varchar,
        "language" varchar,
        "description" varchar,
        "availableIssues" integer,
        "issueCount" integer,
        "status" integer NOT NULL DEFAULT 1,
        "downloadManagerExternalId" varchar,
        "statusReason" varchar,
        "libraryServerUrl" varchar,
        "libraryServerId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_magazine_media_externalKey" UNIQUE ("externalKey")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_magazine_media_externalKey" ON "magazine_media" ("externalKey")`
    );

    await queryRunner.query(
      `ALTER TABLE "media_request" ADD COLUMN IF NOT EXISTS "magazineMediaId" integer`
    );

    const quotaColumns: [string, string][] = [
      ['magazineQuotaLimit', 'integer'],
      ['magazineQuotaDays', 'integer'],
    ];
    for (const [name, type] of quotaColumns) {
      await queryRunner.query(
        `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "${name}" ${type}`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of ['magazineQuotaDays', 'magazineQuotaLimit']) {
      await queryRunner.query(
        `ALTER TABLE "user" DROP COLUMN IF EXISTS "${name}"`
      );
    }
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN IF EXISTS "magazineMediaId"`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "magazine_media"`);
  }
}
