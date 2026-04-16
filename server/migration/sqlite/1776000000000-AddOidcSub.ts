import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOidcSub1776000000000 implements MigrationInterface {
  name = 'AddOidcSub1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "oidcSub" varchar`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_user_oidcSub" ON "user" ("oidcSub")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_user_oidcSub"`);
    // SQLite does not support DROP COLUMN directly; use temp table swap
    await queryRunner.query(`
      CREATE TABLE "temporary_user" AS
      SELECT "id", "email", "plexUsername", "jellyfinUsername", "username",
             "password", "resetPasswordGuid", "recoveryLinkExpirationDate",
             "userType", "plexId", "jellyfinUserId", "jellyfinDeviceId",
             "jellyfinAuthToken", "plexToken", "permissions", "avatar",
             "avatarETag", "avatarVersion", "movieQuotaLimit",
             "movieQuotaDays", "tvQuotaLimit", "tvQuotaDays",
             "createdAt", "updatedAt"
      FROM "user"
    `);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_user" RENAME TO "user"`
    );
  }
}
