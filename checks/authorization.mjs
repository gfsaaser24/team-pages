import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { ready, addBlock, createPage, memberEmail, share, waitSaved } from "./helpers.mjs";

const runtime = await startRuntime();
try {
  await runtime.assertPrivateAccess(["/", "/search", "/trash", "/health"]);

  // X001: the app has no sign-in of its own.
  for (const path of ["/login", "/signin", "/signup", "/logout"]) {
    const res = await runtime.fetch(path, { role: "member" });
    expect(res.status).toBe(404);
    expect((await runtime.fetch(path)).status).not.toBe(200);
  }
  const memberMail = await memberEmail(runtime, "member");
  expect(memberMail).toContain("@");

  const owner = await (await runtime.context("owner")).newPage();
  const member = await (await runtime.context("member")).newPage();
  await member.goto("/");
  await ready(member);
  await expect(member.getByRole("heading", { level: 1 })).toBeVisible();

  // An owner's private page, with a sub-page and a file.
  const secretId = await createPage(owner, "Salary review notes");
  await addBlock(owner, "Text", "Confidential compensation figures");
  const form = new FormData();
  form.set("pageId", secretId);
  form.set("file", new Blob([Buffer.from("payroll")], { type: "text/plain" }), "payroll.txt");
  const up = await runtime.fetch("/api/files", { role: "owner", method: "POST", body: form });
  expect(up.status).toBe(201);
  const fileId = (await up.json()).id;

  // Capture a real save request so it can be replayed as someone else.
  const [saveReq] = await Promise.all([
    owner.waitForRequest((r) => r.method() === "POST" && r.url().includes("/_serverFn/") && (r.postData() ?? "").includes("Salary review notes v2")),
    owner.getByTestId("page-title").fill("Salary review notes v2"),
  ]);
  await waitSaved(owner);
  const replay = (role) =>
    runtime.fetch(new URL(saveReq.url()).pathname + new URL(saveReq.url()).search, {
      role,
      method: "POST",
      headers: Object.fromEntries(Object.entries(saveReq.headers()).filter(([k]) => ["content-type", "accept", "x-tsr-serverfn", "x-tsr-redirect"].includes(k.toLowerCase()) || k.toLowerCase().startsWith("x-tsr"))),
      body: saveReq.postData().replace("Salary review notes v2", "Hijacked"),
    });

  // Another member cannot see, find, download or change it.
  await member.goto(`/p/${secretId}`);
  await ready(member);
  await expect(member.getByTestId("no-access")).toBeVisible();
  await expect(member.getByText("Confidential compensation")).toHaveCount(0);
  await member.goto("/");
  await ready(member);
  await expect(member.getByTestId("sidebar").getByText("Salary review")).toHaveCount(0);
  await member.goto("/search?q=compensation");
  await ready(member);
  await expect(member.getByTestId("search-empty")).toBeVisible();
  expect((await runtime.fetch(`/api/files/${fileId}`, { role: "member" })).status).toBe(404);
  const memberUpload = new FormData();
  memberUpload.set("pageId", secretId);
  memberUpload.set("file", new Blob([Buffer.from("x")]), "x.txt");
  expect((await runtime.fetch("/api/files", { role: "member", method: "POST", body: memberUpload })).status).toBe(404);
  // Server functions answer a thrown refusal in their serialized body.
  const isRefusal = async (res) => {
    const text = await res.text();
    return res.status >= 400 || /Page not found|permission/.test(text);
  };
  expect(await isRefusal(await replay("member"))).toBe(true);
  const db = await runtime.database();
  const title = async () => (await db.prepare("select title from pages where id = ?").bind(secretId).first()).title;
  expect(await title()).toBe("Salary review notes v2");

  // Can view: reads, no edit controls, server refuses edits.
  await share(owner, memberMail, "Can view");
  await member.goto(`/p/${secretId}`);
  await ready(member);
  await expect(member.getByTestId("page-title")).toHaveValue("Salary review notes v2");
  await expect(member.getByTestId("page-title")).toHaveAttribute("readonly", "");
  await expect(member.getByTestId("add-block")).toHaveCount(0);
  await expect(member.getByTestId("share-button")).toHaveCount(0);
  await expect(member.getByTestId("publish-button")).toHaveCount(0);
  await expect(member.getByTestId("block-menu")).toHaveCount(0);
  await member.getByTestId("comments-button").click();
  await expect(member.getByTestId("comment-input")).toHaveCount(0);
  await member.keyboard.press("Escape");
  expect((await runtime.fetch(`/api/files/${fileId}`, { role: "member" })).status).toBe(200);
  expect(await isRefusal(await replay("member"))).toBe(true);
  expect(await title()).toBe("Salary review notes v2");

  // The shared page shows in the member's tree under Shared.
  await expect(member.getByTestId("sidebar-shared").getByText("Salary review notes v2")).toBeVisible();

  // Can comment: comments, cannot resolve others' or delete them.
  await owner.getByTestId("comments-button").click();
  await owner.getByTestId("comment-input").fill("Owner note");
  await owner.getByRole("button", { name: "Comment" }).click();
  await expect(owner.getByTestId("comment").filter({ hasText: "Owner note" })).toBeVisible();
  await owner.keyboard.press("Escape");
  await share(owner, memberMail, "Can comment");
  await member.reload();
  await ready(member);
  await member.getByTestId("comments-button").click();
  await member.getByTestId("comment-input").fill("Member question");
  await member.getByRole("button", { name: "Comment" }).click();
  const mine = member.getByTestId("comment").filter({ hasText: "Member question" });
  await expect(mine).toBeVisible();
  await expect(mine.getByRole("button", { name: "Delete" })).toBeVisible();
  const theirs = member.getByTestId("comment").filter({ hasText: "Owner note" });
  await expect(theirs.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(theirs.getByRole("button", { name: "Resolve" })).toHaveCount(0);
  await member.keyboard.press("Escape");
  await expect(member.getByTestId("page-title")).toHaveAttribute("readonly", "");

  // Can edit: edits, but no sharing or publishing.
  await share(owner, memberMail, "Can edit");
  await member.reload();
  await ready(member);
  await member.getByTestId("page-title").fill("Salary review notes v3");
  await waitSaved(member);
  await expect(member.getByTestId("share-button")).toHaveCount(0);
  await expect(member.getByTestId("publish-button")).toHaveCount(0);

  // Grants reach sub-pages; the broadest grant wins.
  await owner.reload();
  await ready(owner);
  await owner.getByTestId("add-block").click();
  await owner.getByRole("menuitem", { name: "Sub-page", exact: true }).click();
  await waitSaved(owner);
  await Promise.all([owner.waitForURL(/\/p\//), owner.getByTestId("subpage-link").last().click()]);
  const childId = owner.url().split("/p/")[1];
  await expect(owner.getByTestId("page-title")).toHaveValue("");
  await owner.getByTestId("page-title").fill("Bands by level");
  await waitSaved(owner);
  await member.goto(`/p/${childId}`);
  await ready(member);
  await expect(member.getByTestId("page-title")).toHaveValue("Bands by level");
  await expect(member.getByTestId("page-title")).not.toHaveAttribute("readonly", "");

  // Removing the grant removes access.
  await owner.goto(`/p/${secretId}`);
  await ready(owner);
  await owner.getByTestId("share-button").click();
  await owner.getByRole("dialog").getByTestId("grant").filter({ hasText: memberMail }).getByRole("button", { name: "Remove" }).click();
  await expect(owner.getByRole("dialog").getByTestId("grant").filter({ hasText: memberMail })).toHaveCount(0);
  await owner.keyboard.press("Escape");
  await member.goto(`/p/${childId}`);
  await ready(member);
  await expect(member.getByTestId("no-access")).toBeVisible();

  // Admins have full access to a member's private page.
  const memberPageId = await createPage(member, "Member draft");
  await owner.goto(`/p/${memberPageId}`);
  await ready(owner);
  await expect(owner.getByTestId("page-title")).toHaveValue("Member draft");
  await expect(owner.getByTestId("share-button")).toBeVisible();

  // Public links: only published, unexpired pages, with no comments or member data.
  expect((await runtime.fetch("/s/not-a-real-link-000000000")).status).toBe(404);
  await owner.goto(`/p/${secretId}`);
  await ready(owner);
  await owner.getByTestId("publish-button").click();
  await owner.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
  const publicPath = new URL(await owner.getByRole("dialog").getByTestId("publish-link").inputValue()).pathname;
  const html = await (await runtime.fetch(publicPath)).text();
  expect(html).toContain("Salary review notes v3");
  expect(html).not.toContain("Owner note");
  expect(html).not.toContain("Member question");
  expect(html).not.toContain(memberMail);
  expect((await runtime.fetch(`${publicPath}/files/${fileId}`)).status).toBe(200);
  // A file outside the published subtree is never served there.
  const otherForm = new FormData();
  otherForm.set("pageId", memberPageId);
  otherForm.set("file", new Blob([Buffer.from("draft")]), "draft.txt");
  const other = await (await runtime.fetch("/api/files", { role: "member", method: "POST", body: otherForm })).json();
  expect((await runtime.fetch(`${publicPath}/files/${other.id}`)).status).toBe(404);
  // A page outside the subtree is never rendered there.
  expect(await (await runtime.fetch(`${publicPath}?p=${memberPageId}`)).text()).not.toContain("Member draft");
  // Expired links are not found.
  await owner.getByRole("dialog").getByTestId("publish-expiry").fill("2020-01-01T00:00");
  await owner.getByRole("dialog").getByRole("button", { name: "Save expiry" }).click();
  await expect(owner.getByRole("dialog").getByTestId("publish-expiry-current")).toContainText("2020");
  expect((await runtime.fetch(publicPath)).status).toBe(404);
  await owner.getByRole("dialog").getByRole("button", { name: "Unpublish" }).click();
  await expect(owner.getByRole("dialog").getByTestId("publish-link")).toHaveCount(0);
  expect((await runtime.fetch(publicPath)).status).toBe(404);

  // Outsiders get nothing private.
  expect([401, 403]).toContain((await runtime.fetch(`/p/${secretId}`, { role: "outsider" })).status);
  expect([401, 403]).toContain((await runtime.fetch(`/api/files/${fileId}`, { role: "outsider" })).status);
  expect([401, 403]).toContain((await runtime.fetch(`/api/files/${fileId}`)).status);
} finally {
  await runtime.close();
}
