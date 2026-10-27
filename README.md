# Mi Rutina Gym — App PWA de Entrenamiento Upper/Lower

Aplicación web progresiva (PWA) mobile-first diseñada en español para seguimiento de rutinas de gimnasio Upper/Lower con énfasis en glúteos, cálculo automático de cargas a partir de RM o series submáximas de referencia, control de series de calentamiento/aproximación/efectivas y persistencia local.

## Cómo ejecutar el proyecto localmente

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Ejecutar pruebas automatizadas
npm test

# Comprobar tipos y compilar para producción
npm run lint
npm run build
```

## Instalación como PWA en el celular

- **Android (Chrome):** Abre la aplicación en Chrome, toca el menú de tres puntos (`⋮`) o el botón **"Instalar App"** dentro de la aplicación y elige **"Instalar aplicación"** / **"Agregar a la pantalla principal"**.
- **iPhone / iOS (Safari):** Abre la aplicación en Safari, toca el botón **Compartir** en la barra inferior y selecciona **"Agregar a inicio"**.

## Almacenamiento y Copias de Seguridad

- Todos los datos se guardan localmente en el dispositivo usando **IndexedDB** (`fitness_mom_db`) con espejo de seguridad en `localStorage`, sin requerir cuenta ni conexión a un servidor externo.
- En la pestaña **Configuración** puedes **Exportar copia de seguridad (.json)** e **Importar copia de seguridad (.json)** con validación de integridad y confirmación antes de sobrescribir.
