/**
 * GIS Leads mirror for the BSA Lead List spreadsheet.
 *
 * Receives a batch of parcels from the Cloudflare Worker and writes them to
 * the "GIS Leads" tab. The parcel number is the key: a parcel already present
 * is updated in place rather than added again, which is what makes the
 * Worker's retries safe.
 *
 * This tab is written only by this script, so its layout is known and fixed.
 * Nothing here deletes, and no other tab is touched.
 *
 * The shared secret is not in this file — it is read from Script Properties.
 */

var SHEET_NAME = "GIS Leads";
var SECRET_PROPERTY = "WEBHOOK_SECRET";

var HEADERS = [
  "Date Added",
  "Owner Name",
  "Property Address",
  "Property City",
  "Mailing Address",
  "Mailing City",
  "Municipality",
  "Parcel Number",
  "Source",
  "Phone",
  "Email",
  "Last Updated",
];

/** The payload field for each column, in the same order. */
var KEYS = [
  "dateAdded",
  "ownerName",
  "propertyAddress",
  "propertyCity",
  "mailingAddress",
  "mailingCity",
  "municipality",
  "parcelNumber",
  "source",
  "phone",
  "email",
  "lastUpdated",
];

/** Zero-based position of "Parcel Number" above. */
var PARCEL_COL = 7;

/* --------------------------------------------------------------------------
   Pure helpers — unit tested from the repository.
   -------------------------------------------------------------------------- */

/**
 * A parcel number reduced to digits.
 *
 * Sheets can render the same parcel with or without dashes, and a hand-typed
 * one may carry stray spaces. Comparing digits alone makes the match reliable.
 */
function parcelKey(value) {
  return String(value == null ? "" : value).replace(/\D/g, "");
}

/**
 * The twelve values for a row.
 *
 * A blank incoming value never erases something already in the sheet. The
 * Worker always sends empty phone and email because the county publishes
 * neither, and that must not wipe a number typed in by hand.
 */
function rowValues(row, existing) {
  return KEYS.map(function (key, i) {
    var incoming = row[key] == null ? "" : String(row[key]);
    if (incoming === "" && existing) return existing[i];
    return incoming;
  });
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

/* --------------------------------------------------------------------------
   The Web App
   -------------------------------------------------------------------------- */

function jsonOut(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/** The GIS Leads tab, created with its header the first time. */
function gisSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = book.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  return sheet;
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return jsonOut({ ok: false, error: "Body was not JSON" });
  }

  var expected = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY);
  if (!expected) return jsonOut({ ok: false, error: "No secret configured" });
  if (!secretMatches(body.secret, expected)) return jsonOut({ ok: false, error: "Unauthorized" });

  // A batch per request. Cloudflare allows 50 outbound calls per run and each
  // POST costs two, so one request per parcel could not carry a day of leads.
  var rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return jsonOut({ ok: false, error: "No rows supplied" });

  // One writer at a time, or two overlapping requests for the same parcel
  // would both see "not present" and both append.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return jsonOut({ ok: false, error: "Sheet was busy" });
  }

  try {
    var sheet = gisSheet();
    var last = sheet.getLastRow();
    var existing = last > 1 ? sheet.getRange(2, 1, last - 1, HEADERS.length).getValues() : [];

    // Parcel -> row number, built once for the whole batch.
    var seen = {};
    for (var i = 0; i < existing.length; i++) {
      var key = parcelKey(existing[i][PARCEL_COL]);
      if (key) seen[key] = i + 2;
    }

    var results = [];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (!row || !row.parcelNumber) {
        results.push({ ok: false, error: "No parcel number" });
        continue;
      }

      try {
        var pk = parcelKey(row.parcelNumber);
        var at = seen[pk];

        if (at) {
          var current = sheet.getRange(at, 1, 1, HEADERS.length).getValues()[0];
          sheet.getRange(at, 1, 1, HEADERS.length).setValues([rowValues(row, current)]);
          results.push({ ok: true, action: "updated" });
        } else {
          sheet.appendRow(rowValues(row, null));
          // Remember it, so a repeat inside this same batch updates instead.
          seen[pk] = sheet.getLastRow();
          results.push({ ok: true, action: "inserted" });
        }
      } catch (err) {
        results.push({ ok: false, error: String((err && err.message) || err) });
      }
    }

    return jsonOut({ ok: true, results: results });
  } catch (err) {
    return jsonOut({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

/** A browser visiting the URL gets a harmless answer, never data. */
function doGet() {
  return jsonOut({ ok: true, service: "GIS Leads mirror" });
}
