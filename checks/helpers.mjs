import { expect } from "/home/user/oss-new/control/runtime/index.mjs";

/** Waits until the app has hydrated, so clicks and typing reach React. */
export async function ready(page) {
  await expect(page.locator("html[data-hydrated]")).toBeAttached({ timeout: 15000 });
}

export async function waitSaved(page) {
  await expect(page.getByTestId("save-status")).toHaveText("Saved", { timeout: 15000 });
}

/** Creates a page from the sidebar and gives it a title. Returns its id. */
export async function createPage(page, title) {
  await page.goto("/");
  await ready(page);
  await Promise.all([
    page.waitForURL(/\/p\/[0-9a-f-]+$/),
    page.getByTestId("new-page").click(),
  ]);
  await page.getByTestId("page-title").fill(title);
  await waitSaved(page);
  return page.url().split("/p/")[1];
}

/** Adds a block of the given type at the end and types its text. */
export async function addBlock(page, typeLabel, text) {
  const count = await page.getByTestId("block").count();
  await page.getByTestId("add-block").click();
  await page.getByRole("menuitem", { name: typeLabel, exact: true }).click();
  await expect(page.getByTestId("block")).toHaveCount(count + 1);
  if (text !== undefined) {
    await page.getByTestId("block").nth(count).getByTestId("block-text").fill(text);
  }
  await waitSaved(page);
  return page.getByTestId("block").nth(count);
}

export async function blockMenu(page, block, item) {
  await block.getByTestId("block-menu").click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

export async function memberEmail(runtime, role) {
  const res = await runtime.fetch("/health", { role });
  return (await res.json()).user;
}

/** Shares the open page with a person (by email) or "Everyone" at a level. */
export async function share(page, who, level) {
  await page.getByTestId("share-button").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("share-who").click();
  await page.getByRole("option", { name: who }).click();
  await dialog.getByTestId("share-level").click();
  await page.getByRole("option", { name: level, exact: true }).click();
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog.getByTestId("grant").filter({ hasText: who })).toContainText(level);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}
