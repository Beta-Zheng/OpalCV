import { describe, expect, it } from "vitest";
import { paginateResume } from "../pagination";
import { testBlock, testResume } from "./fixtures";

describe("paginateResume cross-page bullet splitting", () => {
  it("splits a block exceeding page capacity across pages without marking oversized", () => {
    const r = testResume();
    r.data.sections[0].blocks[0] = {
      ...testBlock(),
      block_id: "long_exp",
      title: "Acme Corp",
      subtitle: "Staff Engineer",
      bullets: ["Bullet 1", "Bullet 2", "Bullet 3", "Bullet 4", "Bullet 5"],
      bullet_marks: [true, false, true, true, true],
      skills: ["TypeScript", "React"],
    };

    const pages = paginateResume(
      r,
      { long_exp: 1300 },
      100,
      { section_test: 50 },
      1000,
      { long_exp: [240, 240, 240, 240, 240] } // headerChrome = 100
    );

    expect(pages.length).toBe(2);
    expect(pages.every((p) => !p.oversized)).toBe(true);

    const p1Block = pages[0].resume.data.sections[1].blocks[0];
    const p2Block = pages[1].resume.data.sections[1].blocks[0];

    // Page 1: header(100) + section(50) + headerChrome(100) + 3 bullets(720) = 970 <= 1000
    expect(p1Block.title).toBe("Acme Corp");
    expect(p1Block.subtitle).toBe("Staff Engineer");
    expect(p1Block.bullets).toEqual(["Bullet 1", "Bullet 2", "Bullet 3"]);
    expect(p1Block.bullet_marks).toEqual([true, false, true]);
    expect(p1Block.skills).toEqual([]);

    // Page 2: continuation fragment with remaining bullets & skills, no duplicated header
    expect(p2Block.block_id).toBe("long_exp");
    expect(p2Block.title).toBe("");
    expect(p2Block.subtitle).toBe("");
    expect(p2Block.start_date).toBe("");
    expect(p2Block.end_date).toBe("");
    expect(p2Block.bullets).toEqual(["Bullet 4", "Bullet 5"]);
    expect(p2Block.bullet_marks).toEqual([true, true]);
    expect(p2Block.skills).toEqual(["TypeScript", "React"]);
  });

  it("splits a large (> half-page) block when it cannot fit in remaining space", () => {
    const r = testResume();
    r.data.sections[0].blocks = [
      {
        ...testBlock(),
        block_id: "first",
        order: 0,
        bullets: ["First bullet"],
      },
      {
        ...testBlock(),
        block_id: "large_second",
        order: 1,
        title: "Big Co",
        bullets: ["B1", "B2", "B3", "B4"],
      },
    ];

    // capacity = 1000; header(100) + section(50) + first(400) = 550 used, 450 remaining
    // large_second is 700 (> 500 half-page), headerChrome=100, bullets=[150,150,150,150]
    const pages = paginateResume(
      r,
      { first: 400, large_second: 700 },
      100,
      { section_test: 50 },
      1000,
      { large_second: [150, 150, 150, 150] }
    );

    expect(pages.length).toBe(2);
    expect(pages.every((p) => !p.oversized)).toBe(true);

    // Page 1 gets first + headerChrome(100) + B1(150) + B2(150) = 950 <= 1000
    expect(pages[0].resume.data.sections[1].blocks.map((b) => b.block_id)).toEqual([
      "first",
      "large_second",
    ]);
    expect(pages[0].resume.data.sections[1].blocks[1].title).toBe("Big Co");
    expect(pages[0].resume.data.sections[1].blocks[1].bullets).toEqual(["B1", "B2"]);

    // Page 2 gets B3, B4
    expect(pages[1].resume.data.sections[1].blocks[0].title).toBe("");
    expect(pages[1].resume.data.sections[1].blocks[0].bullets).toEqual(["B3", "B4"]);
  });

  it("avoids orphan headers by moving header + first bullet together to next page when remaining space is too small", () => {
    const r = testResume();
    r.data.sections[0].blocks = [
      { ...testBlock(), block_id: "first", order: 0 },
      {
        ...testBlock(),
        block_id: "large_second",
        order: 1,
        title: "Next Page Co",
        bullets: ["B1", "B2", "B3", "B4"],
      },
    ];

    // header(100) + section(50) + first(750) = 900 used, 100 remaining
    // large_second headerChrome=100 + B1=200 => 300 > 100 remaining, so it cannot fit header+B1 on page 1
    const pages = paginateResume(
      r,
      { first: 750, large_second: 900 },
      100,
      { section_test: 50 },
      1000,
      { large_second: [200, 200, 200, 200] }
    );

    expect(pages.length).toBe(2);
    expect(pages.every((p) => !p.oversized)).toBe(true);
    expect(pages[0].resume.data.sections[1].blocks.map((b) => b.block_id)).toEqual([
      "first",
    ]);
    expect(pages[1].resume.data.sections[1].blocks[0].title).toBe("Next Page Co");
    expect(pages[1].resume.data.sections[1].blocks[0].bullets).toEqual([
      "B1",
      "B2",
      "B3",
      "B4",
    ]);
  });

  it("does not split small (<= half-page) blocks unnecessarily", () => {
    const r = testResume();
    r.data.sections[0].blocks = [
      { ...testBlock(), block_id: "first", order: 0 },
      {
        ...testBlock(),
        block_id: "small_second",
        order: 1,
        bullets: ["B1", "B2"],
      },
    ];

    // 100 + 50 + 700 = 850 used, 150 remaining; small_second is 300 (<= 500 half-page)
    const pages = paginateResume(
      r,
      { first: 700, small_second: 300 },
      100,
      { section_test: 50 },
      1000,
      { small_second: [100, 100] }
    );

    expect(pages.length).toBe(2);
    expect(pages[0].resume.data.sections[1].blocks).toHaveLength(1);
    expect(pages[1].resume.data.sections[1].blocks).toHaveLength(1);
    expect(pages[1].resume.data.sections[1].blocks[0].bullets).toEqual(["B1", "B2"]);
  });

  it("marks oversized only when a single bullet or basic_info header exceeds page capacity", () => {
    const r = testResume();
    r.data.sections[0].blocks[0] = {
      ...testBlock(),
      block_id: "huge_bullet_block",
      bullets: ["Normal bullet", "Giant bullet exceeding page"],
    };

    const pagesBullet = paginateResume(
      r,
      { huge_bullet_block: 1400 },
      0,
      { section_test: 50 },
      1000,
      { huge_bullet_block: [200, 1100] }
    );
    expect(pagesBullet.length).toBe(2);
    expect(pagesBullet[0].oversized).toBe(false);
    expect(pagesBullet[1].oversized).toBe(true);

    const pagesHeader = paginateResume(
      testResume(),
      { block_test: 200 },
      1100,
      { section_test: 50 },
      1000
    );
    expect(pagesHeader[0].oversized).toBe(true);
  });

  it("estimates bullet heights when bulletHeights is omitted", () => {
    const r = testResume();
    r.data.sections[0].blocks[0] = {
      ...testBlock(),
      block_id: "est_block",
      bullets: ["B1", "B2", "B3", "B4"],
    };

    const pages = paginateResume(
      r,
      { est_block: 1400 },
      0,
      { section_test: 50 },
      1000
    );
    expect(pages.length).toBe(2);
    expect(pages.every((p) => !p.oversized)).toBe(true);
    expect(
      pages.flatMap((p) => p.resume.data.sections[1].blocks.flatMap((b) => b.bullets))
    ).toEqual(["B1", "B2", "B3", "B4"]);
  });
});
