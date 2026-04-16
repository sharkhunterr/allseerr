import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookAudiobookEntities1776100000000
  implements MigrationInterface
{
  name = 'AddBookAudiobookEntities1776100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "book_media" (
        "id" SERIAL PRIMARY KEY,
        "mediaType" varchar NOT NULL DEFAULT 'book',
        "title" varchar NOT NULL,
        "authorName" varchar NOT NULL,
        "isbn13" varchar,
        "isbn10" varchar,
        "foreignBookId" varchar NOT NULL UNIQUE,
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
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audiobook_media" (
        "id" SERIAL PRIMARY KEY,
        "mediaType" varchar NOT NULL DEFAULT 'audiobook',
        "title" varchar NOT NULL,
        "authorName" varchar NOT NULL,
        "narratorName" varchar,
        "durationSeconds" integer,
        "asin" varchar,
        "foreignBookId" varchar NOT NULL UNIQUE,
        "foreignAuthorId" varchar,
        "publisher" varchar,
        "year" integer,
        "coverUrl" varchar,
        "openLibraryId" varchar,
        "status" integer NOT NULL DEFAULT 1,
        "libraryServerId" integer,
        "libraryServerUrl" varchar,
        "downloadManagerExternalId" varchar,
        "isAbridged" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "download_manager_instance" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar NOT NULL,
        "serviceType" varchar NOT NULL,
        "hostname" varchar NOT NULL,
        "port" integer NOT NULL DEFAULT 8787,
        "apiKey" varchar NOT NULL,
        "useSsl" boolean NOT NULL DEFAULT false,
        "baseUrl" varchar,
        "mediaTypes" varchar NOT NULL DEFAULT '',
        "isFallback" boolean NOT NULL DEFAULT false,
        "isActive" boolean NOT NULL DEFAULT true,
        "qualityProfileId" integer,
        "qualityProfileName" varchar,
        "rootFolderPath" varchar,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "library_server_instance" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar NOT NULL,
        "serviceType" varchar NOT NULL,
        "hostname" varchar NOT NULL,
        "port" integer NOT NULL DEFAULT 8080,
        "apiKey" varchar,
        "useSsl" boolean NOT NULL DEFAULT false,
        "baseUrl" varchar,
        "mediaTypes" varchar NOT NULL DEFAULT '',
        "isActive" boolean NOT NULL DEFAULT true,
        "scanIntervalSeconds" integer NOT NULL DEFAULT 300,
        "lastScanTimestamp" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "media_request" ADD COLUMN IF NOT EXISTS "bookMediaId" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD COLUMN IF NOT EXISTS "audiobookMediaId" integer`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN IF EXISTS "audiobookMediaId"`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN IF EXISTS "bookMediaId"`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "library_server_instance"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "download_manager_instance"`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "audiobook_media"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "book_media"`);
  }
}
