import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mirror of the SQLite migration of the same name. See it for
 * the rationale — three nullable varchar columns for the new
 * subscription / one-shot request shape.
 */
export class AddMagazineRequestType1777200000000
  implements MigrationInterface
{
  name = 'AddMagazineRequestType1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "magazine_media" ADD COLUMN IF NOT EXISTS "requestType" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "magazine_media" ADD COLUMN IF NOT EXISTS "targetIssueLabel" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "magazine_media" ADD COLUMN IF NOT EXISTS "targetIssueDate" varchar`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "magazine_media" DROP COLUMN IF EXISTS "targetIssueDate"`
    );
    await queryRunner.query(
      `ALTER TABLE "magazine_media" DROP COLUMN IF EXISTS "targetIssueLabel"`
    );
    await queryRunner.query(
      `ALTER TABLE "magazine_media" DROP COLUMN IF EXISTS "requestType"`
    );
  }
}
