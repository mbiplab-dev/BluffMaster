import { test, expect } from "@playwright/test";

test("public rooms can be discovered, joined before play, and watched after starting", async ({
  browser,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 3 }, () => browser.newContext()),
  );
  const [host, guest, watcher] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  try {
    await host.goto("/");
    await expect(host.locator(".turn-tag")).toHaveText("Your move");
    await host
      .getByRole("button", { name: "Create a room", exact: true })
      .click();
    await host.getByLabel("WHAT SHOULD WE CALL YOU?").fill("Public Host");
    await host.getByRole("radio", { name: /Public/ }).click();
    await host.getByRole("button", { name: "Create my table" }).click();
    await expect(host.locator(".lobby-code")).toBeVisible();
    await guest.goto("/");
    await expect(guest.locator(".turn-tag")).toHaveText("Your move");
    await guest.locator(".topbar-rooms").click();
    await guest
      .getByRole("button", { name: "Join Public Host’s room", exact: true })
      .click();
    await guest.getByLabel("WHAT SHOULD WE CALL YOU?").fill("Public Guest");
    await guest.getByRole("button", { name: "Pull up a chair" }).click();
    await guest.getByRole("button", { name: "I’m ready", exact: true }).click();
    await host.getByRole("button", { name: "Start the game" }).click();
    await expect(host.locator(".turn-tag")).toHaveText("Your move");
    await watcher.goto("/");
    await expect(watcher.locator(".turn-tag")).toHaveText("Your move");
    await watcher.locator(".topbar-rooms").click();
    await watcher
      .getByRole("button", { name: "Watch Public Host’s room", exact: true })
      .click();
    await expect(watcher.getByLabel(/spectator/i)).toBeChecked();
    await watcher.getByLabel("WHAT SHOULD WE CALL YOU?").fill("Spectator");
    await watcher.getByRole("button", { name: /Watch/ }).last().click();
    await expect(watcher.getByRole("dialog")).toBeHidden();
    await expect(watcher.locator(".hand-card")).toHaveCount(0);
    await expect(watcher.locator(".table-stage .player-seat")).toHaveCount(2);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
