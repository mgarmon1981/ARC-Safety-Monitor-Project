# ARC Safety Assistant

Aplicación React/Vite preparada para despliegue en Vercel.

## Desarrollo local

```bash
npm install
npm run dev
```

## Compilación

```bash
npm run build
```

El resultado se genera en `dist/`.

## Despliegue en Vercel

1. Sube esta carpeta a un repositorio Git.
2. En Vercel, crea un nuevo proyecto e importa el repositorio.
3. Usa la configuración detectada automáticamente para Vite:
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Despliega.

## Nota clínica

Esta versión conserva la lógica actual del archivo v4-dev. La capa longitudinal está separada del motor ARC puntual y de Stewart Light.
