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

## Licencia

Opensource