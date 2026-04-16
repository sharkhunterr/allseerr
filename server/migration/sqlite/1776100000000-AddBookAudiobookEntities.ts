import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookAudiobookEntities1776100000000
  implements MigrationInterface
{
  name = 'AddBookAudiobookEntities1776100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "book_media" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "mediaType" varchar NOT NULL DEFAULT 'book',
        "title" varchar NOT NULL,
        "authorName" varchar NOT NULL,
        "isbn13" varchar,
        "isbn10" varchar,
        "foreignBookId" varchar NOT NULL,
        "foreignAuthorId" varchar,
        "publisher" varchar,
        "year" integer,
        "coverUrl" varchar,
        "seriesName" varchar,
        "seriesPosition" integer,
        "openLibraryId" varchar,
        "status" integer NOT NULL DEFAULT 1,
        "libraryServerId" integer,
        "libraryServerUrl" varchar,
        "downloadManagerExternalId" varchar,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_book_media_foreignBookId" ON "book_media" ("foreignBookId")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audiobook_media" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "mediaType" varchar NOT NULL DEFAULT 'audiobook',
        "title" varchar NOT NULL,
        "authorName" varchar NOT NULL,
        "narratorName" varchar,
        "durationSeconds" integer,
        "asin" varchar,
        "foreignBookId" varchar NOT NULL,
        "foreignAuthorId" varchar,
        "publisher" varchar,
        "year" integer,
        "coverUrl" varchar,
        "openLibraryId" varchar,
        "status" integer NOT NULL DEFAULT 1,
        "libraryServerId" integer,
        "libraryServerUrl" varchar,
        "downloadManagerExternalId" varchar,
        "isAbridged" boolean NOT NULL DEFAULT 0,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_audiobook_media_foreignBookId" ON "audiobook_media" ("foreignBookId")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "download_manager_instance" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" varchar NOT NULL,
        "serviceType" varchar NOT NULL,
        "hostname" varchar NOT NULL,
        "port" integer NOT NULL DEFAULT 8787,
        "apiKey" varchar NOT NULL,
        "useSsl" boolean NOT NULL DEFAULT 0,
        "baseUrl" varchar,
        "mediaTypes" varchar NOT NULL DEFAULT '',
        "isFallback" boolean NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT 1,
        "qualityProfileId" integer,
        "qualityProfileName" varchar,
        "rootFolderPath" varchar,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "library_server_instance" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" varchar NOT NULL,
        "serviceType" varchar NOT NULL,
        "hostname" varchar NOT NULL,
        "port" integer NOT NULL DEFAULT 8080,
        "apiKey" varchar,
        "useSsl" boolean NOT NULL DEFAULT 0,
        "baseUrl" varchar,
        "mediaTypes" varchar NOT NULL DEFAULT '',
        "isActive" boolean NOT NULL DEFAULT 1,
        "scanIntervalSeconds" integer NOT NULL DEFAULT 300,
        "lastScanTimestamp" integer,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Add nullable FK columns to media_request for book/audiobook linkage
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD COLUMN "bookMediaId" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD COLUMN "audiobookMediaId" integer`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite doesn't support DROP COLUMN easily; for dev use only
    await queryRunner.query(`DROP TABLE IF EXISTS "library_server_instance"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "download_manager_instance"`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "audiobook_media"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "book_media"`);
  }
}
