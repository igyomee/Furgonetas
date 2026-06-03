# Registro de furgonetas con QR, GitHub Pages y Google Sheets

Esta carpeta contiene una web estatica para GitHub Pages y un backend de Google Apps Script que guarda cada movimiento en una hoja de calculo.

## Que registra

- Furgoneta
- Accion: `pickup` para recoger, `return` para devolver
- Nombre del conductor
- Kilometros opcionales
- Notas opcionales
- Hora del servidor de Google
- Hora del dispositivo
- URL y navegador desde donde se envio

## 1. Crear la hoja de Google Sheets

1. Crea una hoja de calculo en Google Sheets.
2. Abre `Extensiones` -> `Apps Script`.
3. Borra el contenido inicial y pega el archivo `google-apps-script/Code.gs`.
4. Si el script no esta vinculado a la hoja, rellena `SPREADSHEET_ID` con el ID de la hoja.
5. Ejecuta la funcion `setup` una vez y acepta los permisos.

La funcion `setup` crea dos pestañas:

- `Registros`: donde se guardan los movimientos.
- `Furgonetas`: listado de furgonetas activas.

Actualiza en `Furgonetas` los IDs, nombres y matriculas reales. El campo `active` debe estar en `TRUE` o `SI`.

## 2. Publicar Apps Script

1. En Apps Script, pulsa `Implementar` -> `Nueva implementacion`.
2. Tipo: `Aplicacion web`.
3. Ejecutar como: `Yo`.
4. Quien tiene acceso: `Cualquier usuario` para que GitHub Pages pueda enviar registros.
5. Copia la URL que termina en `/exec`.

Pega esa URL en `config.js`, dentro de `appsScriptUrl`.

## 3. Configurar las furgonetas de la web

Edita `config.js`:

```js
window.FLEET_CONFIG = {
  companyName: "Nombre de la empresa",
  appsScriptUrl: "https://script.google.com/macros/s/XXXXX/exec",
  publicToken: "",
  vans: [
    { id: "furgo-01", label: "Furgoneta taller", plate: "1234 ABC" }
  ]
};
```

Usa el mismo `id` en `config.js` y en la pestaña `Furgonetas` de Google Sheets.

## 4. Subir a GitHub Pages

1. Crea un repositorio en GitHub.
2. Sube estos archivos a la raiz del repositorio.
3. En GitHub, ve a `Settings` -> `Pages`.
4. Source: rama `main`, carpeta `/root`.
5. Guarda y espera a que GitHub genere la URL publica.

## 5. Generar los QR

Cuando GitHub Pages este publicado, abre:

```text
https://TU-USUARIO.github.io/TU-REPO/qr.html
```

Pega la URL publica del sitio si no aparece sola, pulsa `Actualizar` e imprime las tarjetas. Cada QR apunta a:

```text
https://TU-USUARIO.github.io/TU-REPO/index.html?van=furgo-01
```

## Privacidad y seguridad

Este montaje es sencillo y practico para uso interno, pero si publicas la web como GitHub Pages cualquier persona con la URL podria abrirla. Apps Script solo escribe en la hoja, no expone la hoja completa, pero conviene:

- No mostrar datos personales en los QR.
- Usar IDs de furgoneta que no sean datos sensibles.
- Compartir la hoja solo con administradores.
- Revisar periodicamente la pestaña `Registros`.
- Cambiar `PUBLIC_TOKEN` en Apps Script y `publicToken` en `config.js` si quieres una barrera basica contra envios accidentales.

El token publicado en GitHub Pages no es una seguridad fuerte, pero ayuda a filtrar trafico que no venga de esta app.
