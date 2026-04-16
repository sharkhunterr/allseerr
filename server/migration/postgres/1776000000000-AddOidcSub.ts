import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOidcSub1776000000000 implements MigrationInterface {
  name = 'AddOidcSub1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "oidcSub" varchar UNIQUE`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "oidcSub"`
    );
  }
}
