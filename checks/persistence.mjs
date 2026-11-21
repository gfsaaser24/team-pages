import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { ready, addBlock, createPage, waitSaved } from "./helpers.mjs";

const runtime = await startRuntime();
try {
  let page = await (await runtime.context("owner")).newPage();
  const id = await createPage(page, "Quarterly planning");
  await addBlock(page, "To-do", "Send the survey");
  await page.goto("/");
  await ready(page);
  await Promise.all([page.waitForURL(/\/p\//), page.getByTestId("new-database").click()]);
  const dbId = page.url().split("/p/")[1];
  await page.getByTestId("page-title").fill("Hiring pipeline");
  await waitSaved(page);
  await page.getByTestId("new-row").click();
  await expect(page.getByTestId("db-row")).toHaveCount(1);
  await page.getByTestId("db-row").last().getByTestId("cell-title").fill("Backend engineer");
  await page.getByTestId("db-row").last().getByTestId("cell-title").press("Enter");
  await page.getByTestId("db-row").last().getByTestId("cell-Status").click();
  await page.getByRole("option", { name: "In progress", exact: true }).click();
  await expect(page.getByTestId("db-row").last().getByTestId("cell-Status")).toContainText("In progress");

  const form = new FormData();
  form.set("pageId", id);
  form.set("file", new Blob([Buffer.from("survey questions")], { type: "text/plain" }), "survey.txt");
  const fileId = (await (await runtime.fetch("/api/files", { role: "owner", method: "POST", body: form })).json()).id;

  await runtime.restart();

  page = await (await runtime.context("owner")).newPage();
  await page.goto(`/p/${id}`);
  await ready(page);
  await expect(page.getByTestId("page-title")).toHaveValue("Quarterly planning");
  await expect(page.getByTestId("block-text").first()).toHaveValue("Send the survey");
  await page.goto(`/p/${dbId}`);
  await ready(page);
  await expect(page.getByTestId("db-row").getByTestId("cell-title")).toHaveValue("Backend engineer");
  await expect(page.getByTestId("db-row").getByTestId("cell-Status")).toContainText("In progress");
  const file = await runtime.fetch(`/api/files/${fileId}`, { role: "owner" });
  expect(file.status).toBe(200);
  expect(await file.text()).toBe("survey questions");
} finally {
  await runtime.close();
}
