import { test, expect, type Page } from "@playwright/test";

async function readyPractice(page: Page) {
  await page.goto("/");
  await expect(page.locator(".turn-tag")).toHaveText("Your move", {
    timeout: 12000,
  });
}
async function chooseCard(page: Page, index: number) {
  const card = page.locator(".hand-card").nth(index);
  for (let i = 0; i < 9 && !(await card.isVisible()); i++) {
    const firstVisible = await page
      .locator(".hand-card")
      .evaluateAll((cards) =>
        cards.findIndex((c) => !(c as HTMLElement).hidden),
      );
    await page
      .getByRole("button", {
        name: index < firstVisible ? "Previous cards" : "Next cards",
        exact: true,
      })
      .click();
  }
  await card.focus();
  await card.press("Enter");
}

test("practice has a playable hand, multi-selection, clear, claim and server feedback", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await readyPractice(page);
  await expect(page.locator(".hand-card")).toHaveCount(13);
  await chooseCard(page, 0);
  await chooseCard(page, 1);
  await expect(page.locator(".selected-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".selected-card")).toHaveCount(0);
  await chooseCard(page, 12);
  await page.getByLabel("I’M CLAIMING").selectOption("K");
  await page.getByRole("button", { name: "Play cards", exact: true }).click();
  await expect(page.locator(".hand-card")).toHaveCount(12);
  await expect(page.locator(".center-claim")).toContainText("1 King");
  await expect(page.locator(".activity-list")).toContainText("played 1 King");
  expect(errors).toEqual([]);
});

test("private room UI supports invites, ready, start, challenge and page reload", async ({
  browser,
}) => {
  const c1 = await browser.newContext();
  const c2 = await browser.newContext();
  const host = await c1.newPage();
  const guest = await c2.newPage();
  await readyPractice(host);
  await host
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await host.getByLabel("WHAT SHOULD WE CALL YOU?").fill("Harper");
  await host.getByRole("button", { name: "Create my table" }).click();
  await expect(host.locator(".lobby-code")).toBeVisible();
  const code = (await host.locator(".lobby-code").innerText()).trim();
  await guest.goto(`/?room=${code}`);
  await guest.getByLabel("WHAT SHOULD WE CALL YOU?").fill("Riley");
  await guest.getByRole("button", { name: "Pull up a chair" }).click();
  await expect(host.locator(".lobby-avatars")).toContainText("Riley");
  await guest.getByRole("button", { name: "I’m ready", exact: true }).click();
  await host.getByRole("button", { name: "Start the game" }).click();
  await expect(host.locator(".turn-tag")).toHaveText("Your move");
  await expect(host.locator(".hand-card")).toHaveCount(26);
  const first = await host
    .locator(".hand-card")
    .first()
    .getAttribute("aria-label");
  const lie = first?.startsWith("K ") ? "A" : "K";
  await chooseCard(host, 0);
  await host.getByLabel("I’M CLAIMING").selectOption(lie);
  await host.getByRole("button", { name: "Play cards", exact: true }).click();
  await guest.getByRole("button", { name: /CALL BLUFF/ }).click();
  await expect(host.locator(".center-status")).toHaveText("CAUGHT BLUFFING!");
  await expect(guest.locator(".reveal-card")).toHaveCount(1);
  await expect(host.locator(".hand-card")).toHaveCount(26, { timeout: 7000 });
  const hand = await host
    .locator(".hand-card")
    .evaluateAll((cards) => cards.map((c) => c.getAttribute("aria-label")));
  await host.reload();
  await expect(host.locator(".hand-card")).toHaveCount(26);
  expect(
    await host
      .locator(".hand-card")
      .evaluateAll((cards) => cards.map((c) => c.getAttribute("aria-label"))),
  ).toEqual(hand);
  await c1.close();
  await c2.close();
});

test("mobile table, navigation and modal controls have no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await readyPractice(page);
  expect(await page.evaluate(() => document.body.scrollWidth)).toBe(390);
  expect(
    await page
      .locator(".sidebar")
      .evaluate((el) => el.getBoundingClientRect().right),
  ).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "How to play", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "I’ve got my poker face on" }).click();
  await chooseCard(page, 12);
  await expect(page.locator(".selected-card")).toHaveCount(1);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await page.evaluate(() => document.body.scrollWidth)).toBe(768);
});

test("unsupported speech and denied microphone show useful fallback UI", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: undefined,
    });
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await readyPractice(page);
  await page.getByRole("button", { name: "Try voice commands" }).click();
  await expect(page.getByRole("status")).toContainText(
    "unavailable in this browser",
  );
  await page.getByRole("button", { name: "Join voice chat" }).click();
  await expect(page.getByRole("status")).toContainText("permission was denied");
  await expect(
    page.getByRole("button", { name: "Join voice chat" }),
  ).toBeEnabled();
  await chooseCard(page, 12);
  await expect(
    page.getByRole("button", { name: "Play cards", exact: true }),
  ).toBeEnabled();
});

