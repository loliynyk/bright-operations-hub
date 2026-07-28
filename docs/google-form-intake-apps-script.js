/**
 * Bright OS — Google Form → Lead intake bridge.
 *
 * Reusable Apps Script bound to the response spreadsheet of a Google Form.
 * Sends every new submission to the Supabase Edge Function
 * `google-form-lead-intake`, which authenticates the request with a
 * form-specific shared secret and creates a Lead in Bright OS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE-TIME SETUP (per form)
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Open the response Google Sheet linked to the Form.
 *      (Form → Responses → link to Sheets.)
 * 2. Extensions → Apps Script. Paste this whole file into Code.gs and save.
 * 3. Project Settings → Script Properties → add:
 *      BRIGHT_INTAKE_URL   = https://<project-ref>.supabase.co/functions/v1/google-form-lead-intake
 *      BRIGHT_FORM_ID      = <external_form_id registered in lead_intake_forms>
 *      BRIGHT_FORM_SECRET  = <plain secret; the DB stores its SHA-256 hash>
 * 4. Run `installTrigger` once from the editor.
 *      - Approve the OAuth scopes when prompted (script must run as the
 *        owner listed on the Bright OS ticket: novlara@gmail.com).
 *      - This installs an on-form-submit trigger for THIS spreadsheet.
 * 5. Submit a test form response and confirm a Lead appears in Bright OS.
 *      Failures are logged to Apps Script → Executions and appended to a
 *      hidden "_bright_intake_log" sheet.
 *
 * The trigger reads e.namedValues, so it is robust to column reordering.
 * Header matching is done server-side against the registration's
 * field_mapping in `lead_intake_forms.field_mapping`.
 * ─────────────────────────────────────────────────────────────────────────
 */

var LOG_SHEET_NAME = '_bright_intake_log';

/** Run this once from the editor to install the submit trigger. */
function installTrigger() {
  var ss = SpreadsheetApp.getActive();
  // Remove any prior triggers we installed for this handler on this sheet.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmitHandler') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('onFormSubmitHandler')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();
  Logger.log('Trigger installed for spreadsheet %s', ss.getId());
}

/** Installable onFormSubmit trigger. Do NOT rename. */
function onFormSubmitHandler(e) {
  var props = PropertiesService.getScriptProperties();
  var endpoint = props.getProperty('BRIGHT_INTAKE_URL');
  var formId = props.getProperty('BRIGHT_FORM_ID');
  var secret = props.getProperty('BRIGHT_FORM_SECRET');

  if (!endpoint || !formId || !secret) {
    logFailure_('Missing script properties (BRIGHT_INTAKE_URL / BRIGHT_FORM_ID / BRIGHT_FORM_SECRET).', null);
    return;
  }

  // e.namedValues: { header: [value, ...] }. Flatten to single strings but
  // preserve raw arrays too for auditability on the server.
  var fields = {};
  if (e && e.namedValues) {
    Object.keys(e.namedValues).forEach(function (rawHeader) {
      var header = normalizeHeader_(rawHeader);
      if (!header) return; // skip blank headers safely; raw payload still carries value below
      var vals = e.namedValues[rawHeader] || [];
      fields[header] = vals.length <= 1 ? (vals[0] || '') : vals;
    });
  }

  var ss = SpreadsheetApp.getActive();
  var sheet = e && e.range ? e.range.getSheet() : ss.getActiveSheet();
  var row = e && e.range ? e.range.getRow() : -1;
  // Stable response identifier — prefer form response ID when available, else compose from location.
  var responseId = getFormResponseId_(e) || (ss.getId() + ':' + sheet.getName() + ':row' + row);

  var submittedAt = (e && e.values && e.values[0]) ? new Date(e.values[0]).toISOString() : new Date().toISOString();

  var payload = {
    form_id: formId,
    response_id: responseId,
    submitted_at: submittedAt,
    fields: fields,
    // Raw echo of what Apps Script received, so blank/duplicate headers are preserved.
    raw: {
      namedValues: e ? e.namedValues : null,
      values: e ? e.values : null,
      sheet: sheet.getName(),
      row: row,
    },
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-intake-secret': secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    var res = UrlFetchApp.fetch(endpoint, options);
    var code = res.getResponseCode();
    var text = res.getContentText();
    if (code >= 200 && code < 300) {
      Logger.log('Bright OS intake ok [%s]: %s', code, text);
    } else {
      logFailure_('HTTP ' + code + ' from Bright OS intake: ' + text, payload);
    }
  } catch (err) {
    logFailure_('Fetch error: ' + (err && err.message ? err.message : err), payload);
  }
}

function normalizeHeader_(h) {
  if (h == null) return '';
  return String(h).replace(/\s+/g, ' ').replace(/[;\s]+$/g, '').trim();
}

/**
 * Try to recover the underlying Form response ID when the trigger is bound
 * to the Sheet. Falls back to null; caller composes a deterministic ID.
 */
function getFormResponseId_(e) {
  try {
    if (!e || !e.range) return null;
    var sheet = e.range.getSheet();
    var formUrl = sheet.getParent().getFormUrl && sheet.getParent().getFormUrl();
    if (!formUrl) return null;
    var form = FormApp.openByUrl(formUrl);
    var responses = form.getResponses();
    if (!responses || !responses.length) return null;
    // Best-effort: the most recent response is almost always the one that fired the trigger.
    return responses[responses.length - 1].getId();
  } catch (err) {
    return null;
  }
}

function logFailure_(message, payload) {
  Logger.log('Bright OS intake FAILURE: %s', message);
  try {
    var ss = SpreadsheetApp.getActive();
    var sheet = ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME).hideSheet();
    sheet.appendRow([new Date(), message, payload ? JSON.stringify(payload) : '']);
  } catch (err) {
    Logger.log('Also failed to write log sheet: %s', err && err.message ? err.message : err);
  }
}
