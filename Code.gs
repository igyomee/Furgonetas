const SPREADSHEET_ID = "";
const SHEET_NAME = "Registros";
const VANS_SHEET_NAME = "Furgonetas";
const PUBLIC_TOKEN = "";

const HEADERS = [
  "event_id",
  "server_timestamp",
  "client_timestamp",
  "van_id",
  "van_label",
  "van_plate",
  "action",
  "driver_name",
  "odometer",
  "notes",
  "page_url",
  "user_agent"
];

const VAN_HEADERS = ["van_id", "label", "plate", "active"];

function setup() {
  const ss = getSpreadsheet_();
  const eventsSheet = getOrCreateSheet_(ss, SHEET_NAME);
  ensureHeaderRow_(eventsSheet, HEADERS);

  const vansSheet = getOrCreateSheet_(ss, VANS_SHEET_NAME);
  ensureHeaderRow_(vansSheet, VAN_HEADERS);
  if (vansSheet.getLastRow() === 1) {
    vansSheet.getRange(2, 1, 3, 4).setValues([
      ["furgo-01", "Furgoneta 1", "0000 AAA", true],
      ["furgo-02", "Furgoneta 2", "1111 BBB", true],
      ["furgo-03", "Furgoneta 3", "2222 CCC", true]
    ]);
  }

  eventsSheet.setFrozenRows(1);
  vansSheet.setFrozenRows(1);
  return "Configuracion completada";
}

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    requireToken_(params.token);

    if (params.route === "status") {
      return output_(getStatus_(params.van), params.callback);
    }

    if (params.route === "vans") {
      return output_({ ok: true, vans: listVans_() }, params.callback);
    }

    return output_({ ok: true, service: "fleet-register" }, params.callback);
  } catch (error) {
    return output_({ ok: false, error: error.message }, e && e.parameter ? e.parameter.callback : "");
  }
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    requireToken_(payload.token);
    const result = appendEvent_(payload);
    return output_(result);
  } catch (error) {
    return output_({ ok: false, error: error.message });
  }
}

function appendEvent_(payload) {
  const ss = getSpreadsheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);

  try {
    setup();
    const sheet = ss.getSheetByName(SHEET_NAME);
    const vansById = getVanMap_(ss);
    const hasConfiguredVans = Object.keys(vansById).length > 0;
    const vanId = clean_(payload.vanId);

    if (!vanId) {
      throw new Error("Falta vanId");
    }

    if (hasConfiguredVans && !vansById[vanId]) {
      throw new Error("La furgoneta no esta activa en la hoja Furgonetas");
    }

    const action = clean_(payload.action);
    if (action !== "pickup" && action !== "return") {
      throw new Error("Accion no valida");
    }

    const eventId = clean_(payload.eventId) || Utilities.getUuid();
    if (isDuplicateEvent_(sheet, eventId)) {
      return { ok: true, duplicate: true, eventId: eventId };
    }

    const vanInfo = vansById[vanId] || {};
    const row = [
      eventId,
      new Date(),
      clean_(payload.clientTimestamp),
      vanId,
      clean_(payload.vanLabel) || vanInfo.label || "",
      clean_(payload.vanPlate) || vanInfo.plate || "",
      action,
      clean_(payload.driverName),
      clean_(payload.odometer),
      clean_(payload.notes),
      clean_(payload.pageUrl),
      clean_(payload.userAgent)
    ];

    if (!row[7]) {
      throw new Error("El nombre del conductor es obligatorio");
    }

    sheet.appendRow(row);
    return { ok: true, eventId: eventId };
  } finally {
    lock.releaseLock();
  }
}

function getStatus_(vanId) {
  const ss = getSpreadsheet_();
  setup();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const targetVan = clean_(vanId);
  const lastRow = sheet.getLastRow();

  if (!targetVan) {
    throw new Error("Falta van");
  }

  if (lastRow < 2) {
    return { ok: true, vanId: targetVan, state: "available", lastEvent: null };
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (clean_(row[3]) === targetVan) {
      const action = clean_(row[6]);
      return {
        ok: true,
        vanId: targetVan,
        state: action === "pickup" ? "in_use" : "available",
        lastEvent: {
          eventId: row[0],
          serverTimestamp: row[1] instanceof Date ? row[1].toISOString() : row[1],
          action: action,
          odometer: row[8] || ""
        }
      };
    }
  }

  return { ok: true, vanId: targetVan, state: "available", lastEvent: null };
}

function listVans_() {
  const ss = getSpreadsheet_();
  setup();
  const vansById = getVanMap_(ss);
  return Object.keys(vansById).map(function (id) {
    return vansById[id];
  });
}

function parsePayload_(e) {
  if (e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }

  if (e && e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }

  return e && e.parameter ? e.parameter : {};
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error("Pega este script en una hoja de calculo o rellena SPREADSHEET_ID");
  }
  return active;
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function ensureHeaderRow_(sheet, headers) {
  const range = sheet.getRange(1, 1, 1, headers.length);
  const current = range.getValues()[0];
  const needsHeader = headers.some(function (header, index) {
    return current[index] !== header;
  });

  if (needsHeader) {
    range.setValues([headers]);
    range.setFontWeight("bold");
    sheet.autoResizeColumns(1, headers.length);
  }
}

function getVanMap_(ss) {
  const sheet = ss.getSheetByName(VANS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    return {};
  }

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, VAN_HEADERS.length).getValues();
  return rows.reduce(function (acc, row) {
    const id = clean_(row[0]);
    const activeText = clean_(row[3]).toLowerCase();
    const active = row[3] === true || activeText === "true" || activeText === "si" || activeText === "verdadero";
    if (id && active) {
      acc[id] = {
        id: id,
        label: clean_(row[1]),
        plate: clean_(row[2]),
        active: true
      };
    }
    return acc;
  }, {});
}

function isDuplicateEvent_(sheet, eventId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || !eventId) {
    return false;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  return values.some(function (row) {
    return row[0] === eventId;
  });
}

function requireToken_(token) {
  if (PUBLIC_TOKEN && clean_(token) !== PUBLIC_TOKEN) {
    throw new Error("Token no valido");
  }
}

function output_(data, callback) {
  const safeCallback = clean_(callback);
  if (safeCallback && /^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(safeCallback)) {
    return ContentService
      .createTextOutput(safeCallback + "(" + JSON.stringify(data) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function clean_(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}
