# alxarafe/intermediation

Sistema de gestión de comisiones para intermediación entre fábricas y clientes, con generación de facturas de comisión a las fábricas tras verificación de entrega.

## Descripción

Módulo complementario para ERP (facturación y gestión empresarial) que se integra vía API sin modificar la estructura base de la aplicación original.

## Stack Tecnológico

- **Runtime**: NodeJS
- **Base de datos**: PostgreSQL
- **ORM**: Prisma
- **Frontend**: Angular

## Funcionalidades Principales

- **Gestión de comisiones** para intermediación fábrica-cliente
- **Generación de facturas de comisión** tras verificación de entrega
- **Importación de tarifas y pedidos**
- **Exportación de facturas de comisiones**
- **Reportes y documentos del dominio**
- **Wizard de configuración** con datos de conexión API

## Flujo de Trabajo

1. **Configuración inicial**: Ajustar parámetros y conexión API mediante wizard
2. **Uso diario**: Importar tarifas y pedidos, exportar facturas de comisiones
3. **Integración**: Compatible con otros módulos y el núcleo del sistema ERP
4. **Reportes**: Emisión de documentos y reportes específicos del dominio

## Desarrollo

### Reglas

- No modificar la aplicación ERP base; integración solo por API/contratos definidos
- Respetar convenciones de páginas y modelo de datos existente
- Definir formatos de importación/exportación antes de implementar
- Documentar puntos de entrada (wizards de configuración, controladores)

### Seguridad (entorno de pruebas)

- Secrets y credenciales en variables de entorno (no hardcoded)
- Validar inputs en endpoints de importación/exportación
- TLS en producción (HTTP plano solo en desarrollo local)

## Puesta en Marcha

### Requisitos

- Node.js >= 22
- Docker y Docker Compose (para PostgreSQL)
- npm

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/alxarafe/intermediation.git
cd intermediation

# Instalar dependencias
npm install

# Levantar base de datos
npm run db:up

# Configurar base de datos (generar cliente Prisma, migraciones y seed)
npm run setup

# Compilar todo
npm run build
```

### Desarrollo

```bash
# API en modo desarrollo (watch mode)
npm run api:dev

# Frontend en modo desarrollo
npm run web:dev

# Ejecutar tests de la API
npm run api:test

# Test de humo completo (requiere API corriendo)
node apps/api/test/smoke.mjs
```

### Tests con Bruno (Contract Testing)

Para testing de contrato estilo Bruno (como en repos hermanos):

```bash
# Instalar Bruno CLI
npm install -g @usebruno/cli

# Ejecutar colección de tests contra la API local
bru run tests/bruno --env local
```

Los tests de contrato están en `tests/bruno/` y validan todos los endpoints definidos en la especificación OpenAPI.

### Documentación API

La documentación interactiva Swagger/OpenAPI está disponible en:

- **Swagger UI**: http://localhost:3000/swagger
- **OpenAPI JSON**: http://localhost:3000/swagger/json

Incluye:
- Todos los endpoints con parámetros, request/response schemas
- Autenticación Bearer JWT (botón "Authorize")
- Esquemas de validación Zod convertidos a JSON Schema
- Ejemplos de request/response

### Comandos Útiles

```bash
# Ver logs de la base de datos
docker compose logs -f postgres

# Resetear base de datos y volver a sembrar
RESET_SEED=1 npm run seed

# Abrir Prisma Studio
npm run prisma:studio -w @intermediacion/api

# Ver estado de salud de los contenedores
docker compose ps
```

### Variables de Entorno

Copiar `.env.example` a `.env` y ajustar:

```bash
cp .env.example .env
```

Principales variables:

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `DATABASE_URL` | Conexión a PostgreSQL | `postgresql://intermediacion:intermediacion@localhost:5435/intermediacion` |
| `JWT_SECRET` | Clave para firmar tokens | `secret` (solo dev) |
| `PORT` | Puerto de la API | `3000` |

### Endpoints Principales

Una vez corriendo la API (`npm run api:dev`):

- **Health check**: `GET http://localhost:3000/health`
- **Login**: `POST http://localhost:3000/api/auth/login`
- **Documentación API (Swagger UI)**: `http://localhost:3000/swagger`
- **Esquema OpenAPI (JSON)**: `GET http://localhost:3000/swagger/json`

Credenciales por defecto (seed):
- Email: `admin@intermediacion.local`
- Password: `admin1234`

## Estructura del Proyecto

```
intermediation/
├── apps/
│   ├── api/                 # Backend Fastify + TypeScript
│   │   ├── src/
│   │   │   ├── modules/     # Módulos por dominio
│   │   │   │   ├── auth/           # Autenticación JWT
│   │   │   │   ├── factories/      # Fábricas y catálogos
│   │   │   │   ├── articles/       # Artículos y ofertas
│   │   │   │   ├── customers/      # Clientes
│   │   │   │   ├── price-lists/    # Tarifas de precio
│   │   │   │   ├── prices/         # Resolución de precios por fecha
│   │   │   │   ├── sales-orders/   # Pedidos de venta
│   │   │   │   ├── service-orders/ # Órdenes de servicio y verificación
│   │   │   │   ├── invoices/       # Facturas de comisión
│   │   │   │   └── dashboard/      # Resumen ejecutivo
│   │   │   ├── lib/         # Utilidades compartidas
│   │   │   └── prisma.ts    # Cliente Prisma
│   │   └── prisma/          # Schema y migraciones
│   └── web/                 # Frontend Angular (pendiente)
├── packages/
│   └── shared/              # DTOs, inputs, tipos compartidos (Zod)
├── tests/
│   ├── bruno/               # Tests de contrato (Bruno)
│   └── smoke.mjs            # Test de humo E2E
├── docker-compose.yml       # PostgreSQL
└── .env.example             # Variables de entorno de ejemplo
```

## Módulos de la API

| Módulo | Prefijo | Descripción |
|--------|---------|-------------|
| Auth | `/api/auth` | Login, usuario actual, gestión usuarios (admin) |
| Factories | `/api/factories` | CRUD fábricas, vínculos fábrica-artículo |
| Articles | `/api/articles` | CRUD artículos, ofertas comparadas por fecha |
| Customers | `/api/customers` | CRUD clientes |
| Price Lists | `/api/price-lists` | Tarifas (draft/active/archived), activación |
| Prices | `/api/prices` | Resolución precio por fecha, histórico |
| Sales Orders | `/api/sales-orders` | Pedidos, líneas, confirmación, reparto |
| Service Orders | `/api/service-orders` | Órdenes servicio, estados, verificación batch |
| Commission Invoices | `/api/commission-invoices` | Facturas agrupadas, emisión, pago, cancelación |
| Dashboard | `/api/dashboard` | KPIs ejecutivo |

## Licencia

MIT License - ver [LICENSE](LICENSE) para detalles.