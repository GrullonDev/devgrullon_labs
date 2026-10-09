# AGENTS.md

Instrucciones para agentes que trabajan en este repositorio. Consultar README y configuración para el detalle; este archivo no autoriza publicación ni cambios fuera de la tarea.

## Propósito del proyecto

Landing comercial de servicios web con contacto por WhatsApp y chat de IA conectado a DeepSeek; conversaciones se guardan en Firestore. Formulario de contacto prepara mensaje, no envía correo ni guarda leads por sí mismo.

## Stack y plataformas

HTML/CSS/JavaScript sin framework/build frontend. Cloud Functions CommonJS con Node 20, firebase-admin ^12.6.0 y firebase-functions ^6.0.1; Firebase cliente y pruebas de reglas en package.json raíz.

Node 20 está declarado en `functions/package.json` y CI. Consultar versiones/rangos en los package.json y locks.

## Estructura del repositorio

Editar interfaz en `public/index.html`, `index.css`, `index.js`, `firebase-init.js`, `chat-widget.js` y `public/assets/`: Hosting publica public. Backend en `functions/`: index registra callable, chatLogic valida/límites, deepseekClient conecta IA, orchestrator coordina, firestoreLog persiste y systemPrompt contiene oferta. Tests en `functions/test/` y `test/`.

## Preparación y comandos

Frontend: `npx serve public` (README; requiere Node/npm y acceso a paquete) o `firebase serve --only hosting` (Firebase CLI). Backend: en `functions/`, `npm ci`, `npm test`. No hay build frontend. Emuladores configurados: `firebase emulators:start --only functions,firestore` requiere configuración/secreto local del servicio; no ejecutarlo contra producción.

## Arquitectura y convenciones

Mantener frontend estático y módulos CommonJS del backend. No colocar lógica privilegiada o API key en navegador. Conservar validación de mensajes, límite por sesión y respuestas estructuradas/handoff. `callClaude` es nombre heredado de callback; proveedor actual es DeepSeek. Fallo de Firestore logging no debe bloquear respuesta del chat.

Conservar nombres JavaScript existentes, lowerCamelCase para funciones/variables y módulos CommonJS en functions. Mantener selectores/clases y organización CSS del frontend; no renombrar contratos JSON, campos Firestore ni exports de Functions incidentalmente.

## Experiencia de usuario

Preservar tono/oferta de landing y sincronizar systemPrompt al cambiar condiciones comerciales. Chat requiere carga, prevención de envíos duplicados, error con contacto alternativo y límite explícito. Verificar teclado, foco, móvil, contraste y canvas con movimiento reducido. WhatsApp requiere acción consciente del visitante.

En el flujo afectado, contemplar carga, vacío, éxito y error; dar feedback claro, conservar entradas/datos ante fallos y permitir recuperación. Reutilizar componentes visuales; revisar semántica, foco, contraste y escalado de texto.

## Seguridad y datos

No incluir secretos, credenciales ni datos personales en código, documentación o logs. Usar configuración de entorno existente, validar entradas y manejar fallos de servicios. Respetar autenticación, autorización y permisos. No ejecutar operaciones destructivas sobre datos sin autorización explícita.

DEEPSEEK_API_KEY se obtiene con defineSecret, jamás desde public. Mantener enforceAppCheck y validación de sessionId/mensajes. Firestore rules restringe acceso cliente a chat_leads; no abrir colección para arreglar UI. Historial y resúmenes contienen datos de personas: evitar logging de contenido y acceso indiscriminado. Firebase proyecto compartido: no desplegar otros targets incidentalmente.

## Pruebas y validación

Desde functions: `npm ci` y `npm test` (node --test test/*.test.js). Para reglas instalar dependencias raíz con `npm install` y ejecutar `firebase emulators:exec --only firestore "node --test test/firestore.rules.test.js"` con Firebase CLI/Java disponibles. Comprobar validación/límite, respuesta IA inválida, fallo remoto, fallo de persistencia y handoff; no consumir API real en pruebas unitarias.

Ejecutar análisis y pruebas relevantes según el cambio; compilar solo plataformas afectadas. Un cambio exclusivamente documental requiere revisar rutas, comandos, alcance y diff, sin pruebas artificiales que repliquen el texto. No afirmar que una prueba pasó si no se ejecutó.

## Flujo de trabajo del agente

Leer instrucciones aplicables antes de modificar archivos, incluidas las de subdirectorios: su alcance local se respeta. Las instrucciones explícitas del usuario prevalecen.

1. Revisar estado del trabajo y comprender el flujo afectado antes de implementar.
2. Hacer cambios acotados al objetivo; respetar cambios existentes del usuario y evitar refactorizaciones ajenas.
3. Reutilizar componentes y dependencias disponibles; justificar dependencias nuevas.
4. Actualizar documentación si cambia comportamiento o configuración.
5. Ejecutar verificaciones pertinentes y comunicar resultados y pendientes con su motivo.
6. No hacer commits, push o despliegues salvo solicitud o autorización previa del usuario. Esta regla prevalece sobre recomendaciones de commit automático en guías antiguas.

No imponer una política nueva de ramas/commits; seguir documentación y CI existentes.

No activar workflows de publicación ni scripts de release como comprobación rutinaria.

## Criterios de finalización

La tarea cumple el comportamiento solicitado, contempla errores/estados relevantes, mantiene convenciones y pasa las verificaciones aplicables que puedan ejecutarse. Comunicar archivos modificados, resultados reales y cualquier validación pendiente con su motivo.

## Limitaciones y aspectos por confirmar

No hay scripts de lint, formato ni build frontend declarados. Chat requiere secreto servidor, App Check y Firestore configurados fuera de git. Workflow despliega al push main y no ejecuta tests: usar rama de documentación sin publicación accidental.

Los comandos se verificaron por lectura de package.json/README/firebase.json; no fueron ejecutados durante esta documentación.