test("recognized voice command changes rank and plays selected cards", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class MockSpeech {
      onresult?: (event: unknown) => void;
      onend?: () => void;
      lang = "";
      continuous = false;
      interimResults = false;
      start() {
        const text = sessionStorage.getItem("test-command") || "I claim Kings";
        setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [[{ transcript: text }]],
          });
          this.onend?.();
        }, 50);
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    Object.defineProperty(window, "SpeechRecognition", { value: MockSpeech });
  });
  await readyPractice(page);
  await page.getByRole("button", { name: "Try voice commands" }).click();
  await expect(page.getByLabel("I’M CLAIMING")).toHaveValue("K");
  await chooseCard(page, 12);
  await chooseCard(page, 11);
  await page.evaluate(() =>
    sessionStorage.setItem("test-command", "Play two cards"),
  );
  await page.getByRole("button", { name: "Try voice commands" }).click();
  await expect(page.locator(".hand-card")).toHaveCount(11);
  await expect(page.locator(".center-claim")).toContainText("2 Kings");
});

test("network interruption preserves hand and reconnects without duplicate players", async ({
  page,
  context,
}) => {
  await readyPractice(page);
  const hand = await page
    .locator(".hand-card")
    .evaluateAll((cards) => cards.map((c) => c.getAttribute("aria-label")));
  await context.setOffline(true);
  await expect(page.locator(".connection-banner")).toBeVisible({
    timeout: 15000,
  });
  await expect(
    page.getByRole("button", { name: "Play cards", exact: true }),
  ).toBeDisabled();
  await context.setOffline(false);
  await expect(page.locator(".connection-banner")).toBeHidden({
    timeout: 15000,
  });
  expect(
    await page
      .locator(".hand-card")
      .evaluateAll((cards) => cards.map((c) => c.getAttribute("aria-label"))),
  ).toEqual(hand);
  await expect(page.locator(".player-seat")).toHaveCount(4);
});

test("two browsers establish actual WebRTC audio and release the microphone on leave", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext({ permissions: ["microphone"] }),
    browser.newContext({ permissions: ["microphone"] }),
  ]);
  for (const context of contexts)
    await context.addInitScript(() => {
      const testWindow = window as unknown as {
        peers: RTCPeerConnection[];
        streams: MediaStream[];
      };
      testWindow.peers = [];
      testWindow.streams = [];
      const Original = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Original {
        constructor(configuration?: RTCConfiguration) {
          super(configuration);
          testWindow.peers.push(this);
        }
      };
      const capture = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await capture(constraints);
        testWindow.streams.push(stream);
        return stream;
      };
    });
  const host = await contexts[0].newPage();
  const guest = await contexts[1].newPage();
  await readyPractice(host);
  await host
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await host.getByLabel("WHAT SHOULD WE CALL YOU?").fill("Voice host");
  await host.getByRole("button", { name: "Create my table" }).click();
  await expect(host.locator(".lobby-code")).toBeVisible();
  const code = (await host.locator(".lobby-code").innerText()).trim();
  await guest.goto(`/?room=${code}`);
  await guest.getByLabel("WHAT SHOULD WE CALL YOU?").fill("Voice guest");
  await guest.getByRole("button", { name: "Pull up a chair" }).click();
  await host.getByRole("button", { name: "Join voice chat" }).click();
  await expect(
    host.getByRole("button", { name: "Leave voice chat" }),
  ).toBeVisible();
  await guest.getByRole("button", { name: "Join voice chat" }).click();
  await expect(
    guest.getByRole("button", { name: "Leave voice chat" }),
  ).toBeVisible();
  for (const page of [host, guest]) {
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            (window as unknown as { peers: RTCPeerConnection[] }).peers.some(
              (pc) => pc.connectionState === "connected",
            ),
          ),
        { timeout: 15000 },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const pc = (
              window as unknown as { peers: RTCPeerConnection[] }
            ).peers.at(-1)!;
            const stats = await pc.getStats();
            let received = 0;
            stats.forEach((stat) => {
              if (stat.type === "inbound-rtp" && stat.kind === "audio")
                received += stat.bytesReceived ?? 0;
            });
            return received;
          }),
        { timeout: 10000 },
      )
      .toBeGreaterThan(0);
  }
  await host.getByRole("button", { name: "Leave voice chat" }).click();
  expect(
    await host.evaluate(() =>
      (window as unknown as { streams: MediaStream[] }).streams.every((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ),
  ).toBe(true);
  await contexts[0].close();
  await contexts[1].close();
});

test("leaving a room while microphone permission is pending releases the late stream", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      const fixture = window as unknown as {
        lateStream: MediaStream;
        releaseMic: () => void;
      };
      fixture.lateStream = stream;
      await new Promise<void>((resolve) => {
        fixture.releaseMic = resolve;
      });
      return stream;
    };
  });
  await readyPractice(page);
  await page
    .getByRole("button", { name: "Join voice chat", exact: true })
    .click();
  await page.waitForFunction(
    () => !!(window as unknown as { releaseMic?: unknown }).releaseMic,
  );
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await page.getByLabel("WHAT SHOULD WE CALL YOU?").fill("New table");
  await page.getByRole("button", { name: "Create my table" }).click();
  await expect(page.locator(".lobby-code")).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { releaseMic: () => void }).releaseMic(),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { lateStream: MediaStream }).lateStream
          .getTracks()
          .every((t) => t.readyState === "ended"),
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Join voice chat", exact: true }),
  ).toBeEnabled();
});

test("slow network still commits a play exactly once", async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 350,
    downloadThroughput: 500000,
    uploadThroughput: 250000,
  });
  await readyPractice(page);
  await chooseCard(page, 12);
  await page.getByRole("button", { name: "Play cards", exact: true }).click();
  await expect(page.locator(".hand-card")).toHaveCount(12);
  await expect(page.locator(".pile-counter")).toContainText("1 in the pile");
  await cdp.detach();
});
