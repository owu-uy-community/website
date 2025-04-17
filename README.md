# 🚀 OWU - Website

## 📖 Descripción

OWU.uy es una aplicación web construida con Next.js 15, TypeScript y una rica colección de herramientas y librerías modernas. Diseñada para ofrecer una experiencia de usuario excepcional con un rendimiento óptimo.

## 🛠️ Tecnologías Principales

- Next.js 15
- TypeScript
- Tailwind CSS
- Supabase
- Radix UI (shadcn/ui)
- Motion
- Remotion
- React Hook Form
- Zod (validación)

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js (versión recomendada: 18.x o superior)
- pnpm (recomendado) o npm
- Git

### Instalación

1. Clona el repositorio:

```bash
git clone git@github.com:owu-uy-community/website.git
cd owu
```

2. Instala las dependencias:

```bash
pnpm install
```

3. Copia el archivo de variables de entorno:

```bash
cp .env.example .env
```

4. Configura las variables de entorno en el archivo `.env`

5. Inicia el servidor de desarrollo:

```bash
pnpm dev
```

La aplicación estará disponible en `http://localhost:3000`

## 📁 Estructura del Proyecto

```
owu/
├── src/                    # Código fuente principal
│   ├── app/               # Rutas y páginas de la aplicación
│   ├── components/        # Componentes reutilizables
│   └── keystatic/         # Configuración de Keystatic CMS
├── public/                # Archivos estáticos
├── content/               # Contenido gestionado por Keystatic (CMS)
├── .github/               # Configuración de GitHub Actions
├── tailwind.config.ts     # Configuración de Tailwind CSS
├── next.config.js         # Configuración de Next.js
└── package.json           # Dependencias y scripts
```

## 📜 Scripts Disponibles

- `pnpm dev`: Inicia el servidor de desarrollo
- `pnpm build`: Construye la aplicación para producción
- `pnpm start`: Inicia la aplicación en modo producción
- `pnpm lint`: Ejecuta el linter
- `pnpm lint:fix`: Corrige automáticamente problemas de linting
- `pnpm remotion`: Inicia el studio de Remotion
- `pnpm render`: Renderiza videos con Remotion

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Por favor, lee nuestro archivo [CONTRIBUTING.md](CONTRIBUTING.md) para detalles sobre nuestro código de conducta y el proceso para enviar pull requests.

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo LICENSE.md para más detalles.

## 🙋‍♂️ Soporte

Si tienes alguna pregunta o problema, por favor abre un issue en el repositorio de GitHub.

## 🌟 Agradecimientos

Agradecemos a todos los contribuidores y a la comunidad del código abierto por hacer posible este proyecto.

---

⭐️ Si te gusta este proyecto, ¡no olvides darle una estrella en GitHub!
