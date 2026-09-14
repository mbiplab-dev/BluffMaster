import { test, expect } from "@playwright/test";
test("pickup returns to page one, prepends new cards and lands each card progressively right", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    await a.goto("/");
    await expect(a.locator(".turn-tag")).toHaveText("Your move");
    await a.getByRole("button", { name: "Create a room", exact: true }).click();
    await a.getByLabel("WHAT SHOULD WE CALL YOU?").fill("Collector");
    await a.getByRole("button", { name: "Create my table" }).click();
    const code = await a.locator(".lobby-code").innerText();
    await b.goto(`/?room=${code}`);
    await b.getByLabel("WHAT SHOULD WE CALL YOU?").fill("Caller");
    await b.getByRole("button", { name: "Pull up a chair" }).click();
    await b.getByRole("button", { name: "I’m ready", exact: true }).click();
    await a.getByRole("button", { name: "Start the game" }).click();
    await expect(a.locator(".turn-tag")).toHaveText("Your move");
    const labels: string[] = [];
    for (const i of [5, 6, 7]) {
      const card = a.locator(".hand-card").nth(i);
      labels.push((await card.getAttribute("aria-label"))!);
      await card.focus();
      await card.press("Enter");
    }
    await a
      .getByLabel("I’M CLAIMING")
      .selectOption(labels[0].startsWith("K ") ? "A" : "K");
    await a.getByRole("button", { name: "Play cards", exact: true }).click();
    await a.getByRole("button", { name: "Next cards", exact: true }).click();
    await expect(a.locator(".page-card-range")).toContainText(/^15–/);
    await b.getByRole("button", { name: /CALL BLUFF/ }).click();
    await expect(a.locator(".hand-card")).toHaveCount(26, { timeout: 7000 });
    await expect(a.locator(".page-card-range")).toContainText(/^1–/);
    const positions = await a
      .locator(".flight-target .flying-card")
      .evaluateAll((es) =>
        es.map((e) => ({
          x: parseFloat((e as HTMLElement).style.getPropertyValue("--to-x")),
          delay: parseFloat((e as HTMLElement).style.animationDelay),
        })),
      );
    expect(positions).toHaveLength(3);
    expect(positions[1].x).toBeGreaterThan(positions[0].x);
    expect(positions[2].x).toBeGreaterThan(positions[1].x);
    expect(positions[2].delay).toBeGreaterThan(positions[1].delay);
    for (let i = 0; i < 3; i++) {
      await expect(a.locator(".hand-card").nth(i)).toHaveAttribute(
        "aria-label",
        labels[i],
      );
      await expect(
        a.locator(".hand-card").nth(i).locator(".received-badge"),
      ).toHaveText("NEW");
    }
    await expect(a.locator(".hand-card").first()).toHaveCSS("opacity", "1");
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
