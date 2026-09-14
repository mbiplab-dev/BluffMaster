import { test, expect } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import type { Snapshot } from "../../shared/types";

for (let count = 2; count <= 8; count++)
  test(`${count} players: claim and pile stay clear of every player deck`, async ({
    page,
  }) => {
    const sockets: Socket[] = [];
    async function connect() {
      const socket = io("http://127.0.0.1:3000", { autoConnect: false });
      sockets.push(socket);
      let state: Snapshot;
      socket.on("state", (next) => (state = next));
      const session = new Promise<{ token: string }>((resolve) =>
        socket.once("session", resolve),
      );
      socket.connect();
      return {
        token: (await session).token,
        state: () => state!,
        act: (type: string, payload = {}) =>
          socket
            .timeout(3000)
            .emitWithAck("command", { id: randomUUID(), type, payload }),
      };
    }
    try {
      const host = await connect();
      await host.act("create", { name: "Host" });
      for (let i = 1; i < count; i++) {
        const guest = await connect();
        await guest.act("join", {
          code: host.state().code,
          name: `Player ${i}`,
        });
        await guest.act("ready");
      }
      await host.act("settings", { challengeSeconds: 12 });
      await host.act("start");
      await page.addInitScript(
        (token) => sessionStorage.setItem("bluff-session", token),
        host.token,
      );
      await page.goto("/");
      await expect(page.locator(".turn-tag")).toHaveText("Your move");
      const expectedShape =
        count === 2
          ? "duel"
          : count === 3
            ? "triangle"
            : count === 4
              ? "square"
              : count <= 6
                ? "hex"
                : "oval";
      const expectedMobileRatio =
        count === 2
          ? 1.2
          : count === 3
            ? 1.22
            : count === 4
              ? 1.18
              : count === 5
                ? 1.34
                : count === 6
                  ? 1.46
                  : 1.62;
      await expect(page.locator(".table-stage")).toHaveAttribute(
        "data-table-shape",
        expectedShape,
      );
      for (let i = 0; i < 2; i++) {
        const card = page.locator(".hand-card").nth(i);
        await card.focus();
        await card.press("Enter");
      }
      await page.getByLabel("I’M CLAIMING").selectOption("10");
      await page
        .getByRole("button", { name: "Play cards", exact: true })
        .click();
      await expect(page.locator(".claim-description")).toHaveText(
        "2 cards of 10",
      );
      for (const [width, height] of [
        [1366, 768],
        [768, 1024],
        [390, 844],
        [360, 640],
        [844, 390],
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(250);
        if (width === 390) {
          const mobileRatio = await page
            .locator(".table-physical")
            .evaluate((table) => {
              const [inline, block = "1"] =
                getComputedStyle(table).aspectRatio.split("/");
              return Number.parseFloat(inline) / Number.parseFloat(block);
            });
          expect(mobileRatio).toBeCloseTo(expectedMobileRatio, 2);
        }
        const overlaps = await page
          .locator(".table-stage")
          .evaluate((table) => {
            const seats = [...table.querySelectorAll(".player-seat")].map((e) =>
              e.getBoundingClientRect(),
            );
            const content = [
              ...table.querySelectorAll(".pile-card,.center-claim"),
            ].map((e) => e.getBoundingClientRect());
            return content.flatMap((a, i) =>
              seats.flatMap((b, j) =>
                Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 &&
                Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1
                  ? [
                      {
                        content: i,
                        seat: j,
                        a: { x: a.x, y: a.y, w: a.width, h: a.height },
                        b: { x: b.x, y: b.y, w: b.width, h: b.height },
                      },
                    ]
                  : [],
              ),
            );
          });
        await page.screenshot({
          path: `test-results/claim-${count}-${width}.png`,
        });
        expect(overlaps, `${count} players at ${width}×${height}`).toEqual([]);
        expect(
          await page
            .locator(".claim-description")
            .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
        ).toBeGreaterThanOrEqual(14);
        const box = (await page.locator(".center-claim").boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThan(height);
      }
    } finally {
      sockets.forEach((s) => s.disconnect());
    }
  });
