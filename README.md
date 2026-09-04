# DevGrullon Labs

Landing page de **DevGrullon Labs**, un servicio de desarrollo web profesional que ofrece páginas web a medida desde Q500. El sitio está pensado para captar clientes: presenta la oferta, sus beneficios y un flujo de contacto directo por WhatsApp.

## Estructura del proyecto

```
devgrullon_labs/
├── firebase.json          # Config de Firebase Hosting, Functions y Firestore
├── .firebaserc            # Proyecto de Firebase asociado (con target de Hosting)
├── firestore.rules        # Reglas de seguridad de Firestore (acceso solo desde el backend)
├── functions/              # Cloud Function que conecta el chat con la API de Claude
│   ├── index.js            # Función callable `chatWithAssistant`
│   ├── chatLogic.js         # Validación de mensajes y tope de costo por sesión
│   ├── systemPrompt.js      # Instrucciones del asistente (la oferta real del sitio)
│   ├── anthropicClient.js   # Construcción del request a Claude y parseo de la respuesta
│   ├── firestoreLog.js      # Guardado de cada conversación en Firestore
│   └── orchestrator.js      # Une todo lo anterior
└── public/                # Todo lo que se publica con `firebase deploy`
    ├── index.html          # Estructura y contenido del sitio (hero, oferta, secciones, formulario)
    ├── index.css           # Estilos del sitio
    ├── index.js            # Interactividad: animación del hero, formulario de contacto
    ├── firebase-init.js    # Inicializa Firebase (Analytics, App Check, Functions)
    ├── chat-widget.js       # El widget de chat con el asistente de IA
    └── assets/             # Imágenes (logo, portada)
```

> Importante: edita siempre los archivos dentro de `public/`. Firebase Hosting despliega esa carpeta tal cual (`"public": "public"` en `firebase.json`); cualquier cambio fuera de ella no se verá reflejado en el sitio publicado.

## Contenido del sitio

- **Hero**: mensaje principal, llamado a la acción hacia WhatsApp y enlace al portafolio avanzado, con una animación de fondo en `<canvas>` (red de nodos conectados).
- **Oferta**: qué incluye el paquete de Q500 (diseño responsive, estructura de secciones, etc.).
- **Formulario de contacto**: envía los datos capturados como un mensaje pre-armado a WhatsApp (no usa backend ni almacenamiento).
- **Asistente de chat con IA**: botón flotante que abre una conversación real con un asistente basado en Claude, que responde preguntas sobre la oferta del sitio y, cuando conviene, ofrece un botón para continuar la conversación por WhatsApp directamente con Jorge. Cada conversación se guarda en Firestore.

## Tecnologías

Sitio estático hecho con HTML, CSS y JavaScript puro (sin frameworks ni dependencias de build).

## Cómo ejecutarlo localmente

No requiere instalación. Basta con abrir `public/index.html` en un navegador, o servirlo con cualquier servidor estático, por ejemplo:

```bash
npx serve public
```

También puedes previsualizarlo exactamente como lo serviría Firebase Hosting con:

```bash
firebase serve --only hosting
```

## Antes de desplegar

El chat con IA necesita configuración adicional que no viene en el repo (por seguridad):

1. Crear una API key en [console.anthropic.com](https://console.anthropic.com) y guardarla como secreto: `firebase functions:secrets:set ANTHROPIC_API_KEY`.
2. Registrar un proveedor reCAPTCHA v3 en Firebase Console → App Check, y pegar ese site key en `public/firebase-init.js` (reemplazando `RECAPTCHA_SITE_KEY`).
3. Confirmar que la base de datos de Firestore existe en el proyecto de Firebase.
4. Desplegar con `firebase deploy --only functions,firestore:rules,hosting:devgrullonlabs`.

Detalle completo de estos pasos, incluyendo advertencias sobre no afectar otras apps que compartan el mismo proyecto de Firebase, en `docs/superpowers/plans/2026-09-03-ai-chat-assistant.md` (sección final).

## Contacto

El sitio dirige todo el contacto al WhatsApp del negocio (número configurado en `index.js`).
