const SPREADSHEET_ID = "";
const REGISTROS_SHEET_NAME = "Registros";
const VANS_SHEET_NAME = "Furgonetas";
const OPERATORS_SHEET_NAME = "Operarios";
const PUBLIC_TOKEN = "";

const REGISTROS_HEADERS = [
  "registro_id",
  "estado",
  "fecha_recogida",
  "hora_recogida",
  "fecha_devolucion",
  "hora_devolucion",
  "vehiculo_codigo",
  "matricula",
  "descripcion",
  "codigo_recogida",
  "operario_recogida",
  "codigo_devolucion",
  "operario_devolucion",
  "kilometros_recogida",
  "kilometros_devolucion",
  "notas_recogida",
  "notas_devolucion",
  "client_timestamp_recogida",
  "client_timestamp_devolucion",
  "page_url",
  "user_agent_recogida",
  "user_agent_devolucion"
];

const VANS_HEADERS = [
  "codigo",
  "matricula",
  "descripcion",
  "ensituacion",
  "plazas",
  "nombre",
  "apellidos",
  "baca"
];

const OPERATORS_HEADERS = [
  "codigo",
  "nombre",
  "apellidos",
  "nombre_completo"
];

function setup() {
  const ss = getSpreadsheet_();

  const registrosSheet = getOrCreateSheet_(ss, REGISTROS_SHEET_NAME);
  ensureHeaderRow_(registrosSheet, REGISTROS_HEADERS);
  registrosSheet.setFrozenRows(1);
  applyRegistrosValidation_(registrosSheet);

  const vansSheet = getOrCreateSheet_(ss, VANS_SHEET_NAME);
  ensureHeaderRow_(vansSheet, VANS_HEADERS);
  fillDefaultVansIfEmpty_(vansSheet);
  vansSheet.setFrozenRows(1);

  const operatorsSheet = getOrCreateSheet_(ss, OPERATORS_SHEET_NAME);
  ensureHeaderRow_(operatorsSheet, OPERATORS_HEADERS);
  fillDefaultOperatorsIfEmpty_(operatorsSheet);
  operatorsSheet.setFrozenRows(1);

  return "Configuracion completada";
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  try {
    requireToken_(params.token);

    if (params.route === "status") {
      return output_(getStatus_(params.van), params.callback);
    }

    if (params.route === "vans") {
      return output_({ ok: true, vans: listVans_() }, params.callback);
    }

    if (params.route === "operators") {
      return output_({ ok: true, operators: listOperators_() }, params.callback);
    }

    if (params.route === "submit") {
      const payload = params.payload ? JSON.parse(params.payload) : params;
      requireToken_(payload.token || params.token);
      return output_(saveMovement_(payload), params.callback);
    }

    return output_({ ok: true, service: "fleet-register" }, params.callback);
  } catch (error) {
    return output_({ ok: false, error: error.message }, params.callback);
  }
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    requireToken_(payload.token);
    return output_(saveMovement_(payload));
  } catch (error) {
    return output_({ ok: false, error: error.message });
  }
}

function saveMovement_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);

  try {
    setup();
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(REGISTROS_SHEET_NAME);
    const vansById = getVanMap_(ss);
    const operatorsByCode = getOperatorMap_(ss);

    const action = clean_(payload.action);
    const eventId = clean_(payload.eventId) || Utilities.getUuid();
    const vanId = normalizeId_(payload.vanId);
    const operatorCode = normalizeCode_(payload.operatorCode);

    if (isDuplicateEvent_(sheet, eventId)) {
      return { ok: true, duplicate: true, status: getStatus_(vanId) };
    }

    if (action !== "pickup" && action !== "return") {
      throw new Error("Accion no valida");
    }

    if (!vanId || !vansById[vanId]) {
      throw new Error("Vehiculo no encontrado en la pestaña Furgonetas");
    }

    if (!operatorCode || !operatorsByCode[operatorCode]) {
      throw new Error("Codigo de operario no encontrado en la pestaña Operarios");
    }

    const openRow = findOpenRow_(sheet, vanId);
    if (action === "pickup") {
      if (openRow) {
        throw new Error("Este vehiculo ya esta En curso. Primero hay que devolverlo.");
      }
      appendPickup_(sheet, eventId, vansById[vanId], operatorsByCode[operatorCode], payload);
    } else {
      if (!openRow) {
        throw new Error("No hay ningun registro En curso para este vehiculo.");
      }
      closeMovement_(sheet, openRow.rowNumber, operatorsByCode[operatorCode], payload);
    }

    return { ok: true, eventId: eventId, status: getStatus_(vanId) };
  } finally {
    lock.releaseLock();
  }
}

