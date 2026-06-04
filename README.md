# Registro de vehiculos con QR, GitHub Pages y Google Sheets

Esta carpeta contiene la web estatica para GitHub Pages y el backend de Google Apps Script que guarda los usos en Google Sheets.

Ya esta cargado el contenido de:

- `Furgonetas.xlsx`: 62 vehiculos en `fleet-data.js` y `google-apps-script/Data.gs`.
- `Copia de dnis_con_codigos_operario.xlsx`: operarios, DNI y codigos en `fleet-data.js` y `google-apps-script/Data.gs`.

## Como funciona

Cada QR apunta a la web con el codigo del vehiculo:

```text
https://TU-USUARIO.github.io/TU-REPO/index.html?van=V000000037
```

La web abre directamente ese vehiculo. El operario escribe su nombre y la app autocompleta el codigo si esa persona lo tiene. Si la persona no tiene codigo, se puede guardar con nombre y DNI. El DNI funciona como contraseña: si no coincide con el DNI del Excel, no se puede guardar.

El Google Sheet guarda una fila por cada uso:

- Al pulsar `En curso`, crea una fila con estado `En curso`, fecha y hora de recogida.
- Al pulsar `Devolver`, busca la fila abierta de ese vehiculo y la actualiza a `Devuelto`, con fecha y hora de devolucion.
- Si cierran la web y vuelven dias despues, el estado sigue saliendo `En curso` porque se lee desde Google Sheets.
- Nombre y DNI firma son obligatorios antes de guardar.
- El codigo es obligatorio solo para las personas que lo tienen asignado en el Excel.

## 1. Preparar Google Sheets

Puedes usar tu Google Sheet basado en `Furgonetas.xlsx` o crear uno nuevo.

La funcion `setup` deja estas pestanas:

- `Furgonetas`: columnas `codigo`, `matricula`, `descripcion`, `ensituacion`, `plazas`, `nombre`, `apellidos`, `baca`.
- `Operarios`: columnas `codigo`, `nombre`, `apellidos`, `nombre_completo`, `dni`.
- `Registros`: movimientos de recogida/devolucion.

Si `Furgonetas` esta vacia, `setup` la rellena con los vehiculos. La pestaña `Operarios` se actualiza con los datos del Excel de DNIs cada vez que ejecutes `setup`.

## 2. Pegar Apps Script

1. Abre el Google Sheet.
2. Ve a `Extensiones` -> `Apps Script`.
3. En el archivo principal pega `google-apps-script/Code.gs`.
4. Crea otro archivo de script llamado `Data.gs`.
5. Pega dentro `google-apps-script/Data.gs`.
6. Ejecuta la funcion `setup` una vez y acepta permisos.

Si el Apps Script no esta vinculado al Sheet, rellena `SPREADSHEET_ID` en `Code.gs`.

## 3. Publicar Apps Script

1. Pulsa `Implementar` -> `Nueva implementacion`.
2. Tipo: `Aplicacion web`.
3. Ejecutar como: `Yo`.
4. Quien tiene acceso: `Cualquier usuario`.
5. Copia la URL terminada en `/exec`.

Esa URL ya esta puesta en `config.js`:

```text
https://script.google.com/macros/s/AKfycbwCh4CzM99AwciUCWF2UvghSPgnCsasWJi2uxLrZJX91xNx1tZDBWL8fINZpcaccJuPDg/exec
```

## 4. Subir a GitHub

1. Crea un repositorio en GitHub.
2. Sube el contenido de esta carpeta a la raiz del repo.
3. En GitHub, entra en `Settings` -> `Pages`.
4. Source: `Deploy from a branch`.
5. Branch: `main`.
6. Folder: `/root`.

En la raiz del repo deben verse directamente:

- `index.html`
- `app.js`
- `styles.css`
- `config.js`
- `fleet-data.js`
- `qr.html`

## 5. Imprimir los QR

Cuando GitHub Pages este publicado, abre:

```text
https://TU-USUARIO.github.io/TU-REPO/qr.html
```

Comprueba que la URL publica del sitio aparece en el campo superior, pulsa `Actualizar` e imprime. La pagina genera un QR por cada vehiculo de `Furgonetas.xlsx`.

## Prueba minima

1. Escanea o abre un QR.
2. Escribe el nombre del operario y comprueba que se autocompleta el codigo si lo tiene.
3. Rellena el DNI firma correcto.
4. Pulsa `En curso` y `Guardar registro`.
5. Comprueba que aparece una fila `En curso` en `Registros`.
6. Vuelve a abrir el mismo QR: debe seguir saliendo `En curso`.
7. Pulsa `Devolver` y guarda: la misma fila debe pasar a `Devuelto`.

## Privacidad

GitHub Pages suele ser publico. Esta version incluye vehiculos, nombres y codigos de operarios en `fleet-data.js` para que el autocompletado funcione rapido. Para uso interno real conviene valorar un repo privado con Pages privado, o mover la carga de operarios solo a Apps Script.
