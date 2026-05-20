import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `romarrId` / `romarrUrl` to `game_media` so an approved game
 * request can be dispatched to Romarr (the game acquisition service)
 * and deep-linked back to its Game row there. Mirrors the existing
 * `rommId` / `rommUrl` pair, which serves the library ("Play") role.
 */
export class AddRomarrGameFields1776600000000 implements MigrationInterface {
  name = 'AddRomarrGameFields1776600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable('game_media');
    if (t && !t.findColumnByName('romarrId')) {
      await queryRunner.query(
        `ALTER TABLE "game_media" ADD COLUMN "romarrId" integer`
      );
    }
    if (t && !t.findColumnByName('romarrUrl')) {
      await queryRunner.query(
        `ALTER TABLE "game_media" ADD COLUMN "romarrUrl" varchar`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite ALTER TABLE DROP COLUMN requires a table rebuild and is
    // rarely worth it — rollback is a no-op, consistent with the rest
    // of allseerr's forward-only migration history.
    void queryRunner;
  }
}
