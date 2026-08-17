# Plantilla para escribir un post

1. Copiá esta carpeta dentro de `blog/(posts)/` y renombrala con el slug del post
   (p. ej. `recap-la-meetup-iv` → `/blog/recap-la-meetup-iv`). No uses `_` al inicio:
   las carpetas con `_` son privadas y no generan ruta (por eso esta plantilla no aparece).
2. Completá el objeto `post` de `page.mdx` — es la única fuente de verdad del post:
   - `title`, `description`, `slug` (igual al nombre de la carpeta) y `date` (ISO, ordena el índice).
   - `author`: quién lo escribió (si falta, firma "Comunidad OWU").
   - `tags`: en minúscula y reutilizables entre posts (p. ej. `meetups`, `owu-conf`,
     `comunidad`) — alimentan los filtros del índice, los keywords y el feed RSS.
   - `image` (opcional): banner propio en `public/images/blog/`. Sin `image`, se genera
     automáticamente una imagen OG brandeada en `/blog/og` con el título/autor/tag.
   - `updated` (opcional): fecha ISO de la última edición importante.
3. `postMetadata(post)` arma todo el SEO (OpenGraph article, Twitter card, canonical,
   keywords) y `<PostHeader post={post} />` muestra fecha/autor/tags e inyecta el
   JSON-LD (`BlogPosting` + breadcrumbs). El índice `/blog`, el sitemap y el feed
   `/blog/feed.xml` se actualizan solos.

> No borres esta carpeta aunque no haya posts: `posts.ts` usa un `import()` dinámico con
> patrón `*/page.mdx` y el bundler necesita al menos un archivo que lo matchee.
