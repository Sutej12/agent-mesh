import { expect, test } from "@playwright/test";
import { grantWorkspaceAccess } from "./auth";

test.beforeEach(async ({ page }) => {
  await grantWorkspaceAccess(page);
});

test.describe("Agent Mesh smoke (J-2)", () => {
  test("office loads with brand and API badge", async ({ page }) => {
    await page.goto("/office");
    await expect(page.getByLabel("Agent Mesh marketing site")).toBeVisible();
    await expect(page.getByTestId("brand")).toHaveText("Command");
    await expect(page.getByTestId("office-tabs")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await expect(page.getByTestId("command-form")).toBeVisible({ timeout: 30_000 });
  });

  test("persistent logout returns to sign in", async ({ page }) => {
    await page.goto("/office");
    const logout = page.getByRole("button", { name: "Log out" });
    await expect(logout).toBeVisible();

    await logout.click();
    await expect(page).toHaveURL(/\/login$/);
    expect(
      await page.evaluate(() => window.localStorage.getItem("agent-mesh-workspace-auth")),
    ).toBeNull();
  });

  test("submit brief reaches a terminal workflow status via Demo Mode", async ({ page }) => {
    await page.goto("/office");
    await expect(page.getByTestId("command-form")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("tab-command").click();
    await expect(page.getByTestId("command-form")).toBeVisible();

    await page.getByRole("button", { name: "Advanced" }).click();
    await page.getByTestId("pick-agents").check();
    await page.getByTestId("agent-general-agent").check();

    await page.getByTestId("request-input").fill("Say hello from the office smoke test.");
    // Submitting returns the office to Home, so open Work only after the response lands.
    const submitted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && /\/api\/v1\/tasks(\?|$)/.test(response.url()),
    );
    await page.getByTestId("assign-work").click();
    expect((await submitted).ok()).toBe(true);
    await page.getByTestId("tab-work").click();

    const status = page.getByTestId("workflow-status");
    await expect(status).toBeVisible({ timeout: 30_000 });
    await expect(status).toHaveAttribute("data-status", /completed|failed|cancelled/, {
      timeout: 90_000,
    });
    await expect(status).toHaveAttribute("data-status", "completed");
  });
});
