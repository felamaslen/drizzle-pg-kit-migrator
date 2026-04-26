import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { main } from "../src/cli.js";

import { createTempDatabase, query } from "./db.js";

const ARGV0 = ["node", "drizzle-pgkit-migrator"];

interface TestContext {
  migrationsDir: string;
  databaseUrl: string;
  cleanup: () => Promise<void>;
}

async function setup(): Promise<TestContext> {
  const workDir = mkdtempSync(path.join(tmpdir(), "dpkm-migrator-"));
  const migrationsDir = path.join(workDir, "migrations");
  mkdirSync(migrationsDir, { recursive: true });
  const db = await createTempDatabase();
  return {
    migrationsDir,
    databaseUrl: db.url,
    cleanup: async () => {
      await db.drop();
      rmSync(workDir, { recursive: true, force: true });
    },
  };
}

function migrateArgs(ctx: TestContext, ...extra: string[]): string[] {
  return [
    ...ARGV0,
    "migrate",
    "--database-url",
    ctx.databaseUrl,
    "--migrations-dir",
    ctx.migrationsDir,
    ...extra,
  ];
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("cli: migrate", () => {
  it("creates the migrator schema and applies pending migrations", async () => {
    const ctx = await setup();
    try {
      writeFileSync(
        path.join(ctx.migrationsDir, "20260101000000-create_thing.sql"),
        `CREATE TABLE "Thing" ("id" int PRIMARY KEY);`,
      );
      writeFileSync(
        path.join(ctx.migrationsDir, "20260101000001-add_column.sql"),
        `ALTER TABLE "Thing" ADD COLUMN "name" text NOT NULL DEFAULT '';`,
      );

      const code = await main(migrateArgs(ctx, "up"));
      expect(code).toBe(0);

      const cols = await query<{ column_name: string }>(
        ctx.databaseUrl,
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'Thing' ORDER BY column_name`,
      );
      expect(cols.rows.map((r) => r.column_name)).toEqual(["id", "name"]);

      const tracked = await query<{ name: string; status: string }>(
        ctx.databaseUrl,
        `SELECT name, status FROM migrator_internal.migrations ORDER BY name`,
      );
      expect(tracked.rows.map((r) => r.name)).toEqual([
        "20260101000000-create_thing.sql",
        "20260101000001-add_column.sql",
      ]);
      expect(tracked.rows.every((r) => r.status === "executed")).toBe(true);
    } finally {
      await ctx.cleanup();
    }
  });

  it("re-running up after success is a no-op", async () => {
    const ctx = await setup();
    try {
      writeFileSync(
        path.join(ctx.migrationsDir, "20260101000000-noop.sql"),
        `CREATE TABLE "X" (id int);`,
      );

      expect(await main(migrateArgs(ctx, "up"))).toBe(0);
      expect(await main(migrateArgs(ctx, "up"))).toBe(0);

      const tables = await query<{ table_name: string }>(
        ctx.databaseUrl,
        `SELECT table_name FROM information_schema.tables WHERE table_name = 'X'`,
      );
      expect(tables.rows).toHaveLength(1);
    } finally {
      await ctx.cleanup();
    }
  });

  it("supports a custom --migration-schema", async () => {
    const ctx = await setup();
    try {
      writeFileSync(
        path.join(ctx.migrationsDir, "20260101000000-custom.sql"),
        `CREATE TABLE "C" (id int);`,
      );

      const code = await main(
        migrateArgs(ctx, "--migration-schema", "my_custom_migrator", "up"),
      );
      expect(code).toBe(0);

      const tracked = await query<{ name: string }>(
        ctx.databaseUrl,
        `SELECT name FROM my_custom_migrator.migrations`,
      );
      expect(tracked.rows.map((r) => r.name)).toEqual([
        "20260101000000-custom.sql",
      ]);

      const def = await query<{ exists: boolean }>(
        ctx.databaseUrl,
        `SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'migrator_internal') AS exists`,
      );
      expect(def.rows[0]!.exists).toBe(false);
    } finally {
      await ctx.cleanup();
    }
  });

  it("lists migrations", async () => {
    const ctx = await setup();
    try {
      const consoleSpy = vi.spyOn(console, "log");
      writeFileSync(
        path.join(ctx.migrationsDir, "20260101000000-create_thing.sql"),
        `CREATE TABLE "Thing" ("id" int PRIMARY KEY);`,
      );
      writeFileSync(
        path.join(ctx.migrationsDir, "20260101000001-add_column.sql"),
        `ALTER TABLE "Thing" ADD COLUMN "name" text NOT NULL DEFAULT '';`,
      );

      const code = await main(migrateArgs(ctx, "list"));
      expect(code).toBe(0);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toMatchObject([
        {
          name: "20260101000000-create_thing.sql",
          path: expect.stringContaining(
            "/migrations/20260101000000-create_thing.sql",
          ),
          content: 'CREATE TABLE "Thing" ("id" int PRIMARY KEY);',
          status: "pending",
        },
        {
          name: "20260101000001-add_column.sql",
          path: expect.stringContaining(
            "/migrations/20260101000001-add_column.sql",
          ),
          content:
            'ALTER TABLE "Thing" ADD COLUMN "name" text NOT NULL DEFAULT \'\';',
          status: "pending",
        },
      ]);
    } finally {
      await ctx.cleanup();
    }
  });

  it("lists pending and executed migrations", async () => {
    const ctx = await setup();
    try {
      writeFileSync(
        path.join(ctx.migrationsDir, "20260101000000-create_thing.sql"),
        `CREATE TABLE "Thing" ("id" int PRIMARY KEY);`,
      );
      await main(migrateArgs(ctx, "up"));
      writeFileSync(
        path.join(ctx.migrationsDir, "20260101000001-add_column.sql"),
        `ALTER TABLE "Thing" ADD COLUMN "name" text NOT NULL DEFAULT '';`,
      );

      const consoleSpy = vi.spyOn(console, "log");

      await expect(main(migrateArgs(ctx, "executed"))).resolves.toBe(0);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toMatchObject([
        {
          name: "20260101000000-create_thing.sql",
          path: expect.stringContaining(
            "/migrations/20260101000000-create_thing.sql",
          ),
          content: 'CREATE TABLE "Thing" ("id" int PRIMARY KEY);',
          status: "executed",
        },
      ]);

      await expect(main(migrateArgs(ctx, "pending"))).resolves.toBe(0);
      expect(JSON.parse(consoleSpy.mock.calls[1][0] as string)).toMatchObject([
        {
          name: "20260101000001-add_column.sql",
          path: expect.stringContaining(
            "/migrations/20260101000001-add_column.sql",
          ),
          content:
            'ALTER TABLE "Thing" ADD COLUMN "name" text NOT NULL DEFAULT \'\';',
          status: "pending",
        },
      ]);
    } finally {
      await ctx.cleanup();
    }
  });
});