function appendPickup_(sheet, eventId, van, operator, payload) {
  const now = new Date();
  sheet.appendRow([
    eventId,
    "En curso",
    now,
    formatTime_(now),
    "",
    "",
    van.id,
    van.plate,
    van.description,
    operator.code,
    operator.fullName,
    "",
    "",
    clean_(payload.odometer),
    "",
    clean_(payload.notes),
    "",
    clean_(payload.clientTimestamp),
    "",
    clean_(payload.pageUrl),
    clean_(payload.userAgent),
    ""
  ]);
}

function closeMovement_(sheet, rowNumber, operator, payload) {
  const now = new Date();
  sheet.getRange(rowNumber, 2).setValue("Devuelto");
  sheet.getRange(rowNumber, 5).setValue(now);
  sheet.getRange(rowNumber, 6).setValue(formatTime_(now));
  sheet.getRange(rowNumber, 12).setValue(operator.code);
  sheet.getRange(rowNumber, 13).setValue(operator.fullName);
  sheet.getRange(rowNumber, 15).setValue(clean_(payload.odometer));
  sheet.getRange(rowNumber, 17).setValue(clean_(payload.notes));
  sheet.getRange(rowNumber, 19).setValue(clean_(payload.clientTimestamp));
  sheet.getRange(rowNumber, 22).setValue(clean_(payload.userAgent));
}

function getStatus_(vanId) {
  setup();
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(REGISTROS_SHEET_NAME);
  const targetVan = normalizeId_(vanId);

  if (!targetVan) {
    throw new Error("Falta vehiculo");
  }

  const lastRecord = findLastRecord_(sheet, targetVan);
  const openRecord = findOpenRow_(sheet, targetVan);
  return {
    ok: true,
    vanId: targetVan,
    state: openRecord ? "in_course" : "available",
    openRecord: openRecord ? openRecord.record : null,
    lastRecord: lastRecord ? lastRecord.record : null
  };
}

function findOpenRow_(sheet, vanId) {
  const rows = readRegistroRows_(sheet);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const record = rowToRecord_(rows[index]);
    if (normalizeId_(record.vanId) === vanId && record.estado === "En curso") {
      return { rowNumber: index + 2, record: record };
    }
  }
  return null;
}

function findLastRecord_(sheet, vanId) {
  const rows = readRegistroRows_(sheet);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const record = rowToRecord_(rows[index]);
    if (normalizeId_(record.vanId) === vanId) {
      return { rowNumber: index + 2, record: record };
    }
  }
  return null;
}

function rowToRecord_(row) {
  const estado = clean_(row[1]);
  const pickupDate = row[2];
  const returnDate = row[4];
  return {
    registroId: row[0],
    estado: estado,
    fechaRecogida: toIso_(pickupDate),
    horaRecogida: row[3],
    fechaDevolucion: toIso_(returnDate),
    horaDevolucion: row[5],
    vanId: row[6],
    plate: row[7],
    description: row[8],
    operatorCode: row[9],
    operatorFullName: row[10],
    returnOperatorCode: row[11],
    returnOperatorFullName: row[12],
    odometerPickup: row[13],
    odometerReturn: row[14],
    notesPickup: row[15],
    notesReturn: row[16],
    updatedAt: estado === "En curso" ? toIso_(pickupDate) : toIso_(returnDate)
  };
}

function readRegistroRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  return sheet.getRange(2, 1, lastRow - 1, REGISTROS_HEADERS.length).getValues();
}

function listVans_() {
  setup();
  const vansById = getVanMap_(getSpreadsheet_());
  return Object.keys(vansById).map(function (id) {
    return vansById[id];
  });
}

function listOperators_() {
  setup();
  const operatorsByCode = getOperatorMap_(getSpreadsheet_());
  return Object.keys(operatorsByCode).map(function (code) {
    return operatorsByCode[code];
  });
}

function getVanMap_(ss) {
  const sheet = ss.getSheetByName(VANS_SHEET_NAME);
  const map = {};
  if (!sheet || sheet.getLastRow() < 2) {
    return map;
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, VANS_HEADERS.length).getValues();
  values.forEach(function (row) {
    const id = normalizeId_(row[0]);
    if (!id) {
      return;
    }
    map[id] = {
      id: id,
      plate: clean_(row[1]),
      description: clean_(row[2]),
      inSituation: clean_(row[3]),
      places: clean_(row[4]),
      assignedName: clean_(row[5]),
      assignedSurname: clean_(row[6]),
      assignedTo: [clean_(row[5]), clean_(row[6])].filter(String).join(" "),
      rack: clean_(row[7])
    };
  });
  return map;
}

function getOperatorMap_(ss) {
  const sheet = ss.getSheetByName(OPERATORS_SHEET_NAME);
  const map = {};
  if (!sheet || sheet.getLastRow() < 2) {
    return map;
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, OPERATORS_HEADERS.length).getValues();
  values.forEach(function (row) {
    const code = normalizeCode_(row[0]);
    const name = clean_(row[1]);
    const surname = clean_(row[2]);
    const fullName = clean_(row[3]) || [name, surname].filter(String).join(" ");
    if (!code || !fullName) {
      return;
    }
    map[code] = {
      code: code,
      name: name,
      surname: surname,
      fullName: fullName
    };
  });
  return map;
}

function fillDefaultVansIfEmpty_(sheet) {
  if (sheet.getLastRow() > 1 || typeof DEFAULT_VANS === "undefined") {
    return;
  }

  const rows = DEFAULT_VANS.map(function (van) {
    return [
      van.id,
      van.plate,
      van.description,
      van.inSituation,
      van.places,
      van.assignedName,
      van.assignedSurname,
      van.rack
    ];
  });
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, VANS_HEADERS.length).setValues(rows);
  }
}

function fillDefaultOperatorsIfEmpty_(sheet) {
  if (sheet.getLastRow() > 1 || typeof DEFAULT_OPERATORS === "undefined") {
    return;
  }

  const rows = DEFAULT_OPERATORS.map(function (operator) {
    return [
      operator.code,
      operator.name,
      operator.surname,
      operator.fullName
    ];
  });
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, OPERATORS_HEADERS.length).setValues(rows);
  }
}

function applyRegistrosValidation_(sheet) {
  const validation = SpreadsheetApp.newDataValidation()
    .requireValueInList(["En curso", "Devuelto"], true)
    .build();
  sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(validation);
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

function isDuplicateEvent_(sheet, eventId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || !eventId) {
    return false;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  return values.some(function (row) {
    return clean_(row[0]) === eventId;
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

function formatTime_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "HH:mm:ss");
}

function toIso_(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return clean_(value);
}

function normalizeId_(value) {
  return clean_(value).toUpperCase();
}

function normalizeCode_(value) {
  const digits = clean_(value).replace(/\D/g, "");
  return digits ? digits.slice(0, 3).padStart(3, "0") : "";
}

function clean_(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}
