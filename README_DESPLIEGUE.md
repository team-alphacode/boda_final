# Boda Castillo–Salazar — GitHub + Firebase Hosting

## Composición verificada
- `public/` es el sitio web optimizado, con la última versión de tarjetas/WhatsApp y los ajustes de teclado/landscape.
- `firebase.json` configura Hosting **sin desplegar las reglas ni Firestore**.
- `.firebaserc` indica el proyecto existente `amor-772d4`. **Verifica en Firebase Console que ese es tu proyecto antes de desplegar.**
- `admin/` está publicado como aplicación web, pero los datos se protegen mediante Firebase Auth y reglas de Firestore.

## Requisitos
- Windows + Node.js instalado (`node -v`, `npm -v`).
- Acceso al mismo proyecto Firebase en la cuenta Google.
- Habilitar Hosting en Firebase Console si todavía no está habilitado.
- No incluir contraseñas, archivos `.env`, exportaciones de Firestore ni claves de cuentas de servicio en GitHub.

## PRIMERA PRUEBA: no hacer deploy a live todavía
1. Descomprime esta carpeta; abre una terminal en ella (al mismo nivel que `firebase.json`).
2. `npm install -g firebase-tools`
3. `firebase login`
4. `firebase projects:list` — comprueba que aparece `amor-772d4`.
5. `firebase hosting:channel:deploy pruebas-boda --project amor-772d4 --expires 3d`
6. Abre la URL temporal que te devuelve la consola. **Es pública para cualquiera que conozca el enlace**.

**¡Atención!** Los canales preview usan el BACKEND REAL del proyecto Firebase. Los datos RSVP reales pueden cambiar si confirmas con un token existente. Para probar guardados usa un invitado de prueba explícito o, mejor, un proyecto Firebase separado / emulador.

## DESPUÉS DE COMPROBAR TODO
`firebase deploy --only hosting --project amor-772d4`
Esta acción hace la versión pública definitiva en el canal `live`. No la ejecutes hasta aprobarla.

## GitHub (recomendado, repositorio privado)
1. Crea un repositorio **Private** llamado, por ejemplo, `boda-josue-bertha`.
2. En esta carpeta ejecuta: `git init`, `git add .`, `git commit -m "Preparar boda para Firebase Hosting"`.
3. Sigue las órdenes **exactas que GitHub muestra** para enlazar tu repositorio (`git remote add origin ...`, `git branch -M main`, `git push -u origin main`).
4. No hagas pública la carpeta de pruebas falsa ni subas secretos.

Después se puede automatizar el deploy desde GitHub con `firebase init hosting:github`; ese paso será posterior, cuando hayamos validado la primera publicación manual.

## WhatsApp y token
`admin/admin.js` genera el enlace con el `token` único de la tarjeta. Al administrar desde el dominio HTTPS definitivo, usa el dominio de esa página automáticamente. Si administras en localhost pero deseas compartir enlaces externos, configura `PUBLIC_INVITATION_BASE_URL` con la URL pública validada.
No compartas enlaces con `127.0.0.1`, IP privada ni con el canal preview como tarjeta definitiva.

## HTTPS y Auth
Firebase Hosting usa HTTPS. Una vez desplegado, prueba iniciar sesión en `/admin/`. Si Firebase Authentication mostrara un problema de dominio autorizado, revisa `Authentication > Settings > Authorized domains` y agrega únicamente los dominios usados realmente. No desactives reglas por un error de configuración.

## Costes
La referencia detallada de Hosting describe un cupo Spark de 10 GB de transferencia al mes y 10 GB de almacenamiento; revisa el panel de uso del proyecto: https://firebase.google.com/docs/hosting/usage-quotas-pricing . La banda ancha consume cupo también en canales preview.

## IMPORTANTE
Este paquete **NO ha sido desplegado por ChatGPT**. Solo queda preparado para que tú lo publiques bajo tu cuenta y autorización. No incluye cambios de configuración de seguridad ni transacciones.
