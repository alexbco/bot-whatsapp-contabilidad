# 🤖 Bot de WhatsApp Contabilidad – Antonio Edition

Un bot de contabilidad personalizado desarrollado con **Node.js**, **Express** y la **WhatsApp Cloud API**.  
Permite registrar pagos, consultar totales mensuales, buscar registros, generar rankings y exportar los datos a CSV.  
Proyecto creado por **Alex Blanco Benito** 👨🏻‍💻.

---

## 🚀 Características principales

✅ Escucha mensajes de WhatsApp en tiempo real (webhook de Meta).  
✅ Guarda pagos automáticamente con lenguaje natural (“Juan me ha pagado 120”).  
✅ Responde sin necesidad de comandos técnicos.  
✅ Calcula totales y genera rankings mensuales.  
✅ Exporta registros a CSV descargable.  
✅ Personalizado para “Antonio”, con mensajes naturales y cercanos.  

---

## 🛠️ Tecnologías utilizadas

- 🟢 Node.js + Express  
- 📦 Axios  
- 🧱 SQLite (better-sqlite3)  
- ⚙️ dotenv  
- 🕓 dayjs  
- 🌍 ngrok (para exponer el servidor local a Meta)

---

## 📁 Estructura del proyecto

bot-whatsapp-contabilidad/
│
├── src/
│ └── app.js # Lógica principal del servidor
│
├── data.db # Base de datos SQLite (autogenerada)
├── exports/ # CSVs exportados (se ignora en git)
├── .env # Configuración privada (no se sube)
├── .env.example # Ejemplo de configuración
├── .gitignore
├── package.json
└── README.md
