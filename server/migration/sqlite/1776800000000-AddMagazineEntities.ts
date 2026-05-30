import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the magazine_media table + the magazineMediaId FK column
 * on media_request, and per-user magazineQuota{Limit,Days} on
 * user. Mirrors AddComicEntities / AddMangaEntities — same
 * shape, forward-only convention.
 *
 * MagazineMedia uses ``externalKey`` (issn:NNNN-NNNN or
 * slug:title) as the unique constraint instead of a single
 * numeric ID because magazines lack a universal stable
 * identifier the way books / games / volumes do.
 */
export class AddMagazineEntities1776800000000 implements MigrationInterface {
  name = 'AddMagazineEntities1776800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "magazine_media" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
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
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_magazine_media_externalKey" ON "magazine_media" ("externalKey")`
    );

    const mediaRequestTable = await queryRunner.getTable('media_request');
    if (
      mediaRequestTable &&
      !mediaRequestTable.findColumnByName('magazineMediaId')
    ) {
      await queryRunner.query(
        `ALTER TABLE "media_request" ADD COLUMN "magazineMediaId" integer`
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
      await addIfMissing('magazineQuotaLimit', 'integer');
      await addIfMissing('magazineQuotaDays', 'integer');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "magazine_media"`);
    void queryRunner;
  }
}
