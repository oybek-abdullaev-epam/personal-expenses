import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyText, matches, parseEmail } from "../backend/src/parser";
import { money } from "../backend/src/domain";
import { fixture, message } from "./helpers";
test("bilingual email is one exact expense with explicit Tashkent time", () => {
  assert.deepEqual(parseEmail(message()), {
    direction: "expense",
    merchant: "SAMPLE TAXI, UZ",
    occurred_at: "2026-09-22T14:44:00.000Z",
    card_suffix: "1234",
    amount_minor: 3050000,
    currency: "UZS",
  });
});
test("HTML, entities and MIME alternatives preserve the format", () => {
  const html = fixture
    .split("\n")
    .map((x) => "<p>" + x.replaceAll("SAMPLE", "SAMPLE&nbsp;") + "</p>")
    .join("");
  assert.deepEqual(
    parseEmail(message("html", html, "text/html")),
    parseEmail(message()),
  );
  const m = message();
  m.payload = {
    ...m.payload,
    parts: [
      { mimeType: "text/plain", body: message().payload.body },
      {
        mimeType: "text/html",
        body: {
          data: Buffer.from("<p>unsupported alternative</p>").toString(
            "base64url",
          ),
        },
      },
    ],
  };
  assert.deepEqual(parseEmail(m), parseEmail(message()));
  assert(
    !bodyText({
      mimeType: "text/plain",
      filename: "attachment.txt",
      body: m.payload.body,
    }),
  );
});
test("malformed, conflicting, unsupported and impossible dates go to review", () => {
  for (const body of [
    fixture.replaceAll("E-Com oplata", "Perevod"),
    fixture.replaceAll("22.09.26", "31.02.26"),
    fixture.replaceAll("30500.00", "-30500.00"),
    fixture.replaceAll("UZS", "JPY"),
    "unknown alert",
    fixture.replace("30500.00", "40000.00"),
  ])
    assert("review_reason" in parseEmail(message("bad", body)));
});
test("money is exact and rejects unsafe integers; sender and subject are exact", () => {
  assert.equal(money("0.29"), 29);
  assert.throws(() => money("90071992547409.92"));
  assert.throws(() => money("1.234"));
  assert(matches(message()));
  const m = message();
  m.payload.headers![0].value = "attacker@info.uzcard.uz";
  assert(!matches(m));
});

test("balance text is discarded and appended transaction text is not swallowed", () => {
  const body = fixture.replaceAll(
    "30500.00 UZS",
    "30500.00 UZS balans:99.00 UZS",
  );
  assert.deepEqual(
    parseEmail(message("with-balance", body)),
    parseEmail(message()),
  );
  assert(
    "review_reason" in
      parseEmail(
        message(
          "ambiguous",
          body.replaceAll(
            "balans:99.00 UZS",
            "balans:99.00 UZS E-Com oplata: ANOTHER SHOP",
          ),
        ),
      ),
  );
});

test("Platezh outgoing transfers parse as expenses and discard balances", async () => {
  const { readFile } = await import("node:fs/promises");
  const body = await readFile(
    new URL("./fixtures/uzcard-transfer.txt", import.meta.url),
    "utf8",
  );
  const expected = {
    direction: "expense",
    merchant: "SAMPLE TRANSFER, UZ",
    occurred_at: "2026-09-22T14:44:00.000Z",
    card_suffix: "1234",
    amount_minor: 1250000,
    currency: "UZS",
  };
  assert.deepEqual(parseEmail(message("transfer", body)), expected);
  assert.deepEqual(
    parseEmail(
      message("transfer-html", body.replaceAll("\n", "<br>"), "text/html"),
    ),
    expected,
  );
  assert(
    "review_reason" in
      parseEmail(message("conflict", body.replace("12500.00", "15000.00"))),
  );
  assert(
    "review_reason" in
      parseEmail(message("unknown", body.replaceAll("Platezh", "Cashback"))),
  );
});

test("incoming transfer has explicit income direction in text and HTML", async () => {
  const { readFile } = await import("node:fs/promises");
  const body = await readFile(
    new URL("./fixtures/uzcard-income.txt", import.meta.url),
    "utf8",
  );
  const expected = {
    direction: "income",
    merchant: "SAMPLE SENDER, UZ",
    occurred_at: "2026-09-22T14:44:00.000Z",
    card_suffix: "1234",
    amount_minor: 1250000,
    currency: "UZS",
  };
  assert.deepEqual(parseEmail(message("in", body)), expected);
  assert.deepEqual(
    parseEmail(message("in-html", body.replaceAll("\n", "<br>"), "text/html")),
    expected,
  );
  assert.deepEqual(
    parseEmail(
      message("conflict", body.replace("Perevod na kartu", "Platezh")),
    ),
    { review_reason: "conflicting_transactions" },
  );
});

test("Popolnenie scheta account top-ups parse as income in text and HTML", async () => {
  const { readFile } = await import("node:fs/promises");
  const body = (
    await readFile(
      new URL("./fixtures/uzcard-income.txt", import.meta.url),
      "utf8",
    )
  ).replaceAll("Perevod na kartu", "Popolnenie scheta");
  const expected = {
    direction: "income",
    merchant: "SAMPLE SENDER, UZ",
    occurred_at: "2026-09-22T14:44:00.000Z",
    card_suffix: "1234",
    amount_minor: 1250000,
    currency: "UZS",
  };
  assert.deepEqual(parseEmail(message("topup", body)), expected);
  assert.deepEqual(
    parseEmail(message("topup-html", body.replaceAll("\n", "<br>"), "text/html")),
    expected,
  );
  assert.deepEqual(
    parseEmail(message("conflict", body.replace("Popolnenie scheta", "Platezh"))),
    { review_reason: "conflicting_transactions" },
  );
});

test("Pokupka purchases accept both comma variants in plain text and HTML", () => {
  const expected = {
    direction: "expense",
    merchant: "SAMPLE SHOP, UZ",
    occurred_at: "2026-09-25T08:41:00.000Z",
    card_suffix: "1234",
    amount_minor: 10000,
    currency: "UZS",
  };
  for (const merchantComma of ["", ","]) {
    for (const timeComma of ["", ","]) {
      for (const balanceComma of ["", ","]) {
        const line = `Pokupka: SAMPLE SHOP, UZ${merchantComma} 25.09.26 13:41${timeComma} karta ***1234. summa:100.00 UZS${balanceComma} balans:200.00 UZS`;
        for (const mime of ["text/plain", "text/html"]) {
          const body = [line, line].join(mime === "text/html" ? "<br>" : "\n");
          assert.deepEqual(
            parseEmail(message("purchase", body, mime)),
            expected,
          );
        }
        assert.deepEqual(
          parseEmail(
            message("conflict", line + "\n" + line.replace("100.00", "101.00")),
          ),
          { review_reason: "conflicting_transactions" },
        );
        assert.deepEqual(
          parseEmail(message("unknown", line.replace("Pokupka", "Unknown"))),
          { review_reason: "unsupported_operation" },
        );
        assert.deepEqual(
          parseEmail(message("trailing", line + " another transaction")),
          { review_reason: "unrecognized_format" },
        );
      }
    }
  }
});
