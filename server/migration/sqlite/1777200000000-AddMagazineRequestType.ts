import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds three columns on ``magazine_media`` for the new
 * subscription-vs-one-shot request shape:
 *   - ``requestType``      = 'subscription' (recurring) | 'one_shot'
 *   - ``targetIssueLabel`` = operator-typed issue id when one_shot
 *   - ``targetIssueDate``  = ISO date when the issue is identified
 *                            by publication date (dailies)
 *
 * All nullable. Existing rows default to a recurring subscription
 * at read time (the API normalises ``null`` → ``'subscription'``).
 */
export class AddMagazineRequestType1777200000000
  implements MigrationInterface
{
  name = 'AddMagazineRequestType1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable('magazine_media');
    if (t && !t.findColumnByName('requestType')) {
      await queryRunner.query(
        `ALTER TABLE "magazine_media" ADD COLUMN "requestType" varchar`
      );
    }
    if (t && !t.findColumnByName('targetIssueLabel')) {
      await queryRunner.query(
        `ALTER TABLE "magazine_media" ADD COLUMN "targetIssueLabel" varchar`
      );
    }
    if (t && !t.findColumnByName('targetIssueDate')) {
      await queryRunner.query(
        `ALTER TABLE "magazine_media" ADD COLUMN "targetIssueDate" varchar`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
  }
}
