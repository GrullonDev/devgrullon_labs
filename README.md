# DevGrullon Labs

Landing page de **DevGrullon Labs**, un servicio de desarrollo web profesional que ofrece páginas web a medida desde Q500. El sitio está pensado para captar clientes: presenta la oferta, sus beneficios y un flujo de contacto directo por WhatsApp.

## Estructura del proyecto

```
devgrullon_labs/
├── firebase.json      # Config de Firebase Hosting (sirve la carpeta public/)
├── .firebaserc        # Proyecto de Firebase asociado
└── public/            # Todo lo que se publica con `firebase deploy`
    ├── index.html     # Estructura y contenido del sitio (hero, oferta, secciones, formulario)
    ├── index.css      # Estilos del sitio
    ├── index.js       # Interactividad: animación del hero, mini-chat de WhatsApp, formulario de contacto
    └── assets/        # Imágenes (logo, portada)
```

> Importante: edita siempre los archivos dentro de `public/`. Firebase Hosting despliega esa carpeta tal cual (`"public": "public"` en `firebase.json`); cualquier cambio fuera de ella no se verá reflejado en el sitio publicado.

## Contenido del sitio

- **Hero**: mensaje principal, llamado a la acción hacia WhatsApp y enlace al portafolio avanzado, con una animación de fondo en `<canvas>` (red de nodos conectados).
- **Oferta**: qué incluye el paquete de Q500 (diseño responsive, estructura de secciones, etc.).
- **Formulario de contacto**: envía los datos capturados como un mensaje pre-armado a WhatsApp (no usa backend ni almacenamiento).
- **Mini-chat de WhatsApp**: botón flotante que abre una ventana de chat integrada; los mensajes enviados abren WhatsApp con el texto ya redactado.

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

## Contacto

El sitio dirige todo el contacto al WhatsApp del negocio (número configurado en `index.js`).
