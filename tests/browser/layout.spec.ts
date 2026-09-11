import { test, expect } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import type { Reply, Snapshot } from "../../shared/types";

test("eight-player tables and selected cards stay inside a single responsive screen", async ({
  page,
}) => {
  const sockets: Socket[] = [];
  const connect = async () => {
    const socket = io("http://127.0.0.1:3000", { autoConnect: false });
    sockets.push(socket);
    const identity = new Promise<{ token: string }>((resolve) =>
      socket.once("session", resolve),
    );
    let state: Snapshot;
    socket.on("state", (s) => (state = s));
    socket.connect();
    return {
      socket,
      token: (await identity).token,
      state: () => state!,
      act: (type: string, payload = {}) =>
        socket.timeout(3000).emitWithAck("command", {
          id: randomUUID(),
          type,
          payload,
        }) as Promise<Reply>,
    };
  };
  try {
    const host = await connect();
    await host.act("create", { name: "Host" });
    const code = host.state().code;
    for (let i = 1; i < 8; i++) {
      const guest = await connect();
      await guest.act("join", { code, name: `Player ${i}`, avatar: i });
      await guest.act("ready");
    }
    await host.act("settings", { turnSeconds: 60 });
    await host.act("start");
    await page.addInitScript(
      (token) => sessionStorage.setItem("bluff-session", token),
      host.token,
    );
    await page.goto("/");
    await expect(page.locator(".turn-tag")).toHaveText("Your move");
    await expect(page.locator(".player-seat")).toHaveCount(8);
    for (const [width, height] of [
      [1440, 900],
      [1366, 768],
      [1024, 768],
      [768, 1024],
      [390, 844],
      [375, 667],
      [360, 640],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(350);
      expect(
        await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        })),
      ).toEqual({ width, height });
      for (const selector of [
        ".table-stage",
        ".hand-section",
        ".action-zone",
      ]) {
        const box = (await page.locator(selector).boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
      }
      const stage = (await page.locator(".table-stage").boundingBox())!;
      const seats = await page.locator(".player-seat").evaluateAll((es) =>
        es.map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
        }),
      );
      await page.screenshot({ path: `test-results/table-${width}.png` });
      for (const seat of seats) {
        expect(seat.y, `${width}: seat top`).toBeGreaterThanOrEqual(
          stage.y - 1,
        );
        expect(seat.bottom, `${width}: seat bottom`).toBeLessThanOrEqual(
          stage.y + stage.height + 2,
        );
      }
      for (let i = 0; i < seats.length; i++)
        for (let j = i + 1; j < seats.length; j++) {
          const a = seats[i],
            b = seats[j];
          const overlapX = Math.min(a.right, b.right) - Math.max(a.x, b.x);
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
          expect(
            overlapX <= 0 || overlapY <= 0,
            `${width}: seats ${i} and ${j} overlap: ${JSON.stringify({ a, b, stage })}`,
          ).toBe(true);
        }
      const card = page.locator(".hand-card").nth(2);
      await card.focus();
      await card.press("Enter");
      await page.waitForTimeout(350);
      const selected = (await card.boundingBox())!;
      const before = (await page.locator(".hand-card").nth(1).boundingBox())!;
      const after = (await page.locator(".hand-card").nth(3).boundingBox())!;
      expect(
        before.x + before.width,
        `${width}: selected left gap`,
      ).toBeLessThanOrEqual(selected.x + 1);
      expect(
        selected.x + selected.width,
        `${width}: selected right gap`,
      ).toBeLessThanOrEqual(after.x + 1);
      await page.screenshot({ path: `test-results/table-${width}.png` });
      await card.press("Enter");
    }
    await page.getByRole("button", { name: "Players and vote kick" }).click();
    await page
      .getByRole("button", { name: "Vote to kick Player 7", exact: true })
      .click();
    await expect(page.locator(".vote-banner")).toContainText("1/5 votes");
    await expect(
      page.getByRole("button", { name: "Vote to kick Player 7", exact: true }),
    ).toBeDisabled();
    await page.getByRole("dialog").press("Escape");
    for (const [width, height] of [
      [360, 640],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(350);
      const controls = (await page.locator(".action-zone").boundingBox())!;
      expect(controls.y + controls.height).toBeLessThanOrEqual(height);
      const banner = (await page.locator(".vote-banner").boundingBox())!;
      const stage = (await page.locator(".table-stage").boundingBox())!;
      expect(banner.y + banner.height).toBeLessThanOrEqual(stage.y + 1);
    }
  } finally {
    sockets.forEach((s) => s.disconnect());
  }
});
