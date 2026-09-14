import { test, expect } from "@playwright/test";

test("round rank locks, starter rotates, and a five-card challenge hands control to its winner", async ({
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
    await a.getByLabel("WHAT SHOULD WE CALL YOU?").fill("Round A");
    await a.getByRole("button", { name: "Create my table" }).click();
    const code = await a.locator(".lobby-code").innerText();
    await b.goto(`/?room=${code}`);
    await b.getByLabel("WHAT SHOULD WE CALL YOU?").fill("Round B");
    await b.getByRole("button", { name: "Pull up a chair" }).click();
    await b.getByRole("button", { name: "I’m ready", exact: true }).click();
    await a.getByRole("button", { name: "Start the game" }).click();
    await expect(a.locator(".turn-tag")).toHaveText("Your move");
    await a.locator(".hand-card").first().focus();
    await a.locator(".hand-card").first().press("Enter");
    await a.getByLabel("I’M CLAIMING").selectOption("5");
    await a.getByRole("button", { name: "Play cards", exact: true }).click();
    await b.getByRole("button", { name: /Believe it/ }).click();
    await expect(b.locator(".turn-tag")).toHaveText("Your move");
    await expect(b.getByLabel("I’M CLAIMING")).toHaveValue("5");
    await expect(b.getByLabel("I’M CLAIMING")).toBeDisabled();
    await b.getByRole("button", { name: "Pass", exact: true }).click();
    await expect(b.locator(".turn-tag")).toHaveText("Your move");
    await expect(b.getByLabel("I’M CLAIMING")).toBeEnabled();
    const label = await b
      .locator(".hand-card")
      .first()
      .getAttribute("aria-label");
    for (let i = 0; i < 5; i++) {
      const card = b.locator(".hand-card").nth(i);
      await card.focus();
      await card.press("Enter");
    }
    await b
      .getByLabel("I’M CLAIMING")
      .selectOption(label?.startsWith("Q ") ? "K" : "Q");
    await b.getByRole("button", { name: "Play cards", exact: true }).click();
    await a.getByRole("button", { name: /CALL BLUFF/ }).click();
    await expect(a.locator(".center-status")).toHaveText("CAUGHT BLUFFING!");
    await a.getByRole("button", { name: "View all 5 revealed cards" }).click();
    await expect(a.locator(".revealed-card-grid > div")).toHaveCount(5);
    await a.getByRole("dialog").press("Escape");
    await expect(a.locator(".turn-tag")).toHaveText("Your move");
    await expect(a.getByLabel("I’M CLAIMING")).toBeEnabled();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
