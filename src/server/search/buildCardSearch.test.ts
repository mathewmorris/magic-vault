import { type Prisma } from "@prisma/client";

import { parseQuery } from "~/utils/search/parseQuery";
import { buildCardSearch, buildSearchConditions, containsPattern } from "./buildCardSearch";

/** The SQL text with whitespace collapsed, so tests don't depend on layout. */
const flat = (sql: Prisma.Sql) => sql.text.replace(/\s+/g, " ").trim();

const where = (query: string) => buildSearchConditions(parseQuery(query).terms);

const ENGLISH = `("lang" = 'en' OR "lang" IS NULL)`;
const CARD_COLORS = `COALESCE("colors", jsonb_path_query_array("card_faces", '$[*].colors[*]'))`;

describe("containsPattern", () => {
  test("wraps the value in wildcards", () => {
    expect(containsPattern("bolt")).toBe("%bolt%");
  });

  test("escapes ILIKE wildcards and backslashes", () => {
    expect(containsPattern("100%_done\\")).toBe("%100\\%\\_done\\\\%");
  });
});

describe("buildSearchConditions", () => {
  test("with no terms it only keeps English cards", () => {
    const sql = buildSearchConditions([]);
    expect(flat(sql)).toBe(ENGLISH);
    expect(sql.values).toStrictEqual([]);
  });

  test("name terms are parameterized ILIKE patterns", () => {
    const sql = where('lightning "of the"');
    expect(flat(sql)).toBe(`${ENGLISH} AND "name" ILIKE $1 AND "name" ILIKE $2`);
    expect(sql.values).toStrictEqual(["%lightning%", "%of the%"]);
  });

  test("user input never ends up in the SQL text", () => {
    const sql = where(`"'; DROP TABLE users; --" t:"x' OR 1=1" s:lea'--`);
    expect(sql.text).not.toContain("DROP");
    expect(sql.text).not.toContain("1=1");
    expect(sql.text).not.toContain("lea");
    expect(sql.values).toHaveLength(3);
  });

  test("negated terms also match rows where the column is empty", () => {
    const sql = where("-goblin");
    expect(flat(sql)).toBe(`${ENGLISH} AND NOT COALESCE("name" ILIKE $1, FALSE)`);
    expect(sql.values).toStrictEqual(["%goblin%"]);
  });

  test("type", () => {
    const sql = where("t:creature");
    expect(flat(sql)).toBe(`${ENGLISH} AND "type_line" ILIKE $1`);
    expect(sql.values).toStrictEqual(["%creature%"]);
  });

  test("oracle text falls back to the faces of double-faced cards", () => {
    const sql = where('o:"draw a card"');
    expect(flat(sql)).toBe(
      `${ENGLISH} AND ("oracle_text" ILIKE $1 OR ("oracle_text" IS NULL AND ` +
        `(SELECT string_agg("face"."text", ' ') FROM jsonb_array_elements_text(` +
        `jsonb_path_query_array("card_faces", '$[*].oracle_text')) AS "face"("text")) ILIKE $2))`,
    );
    expect(sql.values).toStrictEqual(["%draw a card%", "%draw a card%"]);
  });

  describe("colors", () => {
    test("c: means at least these colors", () => {
      const sql = where("c:wu");
      expect(flat(sql)).toBe(`${ENGLISH} AND ${CARD_COLORS} @> $1::jsonb`);
      expect(sql.values).toStrictEqual(['["W","U"]']);
    });

    test("c<= means within these colors", () => {
      const sql = where("c<=wu");
      expect(flat(sql)).toBe(`${ENGLISH} AND ${CARD_COLORS} <@ $1::jsonb`);
    });

    test("c= means exactly these colors", () => {
      const sql = where("c=r");
      expect(flat(sql)).toBe(
        `${ENGLISH} AND (${CARD_COLORS} @> $1::jsonb AND ${CARD_COLORS} <@ $2::jsonb)`,
      );
      expect(sql.values).toStrictEqual(['["R"]', '["R"]']);
    });

    test("c> is a strict superset and c< a strict subset", () => {
      expect(flat(where("c>r"))).toBe(
        `${ENGLISH} AND (${CARD_COLORS} @> $1::jsonb AND NOT (${CARD_COLORS} <@ $2::jsonb))`,
      );
      expect(flat(where("c<wu"))).toBe(
        `${ENGLISH} AND (${CARD_COLORS} <@ $1::jsonb AND NOT (${CARD_COLORS} @> $2::jsonb))`,
      );
    });

    test("c:c is exactly colorless", () => {
      const sql = where("c:c");
      expect(flat(sql)).toBe(
        `${ENGLISH} AND (${CARD_COLORS} @> $1::jsonb AND ${CARD_COLORS} <@ $2::jsonb)`,
      );
      expect(sql.values).toStrictEqual(["[]", "[]"]);
    });

    test("c:m is two or more colors", () => {
      const sql = where("c:m");
      expect(flat(sql)).toBe(
        `${ENGLISH} AND (` +
          [1, 2, 3, 4, 5].map((n) => `NOT (${CARD_COLORS} <@ $${n}::jsonb)`).join(" AND ") +
          ")",
      );
      expect(sql.values).toStrictEqual(['["W"]', '["U"]', '["B"]', '["R"]', '["G"]']);
    });

    test("id: means within this color identity", () => {
      const sql = where("id:wu");
      expect(flat(sql)).toBe(`${ENGLISH} AND "color_identity" <@ $1::jsonb`);
      expect(sql.values).toStrictEqual(['["W","U"]']);
    });

    test("id>= means at least this color identity", () => {
      expect(flat(where("id>=b"))).toBe(`${ENGLISH} AND "color_identity" @> $1::jsonb`);
    });

    test("negated colors", () => {
      expect(flat(where("-c:r"))).toBe(
        `${ENGLISH} AND NOT COALESCE(${CARD_COLORS} @> $1::jsonb, FALSE)`,
      );
    });
  });

  test.each([
    ["mv:3", "=", 3],
    ["mv>=2", ">=", 2],
    ["cmc<1.5", "<", 1.5],
    ["mv>4", ">", 4],
    ["mv<=0", "<=", 0],
  ])("mana value %s", (query, operator, value) => {
    const sql = where(query);
    expect(flat(sql)).toBe(`${ENGLISH} AND "cmc" ${operator} $1`);
    expect(sql.values).toStrictEqual([value]);
  });

  describe("rarity", () => {
    const RANK =
      `(CASE "rarity" WHEN 'common' THEN 0 WHEN 'uncommon' THEN 1 WHEN 'rare' THEN 2 ` +
      `WHEN 'special' THEN 3 WHEN 'mythic' THEN 4 WHEN 'bonus' THEN 5 END)`;

    test("r: matches the rarity", () => {
      const sql = where("r:mythic");
      expect(flat(sql)).toBe(`${ENGLISH} AND "rarity" = $1`);
      expect(sql.values).toStrictEqual(["mythic"]);
    });

    test("comparisons use the rarity's rank", () => {
      const sql = where("r>=rare");
      expect(flat(sql)).toBe(`${ENGLISH} AND ${RANK} >= $1`);
      expect(sql.values).toStrictEqual([2]);
    });

    test("rarity sort puts the rarest first", () => {
      expect(flat(buildCardSearch([], { sort: "rarity" }))).toContain(
        `ORDER BY ${RANK} DESC NULLS LAST, "name" ASC, "id" ASC LIMIT`,
      );
    });
  });

  test("set codes are lowercased", () => {
    const sql = where("s:LEA");
    expect(flat(sql)).toBe(`${ENGLISH} AND "set" = $1`);
    expect(sql.values).toStrictEqual(["lea"]);
  });

  describe("legality", () => {
    test("f: counts legal and restricted", () => {
      const sql = where("f:vintage");
      expect(flat(sql)).toBe(
        `${ENGLISH} AND "legalities"->>($1::text) IN ('legal', 'restricted')`,
      );
      expect(sql.values).toStrictEqual(["vintage"]);
    });

    test("banned:", () => {
      const sql = where("banned:modern");
      expect(flat(sql)).toBe(`${ENGLISH} AND "legalities"->>($1::text) = $2`);
      expect(sql.values).toStrictEqual(["modern", "banned"]);
    });

    test("restricted:", () => {
      expect(where("restricted:vintage").values).toStrictEqual(["vintage", "restricted"]);
    });
  });

  test("several terms are ANDed with parameters in order", () => {
    const sql = where("goblin c:r mv<=2 -t:token");
    expect(flat(sql)).toBe(
      `${ENGLISH} AND "name" ILIKE $1 AND ${CARD_COLORS} @> $2::jsonb AND "cmc" <= $3 ` +
        `AND NOT COALESCE("type_line" ILIKE $4, FALSE)`,
    );
    expect(sql.values).toStrictEqual(["%goblin%", '["R"]', 2, "%token%"]);
  });
});

