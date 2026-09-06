const test = require("node:test");
const fs = require("node:fs");
const { initializeTestEnvironment, assertFails } = require("@firebase/rules-unit-testing");

let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "devgrullon-labs-rules-test",
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

test.after(async () => {
  await testEnv.cleanup();
});

test("an unauthenticated client cannot read chat_leads", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection("chat_leads").doc("session1").get());
});

test("an unauthenticated client cannot write to chat_leads", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection("chat_leads").doc("session1").set({ hola: "mundo" }));
});
