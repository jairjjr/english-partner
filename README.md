# 🎙️ English Partner (AI Voice English Coach)

Entrenador personal de inglés conversacional de 10 minutos por voz con diagnóstico post-sesión de **Gramática**, **Vocabulario** y **Pronunciación**, inspirado en *Loora*, *Praktika* y *Stimuler*. 

Diseñado especialmente para funcionar como **PWA (Web App Progresiva)** alojada en **GitHub Pages** (para usar en tu teléfono y PC) conectada con tu propio **Google Sheets (mediante Google Apps Script)** para sincronización de progreso en la nube y respaldo offline en tu camioneta camino al trabajo.

---

## 🚗 Características Principales

1. **Modo Camioneta (Drive Mode / 100% Manos Libres):**
   - Detección de Actividad de Voz (VAD): Hablas con naturalidad por el Bluetooth de tu camioneta; cuando haces una pausa, el coach te responde sin tocar la pantalla.
   - Botones táctiles gigantes de alto contraste para cero distracciones al volante.
   - Resumen hablado automático de 60 segundos por audio al concluir la sesión mientras sigues manejando.
   - `Screen Wake Lock`: Impide que la pantalla de tu teléfono se apague durante el trayecto.
2. **Sesiones Cronometradas de 10 Minutos con Despedida Coordinada:**
   - Temporizador de 10:00 a 00:00.
   - **Regla del Minuto 8:00 (Aviso de 2 Minutos):** Al llegar a 2 minutos restantes, tanto tú como el modelo de voz reciben la directiva de sistema para comenzar a concluir el tema del escenario y despedirse orgánicamente.
3. **Evaluación Inicial (Placement Test Diagnóstico):**
   - Charla diagnóstica adaptativa de 7 a 10 minutos con *Emma* para ubicar tu nivel CEFR real (A2, B1, B2 o C1) antes de empezar el catálogo.
4. **Catálogo de Lecciones Progresivas:**
   - ☕ **Charla Relajada:** Fin de semana, anécdotas, viajes, tecnología y cultura.
   - 💼 **Lenguaje de Negocios:** Stand-ups diarios, negociación de plazos, presupuesto y ROI.
   - 🤝 **Citas con Clientes:** Llamadas de descubrimiento, presentación de valor y manejo de objeciones de precio.
   - 🍽️ **Restaurantes y Cafeterías:** Pedidos en cafeterías con especificaciones, resolver errores en la cuenta.
5. **Auditoría Forense Tripartita Post-Sesión:**
   - **Gramática:** Qué dijiste $\rightarrow$ Corrección recomendada $\rightarrow$ Explicación clara en español de la regla.
   - **Vocabulario:** Alternativa informal nativa vs. Alternativa ejecutiva de negocios + Conteo de muletillas (*filler words*).
   - **Pronunciación:** Lista de palabras críticas con notación fonética IPA, pronunciación figurada en español ("es-kéd-yul"), consejos de articulación y reproductor comparativo (tu voz grabada vs. nativo).
6. **Sincronización Gratuita en Google Sheets (Google Apps Script):**
   - Sin servidores de pago. Tus datos se guardan en tu propia hoja de Google Sheets y se sincronizan entre tu móvil y tu PC.
   - Resiliencia offline: Si pasas por un túnel o estacionamiento sin señal, la sesión se guarda en el teléfono y se sincroniza al recuperar red.

---

## 🚀 Publicación en GitHub Pages (3 Pasos)

1. Sube estos archivos a tu repositorio en GitHub (ej. `tu-usuario/english-partner`).
2. En GitHub, ve a **Settings** $\rightarrow$ **Pages**.
3. En **Branch**, selecciona `main` (o `master`) y carpeta `/(root)`, luego haz clic en **Save**.
4. ¡Listo! En 1 minuto tendrás tu enlace HTTPS público listo para abrir en tu iPhone, Android o Mac.

---

## ☁️ Conexión con Google Sheets (2 Minutos)

Sigue la guía paso a paso en [gas/INSTRUCTIVO_GAS.md](file:///Users/jairjaimez/Library/CloudStorage/GoogleDrive-jairjjr@gmail.com/Mi%20unidad/English%20Partner/gas/INSTRUCTIVO_GAS.md) para pegar el código en tu hoja de Google Sheets e implementar tu propia API privada.

---

## 📱 Cómo Instalar como App en tu Teléfono

- **En iPhone (Safari):** Abre el enlace de tu GitHub Pages, presiona el botón **Compartir** (cuadrado con flecha hacia arriba) y selecciona **"Agregar a pantalla de inicio"**.
- **En Android (Chrome):** Abre el enlace, toca el menú de los tres puntos y selecciona **"Instalar aplicación"** o **"Agregar a la pantalla principal"**.