describe("buildCardSearch", () => {
  test("groups printings, picks the newest and pages by 60", () => {
    const sql = buildCardSearch(parseQuery("bolt").terms);
    expect(flat(sql)).toBe(
      `SELECT "id", "name", "scryfall_uri", "mana_cost", "type_line", "set", "set_name", "rarity", "image_uris", "card_faces" ` +
        `FROM ( SELECT DISTINCT ON (COALESCE("oracle_id", "id")) ` +
        `"id", "name", "scryfall_uri", "mana_cost", "type_line", "set", "set_name", "rarity", "image_uris", "card_faces", "cmc", "released_at" ` +
        `FROM "Card" WHERE ${ENGLISH} AND "name" ILIKE $1 ` +
        `ORDER BY COALESCE("oracle_id", "id"), "released_at" DESC NULLS LAST, "id" ASC ) AS "printing" ` +
        `ORDER BY "name" ASC, "id" ASC LIMIT $2 OFFSET $3`,
    );
    expect(sql.values).toStrictEqual(["%bolt%", 61, 0]);
  });

  test.each([
    ["mv", `"cmc" ASC NULLS LAST, "name" ASC, "id" ASC`],
    ["released", `"released_at" DESC NULLS LAST, "name" ASC, "id" ASC`],
    ["name", `"name" ASC, "id" ASC`],
  ] as const)("sort by %s", (sort, orderBy) => {
    expect(flat(buildCardSearch([], { sort }))).toContain(`ORDER BY ${orderBy} LIMIT`);
  });

  test("later pages skip the earlier ones", () => {
    expect(buildCardSearch([], { page: 3 }).values).toStrictEqual([61, 120]);
  });

  test("page size can be changed", () => {
    expect(buildCardSearch([], { page: 2, pageSize: 10 }).values).toStrictEqual([11, 10]);
  });

  test("bad page numbers fall back to the first page", () => {
    expect(buildCardSearch([], { page: 0 }).values).toStrictEqual([61, 0]);
    expect(buildCardSearch([], { page: -4 }).values).toStrictEqual([61, 0]);
  });
});
