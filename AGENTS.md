# AGENTS.md — Guía para agentes de IA

## Propósito del repositorio

**`alxarafe/intermediation`** — Sistema de gestión de comisiones para intermediación entre fábricas y clientes, con generación de facturas de comisión a las fábricas tras verificación de entrega.

Módulo complementario para ERP (facturación y gestión empresarial) que se integra vía API sin modificar la estructura base. Stack: **NodeJS, PostgreSQL, Prisma, Angular**.

## Reglas de desarrollo

- **No modificar** la aplicación ERP base; integración solo por API/contratos definidos
- **Respetar** convenciones de páginas y modelo de datos existente
- **Definir** formatos de importación/exportación antes de implementar
- **Documentar** puntos de entrada (wizards de configuración, controladores)

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Runtime | NodeJS |
| Base de datos | PostgreSQL |
| ORM | Prisma |
| Frontend | Angular |

## Flujo de trabajo típico

1. **Configuración inicial**: Wizard con datos de conexión API
2. **Uso diario**: Importar tarifas y pedidos, exportar facturas de comisiones
3. **Integración**: Compatibilidad con otros módulos y núcleo del sistema
4. **Reportes**: Emisión de documentos y reportes del dominio

## Consideraciones de seguridad (entorno de pruebas)

- Secrets y credenciales en variables de entorno (no hardcoded)
- Validar inputs en endpoints de importación/exportación
- TLS en producción (HTTP plano solo en desarrollo local)