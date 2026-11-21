import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { ready, addBlock, blockMenu, createPage, waitSaved } from "./helpers.mjs";

const runtime = await startRuntime();
try {
  const owner = await runtime.context("owner");
  const page = await owner.newPage();
  await page.goto("/");
  await ready(page);
  await runtime.assertBackLink(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // F001: a page with an icon and blocks of every text type.
  const planId = await createPage(page, "Spring offsite plan");
  await page.getByTestId("icon-button").click();
  await page.getByTestId("icon-option").first().click();
  await waitSaved(page);
  await addBlock(page, "Heading 1", "Goals");
  await addBlock(page, "Text", "Two days in the mountains to plan the autumn roadmap.");
  await addBlock(page, "Bulleted list", "Agree on three priorities");
  await addBlock(page, "Numbered list", "Draft the agenda");
  const todo = await addBlock(page, "To-do", "Book the venue");
  await todo.getByTestId("block-check").click();
  await waitSaved(page);
  await addBlock(page, "Quote", "Plans are nothing; planning is everything.");
  await addBlock(page, "Code", "budget = 12000");
  await addBlock(page, "Divider");
  const stray = await addBlock(page, "Text", "Delete me");
  await blockMenu(page, stray, "Delete");
  await expect(page.getByText("Delete me")).toHaveCount(0);
  await waitSaved(page);

  // Retype and reorder.
  const bullets = page.getByTestId("block").nth(2);
  await blockMenu(page, bullets, "Heading 2");
  await expect(page.getByTestId("block").nth(2)).toHaveAttribute("data-type", "heading_2");
  await waitSaved(page);
  await blockMenu(page, page.getByTestId("block").nth(1), "Move up");
  await expect(page.getByTestId("block").nth(0).getByTestId("block-text")).toHaveValue(/Two days/);
  await waitSaved(page);
  await blockMenu(page, page.getByTestId("block").nth(0), "Move down");
  await waitSaved(page);

  await page.reload();

  await ready(page);
  await expect(page.getByTestId("page-title")).toHaveValue("Spring offsite plan");
  await expect(page.getByTestId("block")).toHaveCount(8);
  await expect(page.getByTestId("block").nth(0)).toHaveAttribute("data-type", "heading_1");
  await expect(page.getByTestId("block").nth(4).getByTestId("block-check")).toHaveAttribute("aria-checked", "true");

  // Attachment through the type menu, then through the upload route.
  await page.getByTestId("add-block").click();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("menuitem", { name: "Image or file", exact: true }).click(),
  ]);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  await chooser.setFiles({ name: "venue-map.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("block").last()).toHaveAttribute("data-type", "file");
  await expect(page.getByTestId("block").last().locator("img")).toBeVisible();
  await waitSaved(page);

  const form = new FormData();
  form.set("pageId", planId);
  form.set("file", new Blob([Buffer.from("seating chart")], { type: "text/plain" }), "seats.txt");
  const up = await runtime.fetch("/api/files", { role: "owner", method: "POST", body: form });
  expect(up.status).toBe(201);
  const uploaded = await up.json();
  const down = await runtime.fetch(`/api/files/${uploaded.id}`, { role: "owner" });
  expect(down.status).toBe(200);
  expect(await down.text()).toBe("seating chart");
  const big = new FormData();
  big.set("pageId", planId);
  big.set("file", new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)]), "big.bin");
  expect((await runtime.fetch("/api/files", { role: "owner", method: "POST", body: big })).status).toBe(413);

  // Sub-page, nested in the tree.
  await page.getByTestId("add-block").click();
  await page.getByRole("menuitem", { name: "Sub-page", exact: true }).click();
  const link = page.getByTestId("subpage-link").last();
  await expect(link).toBeVisible();
  await waitSaved(page);
  await Promise.all([page.waitForURL(/\/p\//), link.click()]);
  const venueId = page.url().split("/p/")[1];
  await expect(page.getByTestId("page-title")).toHaveValue("");
  await page.getByTestId("page-title").fill("Venue shortlist");
  await waitSaved(page);
  await addBlock(page, "Text", "Lakeside lodge with a meeting room for twenty.");
  await expect(page.getByTestId("sidebar").getByText("Venue shortlist")).toBeVisible();
  await expect(page.getByTestId("breadcrumb")).toContainText("Spring offsite plan");

  // Stale saves are refused.
  const second = await owner.newPage();
  await second.goto(`/p/${venueId}`);
  await ready(second);
  await second.getByTestId("block-text").first().fill("Lakeside lodge, booked for June.");
  await waitSaved(second);
  await page.getByTestId("block-text").first().fill("An older edit");
  await expect(page.getByTestId("conflict")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("conflict").getByRole("button", { name: "Reload" }).click();
  await expect(page.getByTestId("block-text").first()).toHaveValue("Lakeside lodge, booked for June.");
  await second.close();

  // Move a page to another parent, then back to the top level.
  const travelId = await createPage(page, "Travel notes");
  await page.getByTestId("page-menu").click();
  await page.getByRole("menuitem", { name: "Move to", exact: true }).click();
  await page.getByRole("dialog").getByTestId("move-target").click();
  await page.getByRole("option", { name: "Spring offsite plan" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move" }).click();
  await expect(page.getByTestId("breadcrumb")).toContainText("Spring offsite plan");

  // F007: search finds block text and shows where the page sits.
  await page.goto("/search?q=lakeside");
  await ready(page);
  const hit = page.getByTestId("search-result");
  await expect(hit).toHaveCount(1);
  await expect(hit).toContainText("Venue shortlist");
  await expect(hit).toContainText("Spring offsite plan");
  await page.goto("/search?q=zebra-crossing");
  await ready(page);
  await expect(page.getByTestId("search-empty")).toBeVisible();

  // Trash: archive, restore, archive again, delete for good.
  await page.goto(`/p/${travelId}`);
  await ready(page);
  await page.getByTestId("page-menu").click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await expect(page.getByTestId("archived-banner")).toBeVisible();
  await page.goto("/trash");
  await ready(page);
  await expect(page.getByTestId("trash-item").filter({ hasText: "Travel notes" })).toBeVisible();
  await page.getByTestId("trash-item").filter({ hasText: "Travel notes" }).getByRole("button", { name: "Restore" }).click();
  await expect(page.getByTestId("trash-item")).toHaveCount(0);
  await page.goto(`/p/${travelId}`);
  await ready(page);
  await page.getByTestId("page-menu").click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await page.goto("/trash");
  await ready(page);
  await page.getByTestId("trash-item").filter({ hasText: "Travel notes" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("trash-item")).toHaveCount(0);
  expect((await runtime.fetch(`/p/${travelId}`, { role: "owner" })).status).toBe(404);

  // F004: comments on the page and on a block; resolve hides them.
  await page.goto(`/p/${planId}`);
  await ready(page);
  await page.getByTestId("comments-button").click();
  const panel = page.getByTestId("comments-panel");
  await panel.getByTestId("comment-input").fill("Can we confirm the budget by Friday?");
  await panel.getByRole("button", { name: "Comment" }).click();
  const comment = panel.getByTestId("comment").filter({ hasText: "confirm the budget" });
  await expect(comment).toBeVisible();
  await expect(comment.getByTestId("comment-author")).not.toBeEmpty();
  await expect(comment.locator("time")).toBeVisible();
  await comment.getByRole("button", { name: "Resolve" }).click();
  await expect(panel.getByTestId("comment").filter({ hasText: "confirm the budget" })).toHaveCount(0);
  await panel.getByTestId("show-resolved").click();
  await expect(panel.getByTestId("comment").filter({ hasText: "confirm the budget" })).toBeVisible();
  await panel.getByTestId("comment").filter({ hasText: "confirm the budget" }).getByRole("button", { name: "Reopen" }).click();
  await page.keyboard.press("Escape");
  await blockMenu(page, page.getByTestId("block").nth(0), "Comment");
  await expect(panel.getByTestId("comment-target")).toContainText("Goals");
  await panel.getByTestId("comment-input").fill("Add a fourth goal about hiring.");
  await panel.getByRole("button", { name: "Comment" }).click();
  await expect(panel.getByTestId("comment").filter({ hasText: "fourth goal" })).toContainText("Goals");
  await page.keyboard.press("Escape");

  // F005: history lists versions, previews and restores one.
  await page.getByTestId("page-menu").click();
  await page.getByRole("menuitem", { name: "Version history" }).click();
  const history = page.getByTestId("history-panel");
  await expect(history.getByTestId("version").first()).toBeVisible();
  const versionsBefore = await history.getByTestId("version").count();
  await history.getByTestId("version").first().click();
  await expect(history.getByTestId("version-preview")).toContainText("Goals");
  await history.getByRole("button", { name: "Restore this version" }).click();
  await expect(history.getByTestId("version")).toHaveCount(versionsBefore + 1);
  await page.keyboard.press("Escape");

  // F006: publish, view anonymously, then unpublish.
  await page.getByTestId("publish-button").click();
  const publish = page.getByRole("dialog");
  await publish.getByRole("button", { name: "Publish" }).click();
  const publicUrl = await publish.getByTestId("publish-link").inputValue();
  expect(new URL(publicUrl).hostname).toBe(runtime.hostname);
  expect(new URL(publicUrl).pathname).toMatch(/^\/s\/[A-Za-z0-9_-]{20,}$/);
  await publish.getByTestId("publish-expiry").fill("2099-12-31T18:00");
  await publish.getByRole("button", { name: "Save expiry" }).click();
  await expect(publish.getByTestId("publish-expiry-current")).toContainText("2099");
  await page.keyboard.press("Escape");
  const visitor = await (await runtime.context(null)).newPage();
  await visitor.goto(new URL(publicUrl).pathname);
  await ready(visitor);
  await expect(visitor.getByRole("heading", { name: "Spring offsite plan" })).toBeVisible();
  await expect(visitor.getByText("Agree on three priorities")).toBeVisible();
  await expect(visitor.getByText("confirm the budget")).toHaveCount(0);
  await expect(visitor.locator("img")).toBeVisible();
  await Promise.all([visitor.waitForURL(/\?p=/), visitor.getByRole("link", { name: /Venue shortlist/ }).click()]);
  await expect(visitor.getByText("booked for June")).toBeVisible();
  const anon = await runtime.fetch(new URL(publicUrl).pathname);
  expect(anon.status).toBe(200);

  // F002: a database with properties, views, filters and sorts.
  await page.goto("/");
  await ready(page);
  await Promise.all([page.waitForURL(/\/p\//), page.getByTestId("new-database").click()]);
  const dbId = page.url().split("/p/")[1];
  await page.getByTestId("page-title").fill("Offsite tasks");
  await waitSaved(page);
  // Add a date and a person property.
  for (const [name, type] of [["Due", "Date"], ["Owner", "Person"], ["Estimate", "Number"]]) {
    await page.getByTestId("properties-button").click();
    const dlg = page.getByRole("dialog");
    await dlg.getByTestId("new-property-name").fill(name);
    await dlg.getByTestId("new-property-type").click();
    await page.getByRole("option", { name: type, exact: true }).click();
    await dlg.getByRole("button", { name: "Add property" }).click();
    await expect(dlg.getByTestId("property").filter({ has: page.locator(`input[value="${name}"]`) })).toBeVisible();
    await page.keyboard.press("Escape");
  }
  const rows = [["Book flights", "Done", "4"], ["Print name badges", "In progress", "1"], ["Plan team dinner", "Not started", "2"]];
  for (const [i, [title, status, estimate]] of rows.entries()) {
    await page.getByTestId("new-row").click();
    await expect(page.getByTestId("db-row")).toHaveCount(i + 1);
    const row = page.getByTestId("db-row").last();
    await row.getByTestId("cell-title").fill(title);
    await row.getByTestId("cell-title").press("Enter");
    await row.getByTestId("cell-Status").click();
    await page.getByRole("option", { name: status, exact: true }).click();
    await row.getByTestId("cell-Estimate").fill(estimate);
    await row.getByTestId("cell-Estimate").press("Enter");
    await expect(row.getByTestId("cell-Status")).toContainText(status);
  }
  await expect(page.getByTestId("db-row")).toHaveCount(3);

  // Filter and sort in the table view.
  await page.getByTestId("filter-button").click();
  await page.getByTestId("add-filter").click();
  await page.getByTestId("filter-property").last().click();
  await page.getByRole("option", { name: "Status", exact: true }).click();
  await page.getByTestId("filter-value").last().click();
  await page.getByRole("option", { name: "Done", exact: true }).click();
  await expect(page.getByTestId("db-row")).toHaveCount(1);
  await page.getByTestId("remove-filter").last().click();
  await expect(page.getByTestId("db-row")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await page.getByTestId("sort-button").click();
  await page.getByTestId("add-sort").click();
  await page.getByTestId("sort-property").last().click();
  await page.getByRole("option", { name: "Estimate", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("db-row").first().getByTestId("cell-title")).toHaveValue("Print name badges");
  await page.reload();
  await ready(page);
  await expect(page.getByTestId("db-row").first().getByTestId("cell-title")).toHaveValue("Print name badges");

  // Rename and retype a property: incompatible values are cleared.
  await page.getByTestId("properties-button").click();
  const props = page.getByRole("dialog");
  const est = props.getByTestId("property").nth(3);
  await est.getByTestId("property-name").fill("Effort");
  await est.getByTestId("property-name").press("Enter");
  await est.getByTestId("property-type").click();
  await page.getByRole("option", { name: "Checkbox", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: "Effort" })).toBeVisible();

  // Board: group by status and move a card.
  await page.getByTestId("add-view").click();
  const viewDlg = page.getByRole("dialog");
  await viewDlg.getByTestId("view-name").fill("By status");
  await viewDlg.getByTestId("view-layout").click();
  await page.getByRole("option", { name: "Board", exact: true }).click();
  await viewDlg.getByRole("button", { name: "Add view" }).click();
  const doneCol = page.getByTestId("board-column").filter({ has: page.getByRole("heading", { name: "Done" }) });
  await expect(doneCol.getByTestId("board-card")).toHaveCount(1);
  const badge = page.getByTestId("board-card").filter({ hasText: "Print name badges" });
  await badge.getByTestId("card-menu").click();
  await page.getByRole("menuitem", { name: "Done", exact: true }).click();
  await expect(doneCol.getByTestId("board-card")).toHaveCount(2);

  // Calendar: add a row on a day.
  await page.getByTestId("add-view").click();
  await viewDlg.getByTestId("view-name").fill("Schedule");
  await viewDlg.getByTestId("view-layout").click();
  await page.getByRole("option", { name: "Calendar", exact: true }).click();
  await viewDlg.getByRole("button", { name: "Add view" }).click();
  const day = page.getByTestId("calendar-day").nth(10);
  await day.hover();
  await day.getByTestId("calendar-add").click();
  await expect(day.getByTestId("calendar-item")).toHaveCount(1);

  // List view.
  await page.getByTestId("add-view").click();
  await viewDlg.getByTestId("view-name").fill("All tasks");
  await viewDlg.getByTestId("view-layout").click();
  await page.getByRole("option", { name: "List", exact: true }).click();
  await viewDlg.getByRole("button", { name: "Add view" }).click();
  await expect(page.getByTestId("list-item")).toHaveCount(4);

  // A row opens as a page with editable properties and its own blocks.
  await Promise.all([page.waitForURL(/\/p\//), page.getByTestId("list-item").filter({ hasText: "Book flights" }).getByRole("link").click()]);
  await expect(page.getByTestId("page-title")).toHaveValue("Book flights");
  await expect(page.getByTestId("row-properties")).toContainText("Done");
  await page.getByTestId("row-properties").getByTestId("prop-Due").fill("2026-12-01");
  await page.getByTestId("row-properties").getByTestId("prop-Due").blur();
  await addBlock(page, "Text", "Window seats for everyone who asked.");
  await page.goto(`/p/${dbId}`);
  await ready(page);
  await page.getByTestId("view-tab").filter({ hasText: "Table" }).click();
  await expect(page.getByTestId("db-row").filter({ has: page.locator('input[value="Book flights"]') }).getByTestId("cell-Due")).toHaveValue("2026-12-01");

  // Phone-sized smoke.
  const phone = await (await runtime.context("owner", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto(`/p/${planId}`);
  await ready(phone);
  await expect(phone.getByTestId("page-title")).toHaveValue("Spring offsite plan");
  await expect(phone.getByTestId("block").first()).toBeVisible();

  // The result of the main workflow, on screen.
  await page.goto(`/p/${planId}`);
  await ready(page);
  await expect(page.getByTestId("block").first()).toBeVisible();
  await runtime.assertBackLink(page);
  await runtime.screenshot(page);
} finally {
  await runtime.close();
}
