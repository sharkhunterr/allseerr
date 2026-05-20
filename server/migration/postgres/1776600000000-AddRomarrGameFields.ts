import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `romarrId` / `romarrUrl` to `game_media` so an approved game
 * request can be dispatched to Romarr (the game acquisition service)
 * and deep-linked back to its Game row there. Mirrors the SQLite
 * migration of the same name.
 */
export class AddRomarrGameFields1776600000000 implements MigrationInterface {
  name = 'AddRomarrGameFields1776600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "game_media" ADD COLUMN IF NOT EXISTS "romarrId" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "game_media" ADD COLUMN IF NOT EXISTS "romarrUrl" varchar`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "game_media" DROP COLUMN IF EXISTS "romarrUrl"`
    );
    await queryRunner.query(
      `ALTER TABLE "game_media" DROP COLUMN IF EXISTS "romarrId"`
    );
  }
}
