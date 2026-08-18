/**
 * BSA Lead List — sheet mirror endpoint.
 *
 * Receives one parcel at a time from the Cloudflare Worker and upserts it into
 * the "BSA Leads" tab. The parcel number is the permanent key: the same parcel
 * arriving twice updates its row rather than adding another, which is what
 * makes the Worker's retries safe.
 *
 * Nothing here deletes. An unrecognised column is left alone, and a row whose
 * parcel is not in the payload is never touched.
 *
 * The shared secret is NOT in this file. It is read from Script Properties,
 * which you set once in the Apps Script editor — see README.md.
 */

var SHEET_NAME = "BSA Leads";
var SECRET_PROPERTY = "WEBHOOK_SECRET";

/**
 * The columns this script maintains, in the order it would create them.
 *
 * If the sheet already has a header with these names in any order, that
 * existing layout wins — headers are matched by name, never by position, so an
 * existing sheet is never restructured.
 */
var COLUMNS = [
  { key: "dateAdded", header: "Date Added" },
  { key: "ownerName", header: "Owner Name" },
  { key: "propertyAddress", header: "Property Address" },
  { key: "propertyCity", header: "Property City" },
  { key: "mailingAddress", header: "Mailing Address" },
  { key: "mailingCity", header: "Mailing City" },
  { key: "municipality", header: "Municipality" },
  { key: "parcelNumber", header: "Parcel Number" },
  { key: "source", header: "Source" },
  { key: "phone", header: "Phone" },
  { key: "email", header: "Email" },
  { key: "lastUpdated", header: "Last Updated" },
];

/** Header names that already mean "parcel number" in an existing sheet. */
var PARCEL_ALIASES = ["parcel number", "parcel", "pnum", "parcel #", "parcel no"];

/* ---------------------------------------------------------------------------
   Pure helpers — these are unit tested from the repository.
   --------------------------------------------------------------------------- */

function normalizeHeader(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

/**
 * A parcel number reduced to something comparable.
 *
 * Sheets happily turns "41-15-01-100-005" into text but a hand-typed one may
 * carry stray spaces, and a number that lost its dashes still identifies the
 * same parcel. Comparing on digits alone makes the match reliable.
 */
function parcelKey(value) {
  return String(value == null ? "" : value).replace(/\D/g, "");
}

/** Where each maintained column lives in an existing header row. */
function mapColumns(headerRow) {
  var normalized = (headerRow || []).map(normalizeHeader);
  var map = {};
  for (var i = 0; i < COLUMNS.length; i++) {
    var col = COLUMNS[i];
    map[col.key] = normalized.indexOf(normalizeHeader(col.header));
  }
  return map;
}

/** The parcel column, tolerating the names an existing sheet might use. */
function findParcelColumn(headerRow) {
  var normalized = (headerRow || []).map(normalizeHeader);
  for (var i = 0; i < PARCEL_ALIASES.length; i++) {
    var at = normalized.indexOf(PARCEL_ALIASES[i]);
    if (at !== -1) return at;
  }
  return -1;
}

/**
 * The 0-based data row for a parcel, or -1 when it is new.
 *
 * `rows` excludes the header.
 */
function findParcelRow(rows, parcelColumn, parcel) {
  var wanted = parcelKey(parcel);
  if (!wanted || parcelColumn < 0) return -1;
  for (var i = 0; i < rows.length; i++) {
    if (parcelKey(rows[i][parcelColumn]) === wanted) return i;
  }
  return -1;
}

/**
 * Build the values to write, preserving anything the sheet already holds.
 *
 * Two rules matter. Columns this script does not maintain keep their existing
 * values untouched. And on an update, a blank incoming value does not erase
 * what is already there — the Worker sends empty phone and email because the
 * county publishes neither, and that must never wipe a number somebody typed
 * into the sheet by hand.
 */
function buildRowValues(existingRow, columnMap, row, width) {
  var out = [];
  for (var i = 0; i < width; i++) {
    out.push(existingRow ? existingRow[i] : "");
  }

  for (var key in columnMap) {
    if (!Object.prototype.hasOwnProperty.call(columnMap, key)) continue;
    var at = columnMap[key];
    if (at < 0 || at >= width) continue;

    var incoming = row[key];
    if (incoming === undefined || incoming === null) continue;
    incoming = String(incoming);

    // Never overwrite something already in the sheet with a blank.
    if (incoming === "" && existingRow && String(out[at]) !== "") continue;

    out[at] = incoming;
  }

  return out;
}

/** Whether the supplied secret matches, in constant time. */
function secretMatches(supplied, expected) {
  var a = String(supplied == null ? "" : supplied);
  var b = String(expected == null ? "" : expected);
  if (!b || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------------------------------------------------------------------------
   The Web App entry point
   --------------------------------------------------------------------------- */

function jsonOut(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return jsonOut({ ok: false, error: "Body was not JSON" });
  }

  var expected = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY);
  if (!expected) {
    return jsonOut({ ok: false, error: "Script is not configured with a secret yet" });
  }
  if (!secretMatches(body.secret, expected)) {
    return jsonOut({ ok: false, error: "Unauthorized" });
  }

  var row = body.row;
  if (!row || !row.parcelNumber) {
    return jsonOut({ ok: false, error: "No parcel number supplied" });
  }

  // One writer at a time: two overlapping requests for the same parcel would
  // otherwise both see "not present" and both append.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return jsonOut({ ok: false, error: "Sheet was busy" });
  }

  try {
    return jsonOut(writeRow(row));
  } catch (err) {
    return jsonOut({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

/** Upsert one parcel. Returns the structured result the Worker reads. */
function writeRow(row) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
  }

  // A brand new or empty sheet gets the standard header. An existing one is
  // left exactly as it is.
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(
      COLUMNS.map(function (c) {
        return c.header;
      }),
    );
  }

  var lastRow = sheet.getLastRow();
  var width = Math.max(sheet.getLastColumn(), COLUMNS.length);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0];

  var columnMap = mapColumns(header);
  var parcelColumn = findParcelColumn(header);

  // An existing sheet with no recognisable parcel column cannot be deduplicated
  // safely, and appending blindly would create the duplicates this exists to
  // prevent. Refusing is the safe answer; the row stays pending in the outbox.
  if (parcelColumn < 0) {
    return { ok: false, error: 'No "Parcel Number" column found in ' + SHEET_NAME };
  }

  var rows =
    lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];
  var at = findParcelRow(rows, parcelColumn, row.parcelNumber);

  if (at === -1) {
    var fresh = buildRowValues(null, columnMap, row, width);
    // Make sure the parcel lands even if the header uses an alias name.
    fresh[parcelColumn] = String(row.parcelNumber);
    sheet.appendRow(fresh);
    return { ok: true, action: "inserted", parcel: String(row.parcelNumber) };
  }

  var updated = buildRowValues(rows[at], columnMap, row, width);
  updated[parcelColumn] = String(row.parcelNumber);
  sheet.getRange(at + 2, 1, 1, width).setValues([updated]);
  return { ok: true, action: "updated", parcel: String(row.parcelNumber) };
}

/** A browser visiting the URL gets a harmless answer, never data. */
function doGet() {
  return jsonOut({ ok: true, service: "BSA Leads mirror" });
}
