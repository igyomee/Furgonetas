(function () {
  const config = window.FLEET_CONFIG || {};
  const vans = Array.isArray(config.vans) ? config.vans : [];
  const operators = Array.isArray(config.operators) ? config.operators : [];
  const state = {
    action: "pickup",
    currentVan: null,
    currentStatus: null
  };

  const els = {
    vehicleTitle: document.getElementById("vehicleTitle"),
    vehiclePlate: document.getElementById("vehiclePlate"),
    statusBadge: document.getElementById("statusBadge"),
    vanSelect: document.getElementById("vanSelect"),
    usageForm: document.getElementById("usageForm"),
    driverCode: document.getElementById("driverCode"),
    driverName: document.getElementById("driverName"),
    driverDni: document.getElementById("driverDni"),
    operatorCodeList: document.getElementById("operatorCodeList"),
    operatorNameList: document.getElementById("operatorNameList"),
    odometer: document.getElementById("odometer"),
    notes: document.getElementById("notes"),
    submitButton: document.getElementById("submitButton"),
    clockText: document.getElementById("clockText"),
    lastMovement: document.getElementById("lastMovement"),
    openMovement: document.getElementById("openMovement"),
    messageBox: document.getElementById("messageBox"),
    toggleButtons: Array.from(document.querySelectorAll(".toggle-button"))
  };

  function init() {
    renderVanOptions();
    renderOperatorOptions();
    clearEntryFields();
    bindEvents();
    hydrateFromQuery();
    tickClock();
    setInterval(tickClock, 1000);
    renderIcons();
  }

  function renderVanOptions() {
    els.vanSelect.innerHTML = "";

    if (!vans.length) {
      const option = document.createElement("option");
      option.textContent = "Configura los vehiculos";
      option.value = "";
      els.vanSelect.appendChild(option);
      els.vanSelect.disabled = true;
      return;
    }

    vans.forEach((van) => {
      const option = document.createElement("option");
      option.value = van.id;
      option.textContent = `${van.plate || van.id} - ${van.description || van.id}`;
      els.vanSelect.appendChild(option);
    });
  }

  function renderOperatorOptions() {
    els.operatorCodeList.innerHTML = "";
    els.operatorNameList.innerHTML = "";

    operators.forEach((operator) => {
      const codeOption = document.createElement("option");
      codeOption.value = operator.code;
      codeOption.label = operator.fullName;
      els.operatorCodeList.appendChild(codeOption);

      const nameOption = document.createElement("option");
      nameOption.value = operator.fullName;
      nameOption.label = operator.code;
      els.operatorNameList.appendChild(nameOption);
    });
  }

  function bindEvents() {
    els.vanSelect.addEventListener("change", () => {
      setCurrentVan(els.vanSelect.value, true);
    });

    els.toggleButtons.forEach((button) => {
      button.addEventListener("click", () => setAction(button.dataset.action));
    });

    els.driverCode.addEventListener("input", handleCodeInput);
    els.driverName.addEventListener("input", handleNameInput);
    els.driverDni.addEventListener("input", handleDniInput);
    els.usageForm.addEventListener("submit", handleSubmit);
  }

  function hydrateFromQuery() {
    const query = new URLSearchParams(window.location.search);
    const vanId = query.get("van") || query.get("furgo") || query.get("matricula");
    const fallback = vans[0] ? vans[0].id : "";
    setCurrentVan(vanId || fallback, false);
  }

  function clearEntryFields() {
    els.driverCode.value = "";
    els.driverName.value = "";
    els.driverDni.value = "";
    els.odometer.value = "";
    els.notes.value = "";
  }

  function setCurrentVan(vanId, updateUrl) {
    const normalized = normalize(vanId);
    const van = vans.find((item) => {
      return normalize(item.id) === normalized || normalize(item.plate) === normalized;
    });
    state.currentVan = van || null;
    state.currentStatus = null;

    if (van) {
      els.vanSelect.value = van.id;
      els.vehicleTitle.textContent = van.plate || van.id;
      els.vehiclePlate.textContent = `${van.description || "Sin descripcion"} - ${van.id}`;
      els.usageForm.classList.remove("is-disabled");
      els.openMovement.textContent = "Consultando estado...";
      setMessage("", "");
      loadStatus(van.id);
    } else {
      els.vehicleTitle.textContent = "Vehiculo no encontrado";
      els.vehiclePlate.textContent = vanId ? `Codigo recibido: ${vanId}` : "Sin codigo";
      els.usageForm.classList.add("is-disabled");
      setStatus("muted", "Sin estado");
      els.lastMovement.textContent = "Revisa el codigo QR o fleet-data.js";
      els.openMovement.textContent = "Ninguno";
    }

    if (updateUrl && van) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("van", van.id);
      window.history.replaceState({}, "", nextUrl);
    }
  }

  function setAction(action) {
    state.action = action === "return" ? "return" : "pickup";
    els.toggleButtons.forEach((button) => {
      const active = button.dataset.action === state.action;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function handleCodeInput() {
    const code = normalizeCodeInput(els.driverCode.value);
    els.driverCode.value = code;

    const operator = code.length >= 2 ? findOperatorByCode(code) : null;
    if (operator) {
      els.driverName.value = operator.fullName;
    }
  }

  function handleNameInput() {
    const value = els.driverName.value.trim();

    const exact = findOperatorByName(value);
    if (exact) {
      els.driverCode.value = exact.code;
      return;
    }

    if (value.length >= 4) {
      const matches = operators.filter((operator) => normalize(operator.fullName).startsWith(normalize(value)));
      if (matches.length === 1) {
        els.driverCode.value = matches[0].code;
      }
    }
  }

  function handleDniInput() {
    els.driverDni.value = normalizeDni(els.driverDni.value);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!state.currentVan) {
      setMessage("error", "Selecciona un vehiculo valido.");
      return;
    }

    if (!config.appsScriptUrl) {
      setMessage("error", "Falta pegar la URL de Apps Script en config.js.");
      return;
    }

    const operator = findOperatorByCode(els.driverCode.value);
    if (!operator) {
      setMessage("error", "El codigo de operario debe existir en la lista del Word.");
      els.driverCode.focus();
      return;
    }

    if (!els.driverName.value.trim()) {
      setMessage("error", "El nombre del operario es obligatorio.");
      els.driverName.focus();
      return;
    }

    if (!els.driverDni.value.trim()) {
      setMessage("error", "El DNI firma es obligatorio.");
      els.driverDni.focus();
      return;
    }

    const payload = {
      eventId: makeEventId(),
      token: config.publicToken || "",
      action: state.action,
      vanId: state.currentVan.id,
      vanPlate: state.currentVan.plate || "",
      vanDescription: state.currentVan.description || "",
      operatorCode: operator.code,
      operatorName: operator.name || "",
      operatorSurname: operator.surname || "",
      operatorFullName: operator.fullName || els.driverName.value.trim(),
      operatorDni: normalizeDni(els.driverDni.value),
      odometer: els.odometer.value.trim(),
      notes: els.notes.value.trim(),
      clientTimestamp: new Date().toISOString(),
      pageUrl: window.location.href,
      userAgent: navigator.userAgent
    };

    setBusy(true);
    setMessage("info", "Guardando registro...");

    try {
      const response = await callAppsScript("submit", { payload: JSON.stringify(payload) }, 10000);
      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : "No se pudo guardar");
      }

      els.notes.value = "";
      setMessage("success", state.action === "pickup" ? "Vehiculo marcado En curso." : "Vehiculo devuelto.");
      renderStatus(response.status || response);
      window.setTimeout(() => loadStatus(state.currentVan.id), 800);
    } catch (error) {
      setMessage("error", error.message || "No se pudo enviar el registro.");
    } finally {
      setBusy(false);
    }
  }

  async function loadStatus(vanId) {
    setStatus("muted", "Sincronizando");

    if (!config.appsScriptUrl) {
      els.lastMovement.textContent = "Pendiente de configurar Apps Script";
      els.openMovement.textContent = "Ninguno";
      return;
    }

    try {
      const response = await callAppsScript("status", { van: vanId }, 8000);
      renderStatus(response);
    } catch (error) {
      setStatus("muted", "Sin estado");
      els.lastMovement.textContent = "No se pudo leer el estado";
      els.openMovement.textContent = "Ninguno";
    }
  }

  function renderStatus(response) {
    state.currentStatus = response || null;

    if (!response || !response.ok) {
      setStatus("muted", "Sin estado");
      els.lastMovement.textContent = response && response.error ? response.error : "Sin datos";
      els.openMovement.textContent = "Ninguno";
      return;
    }

    if (!response.lastRecord) {
      setStatus("available", "Disponible");
      els.lastMovement.textContent = "Todavia no hay movimientos";
      els.openMovement.textContent = "Ninguno";
      setAction("pickup");
      return;
    }

    const last = response.lastRecord;
    const isOpen = response.state === "in_course";
    setStatus(isOpen ? "busy" : "available", isOpen ? "En curso" : "Disponible");
    els.lastMovement.textContent = `${last.estado || "Movimiento"} - ${formatDateTime(last.updatedAt || last.fechaRecogida)}`;

    if (isOpen && response.openRecord) {
      const open = response.openRecord;
      els.openMovement.textContent = `${open.operatorFullName || open.operatorCode || "Operario"} desde ${formatDateTime(open.fechaRecogida)}`;
      setAction("return");
    } else {
      els.openMovement.textContent = "Ninguno";
      setAction("pickup");
    }
  }

  function callAppsScript(route, params, timeoutMs) {
    return new Promise((resolve, reject) => {
      const callbackName = `fleet_${route}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      const script = document.createElement("script");
      const url = new URL(config.appsScriptUrl);
      url.searchParams.set("route", route);
      url.searchParams.set("callback", callbackName);
      if (config.publicToken) {
        url.searchParams.set("token", config.publicToken);
      }
      Object.entries(params || {}).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });

      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Apps Script no ha respondido."));
      }, timeoutMs || 8000);

      window[callbackName] = (response) => {
        cleanup();
        resolve(response);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("No se pudo conectar con Apps Script."));
      };

      script.src = url.toString();
      document.body.appendChild(script);

      function cleanup() {
        clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
      }
    });
  }

  function findOperatorByCode(code) {
    const normalized = canonicalCode(code);
    return operators.find((operator) => operator.code === normalized);
  }

  function findOperatorByName(name) {
    const normalized = normalize(name);
    return operators.find((operator) => normalize(operator.fullName) === normalized);
  }

  function setStatus(kind, text) {
    els.statusBadge.className = `status-badge ${kind}`;
    els.statusBadge.textContent = text;
  }

  function setMessage(kind, text) {
    els.messageBox.className = `message-box ${kind || ""}`;
    els.messageBox.textContent = text;
  }

  function setBusy(isBusy) {
    els.submitButton.disabled = isBusy;
    els.submitButton.classList.toggle("is-busy", isBusy);
  }

  function tickClock() {
    els.clockText.textContent = new Date().toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatDateTime(value) {
    if (!value) {
      return "hora no disponible";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function makeEventId() {
    if (crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeCodeInput(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 3);
  }

  function canonicalCode(value) {
    const digits = normalizeCodeInput(value);
    return digits ? digits.padStart(3, "0") : "";
  }

  function normalize(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeDni(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  function renderIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  init();
})();
