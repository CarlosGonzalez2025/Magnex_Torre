# 🚚 Magnex Torre - Sistema de Gestión de Flotas

Sistema de monitoreo y gestión de flotas vehiculares en tiempo real con torre de control, alertas automáticas, geocercas y gestión de usuarios.

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![React](https://img.shields.io/badge/React-18.3.1-61dafb.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg)
![Supabase](https://img.shields.io/badge/Supabase-Latest-3fcf8e.svg)

---

## 📑 Tabla de Contenidos

- [Características](#-características)
- [Arquitectura](#-arquitectura)
- [Tecnologías](#️-tecnologías)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Módulos del Sistema](#-módulos-del-sistema)
- [Instalación](#-instalación)
- [Configuración](#️-configuración)
- [Base de Datos](#️-base-de-datos)
- [Sistema de Usuarios](#-sistema-de-usuarios)
- [Despliegue](#-despliegue)
- [Documentación](#-documentación)

---

## ✨ Características

### 🔴 **Torre de Control en Tiempo Real**
- Monitoreo en vivo de toda la flota vehicular
- Actualización automática cada 5 minutos
- Dashboard con KPIs principales
- Vista de tabla y mapa interactivo

### 🚨 **Sistema de Alertas Inteligente**
- Detección automática de alertas críticas:
  - Exceso de velocidad
  - Ralentí prolongado
  - Vehículos detenidos
  - Desconexión de GPS
  - Alertas personalizadas
- Auto-guardado en base de datos
- Notificaciones sonoras diferenciadas
- Planes de acción para cada alerta

### 🗺️ **Gestión de Geocercas**
- Editor visual de geocercas
- Alertas de entrada/salida de zonas
- Múltiples tipos de zonas (circular, poligonal)

### 👥 **Gestión de Usuarios (RBAC)**
- Sistema de roles: Admin, Operador, Visor
- CRUD completo de usuarios
- Auditoría de acciones
- Autenticación con Supabase Auth

### 📊 **Análisis y Reportes**
- Análisis de patrones de flota
- Métricas de rendimiento
- Historial completo de eventos
- Exportación de datos

### 🔧 **Módulos de Gestión**
- Conductores
- Inspecciones vehiculares
- Cronogramas de rutas
- Mantenimiento preventivo/correctivo

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Sidebar    │  │   Dashboard  │  │ UserManagement│ │
│  │ (Navegación) │  │    (KPIs)    │  │   (CRUD)      │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│         │                  │                  │         │
│         └──────────────────┴──────────────────┘         │
│                          │                               │
├──────────────────────────┼──────────────────────────────┤
│                   Services Layer                         │
│  ┌─────────────────┬─────────────────┬───────────────┐ │
│  │  fleetService   │  alertService   │ userService   │ │
│  │  (APIs flotas)  │  (Detección)    │ (Auth/CRUD)   │ │
│  └─────────────────┴─────────────────┴───────────────┘ │
│                          │                               │
├──────────────────────────┼──────────────────────────────┤
│                  Supabase Backend                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  PostgreSQL Database                             │  │
│  │  - user_profiles (RLS)                           │  │
│  │  - saved_alerts                                  │  │
│  │  - audit_log                                     │  │
│  │  - auth.users (Supabase Auth)                    │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
             │                        │
    ┌────────┴────────┐      ┌───────┴────────┐
    │  Coltrack API   │      │  FlotasNet API │
    │  (Flota datos)  │      │  (Flota datos) │
    └─────────────────┘      └────────────────┘
```

---

## 🛠️ Tecnologías

### **Frontend**
- **React 18.3.1** - Biblioteca UI
- **TypeScript 5.6** - Tipado estático
- **Vite 6.4** - Build tool y dev server
- **TailwindCSS 3.4** - Estilos utility-first
- **Lucide React** - Iconografía moderna
- **React Router DOM** - Enrutamiento SPA

### **Mapa y Visualización**
- **Leaflet 1.9** - Mapas interactivos
- **React Leaflet** - Integración con React

### **Backend y Base de Datos**
- **Supabase** - BaaS (Backend as a Service)
  - PostgreSQL database
  - Authentication (Auth)
  - Row Level Security (RLS)
  - Real-time subscriptions
- **Edge Functions** - Funciones serverless

### **APIs Externas**
- **Coltrack API** - Datos de flota (GPS)
- **FlotasNet/Fagor API** - Datos de flota (GPS)
- **Google Sheets API** - Integración de datos

---

## 📁 Estructura del Proyecto

```
Magnex_Torre/
├── components/              # Componentes React
│   ├── Sidebar.tsx         # Menú lateral con grupos
│   ├── Dashboard.tsx       # Panel de control principal
│   ├── UserManagement.tsx  # Gestión de usuarios (Admin)
│   ├── AlertPanel.tsx      # Centro de alertas
│   ├── AlertHistory.tsx    # Historial de alertas
│   ├── SavedAlertsPanel.tsx # Alertas auto-guardadas
│   ├── VehicleTable.tsx    # Tabla de vehículos
│   ├── FleetMap.tsx        # Mapa en tiempo real
│   ├── DriverManagement.tsx # Gestión de conductores
│   ├── GeofenceEditor.tsx  # Editor de geocercas
│   ├── Inspections.tsx     # Sistema de inspecciones
│   ├── RouteSchedules.tsx  # Cronogramas de rutas
│   ├── MaintenancePanel.tsx # Mantenimiento
│   ├── Analytics.tsx       # Análisis y métricas
│   ├── KpiCards.tsx        # Tarjetas de KPIs
│   ├── Login.tsx           # Página de login
│   ├── ThemeToggle.tsx     # Tema claro/oscuro
│   └── AlertSoundSettings.tsx # Configuración sonidos
│
├── services/               # Servicios y lógica de negocio
│   ├── fleetService.ts    # Obtención datos de flota
│   ├── alertService.ts    # Detección y gestión alertas
│   ├── databaseService.ts # Guardado en Supabase
│   ├── userService.ts     # Gestión de usuarios (CRUD)
│   ├── supabaseClient.ts  # Cliente Supabase
│   └── alertSoundService.ts # Sistema de sonidos
│
├── contexts/              # Contextos React (estado global)
│   ├── AuthContext.tsx   # Autenticación y sesión
│   └── ThemeContext.tsx  # Tema claro/oscuro
│
├── hooks/                # Custom hooks
│   ├── useAutoCleanup.ts # Limpieza automática datos
│   └── usePWA.ts         # Progressive Web App
│
├── supabase/             # Configuración y migraciones
│   └── migrations/
│       ├── create_saved_alerts_table.sql
│       ├── create_user_profiles_system.sql
│       └── update_users_system_compatible.sql
│
├── docs/                 # Documentación del sistema
│   ├── GUIA_TORRE_CONTROL.md      # Guía operadores (317 líneas)
│   ├── SISTEMA_USUARIOS_ARQUITECTURA.md
│   ├── IMPLEMENTATION_SUMMARY.md
│   └── [otros docs técnicos]
│
├── App.tsx              # Componente principal (routing)
├── main.tsx             # Punto de entrada React
├── types.ts             # Tipos TypeScript compartidos
├── vite.config.ts       # Configuración Vite
├── tailwind.config.js   # Configuración TailwindCSS
├── tsconfig.json        # Configuración TypeScript
└── package.json         # Dependencias y scripts
```

---

## 🎯 Módulos del Sistema

### **📊 MONITOREO**

| Módulo | Archivo | Descripción |
|--------|---------|-------------|
| **Dashboard** | `components/Dashboard.tsx` | Vista general con KPIs y resumen de flota |
| **Tabla de Flota** | `components/VehicleTable.tsx` | Tabla detallada de todos los vehículos |
| **Mapa en Vivo** | `components/FleetMap.tsx` | Mapa interactivo con ubicación en tiempo real |

### **🚨 ALERTAS**

| Módulo | Archivo | Descripción |
|--------|---------|-------------|
| **Centro de Alertas** | `components/AlertPanel.tsx` | Alertas activas sin guardar |
| **Historial** | `components/AlertHistory.tsx` | Historial completo de todas las alertas |
| **Auto-Guardadas** | `components/SavedAlertsPanel.tsx` | Alertas guardadas automáticamente con planes de acción |

### **🔧 GESTIÓN**

| Módulo | Archivo | Descripción |
|--------|---------|-------------|
| **Conductores** | `components/DriverManagement.tsx` | Gestión de conductores de la flota |
| **Geocercas** | `components/GeofenceEditor.tsx` | Editor de geocercas y zonas |
| **Inspecciones** | `components/Inspections.tsx` | Sistema de inspecciones vehiculares |
| **Cronogramas** | `components/RouteSchedules.tsx` | Programación de rutas y horarios |
| **Mantenimiento** | `components/MaintenancePanel.tsx` | Control de mantenimiento preventivo/correctivo |

### **🛡️ ADMINISTRACIÓN** (Solo Admin)

| Módulo | Archivo | Descripción |
|--------|---------|-------------|
| **Usuarios** | `components/UserManagement.tsx` | CRUD de usuarios y roles |
| **Análisis** | `components/Analytics.tsx` | Análisis avanzado y métricas |

---

## 🚀 Instalación

### **Prerrequisitos**

- Node.js 18+
- npm o yarn
- Cuenta de Supabase
- API keys de Coltrack/FlotasNet (opcional)

### **Pasos**

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/tu-usuario/magnex-torre.git
   cd magnex-torre
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**

   Crear archivo `.env.local`:
   ```env
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key
   VITE_COLTRACK_API_URL=https://api.coltrack.com
   VITE_FAGOR_API_URL=https://api.flotasnet.com
   ```

4. **Ejecutar migraciones de base de datos**

   En Supabase SQL Editor, ejecutar archivos en orden:
   ```bash
   supabase/migrations/create_saved_alerts_table.sql
   supabase/migrations/create_user_profiles_system.sql
   supabase/migrations/update_users_system_compatible.sql
   ```

5. **Iniciar servidor de desarrollo**
   ```bash
   npm run dev
   ```

6. **Abrir en navegador**
   ```
   http://localhost:5173
   ```

---

## ⚙️ Configuración

### **Supabase Setup**

1. **Crear proyecto en Supabase**
   - Ir a https://supabase.com
   - Crear nuevo proyecto
   - Copiar URL y Anon Key

2. **Habilitar Authentication**
   - Authentication → Providers → Email
   - Configurar Email Templates
   - Opcional: Desactivar "Confirm email" para desarrollo

3. **Configurar RLS (Row Level Security)**
   - Las políticas están en los archivos SQL
   - Se aplican automáticamente al ejecutar migraciones

### **APIs de Flota**

Configurar credenciales en `.env.local`:

```env
# Coltrack API
VITE_COLTRACK_API_URL=https://api.coltrack.com
VITE_COLTRACK_API_KEY=tu-api-key

# FlotasNet/Fagor API
VITE_FAGOR_API_URL=https://api.flotasnet.com
VITE_FAGOR_API_KEY=tu-api-key
```

---

## 🗄️ Base de Datos

### **Tablas Principales**

#### **1. `user_profiles` (Gestión de Usuarios)**
```sql
- id: UUID (PK, FK → auth.users)
- email: TEXT
- name: TEXT
- role: TEXT (admin | operator | viewer)
- is_active: BOOLEAN
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ
- last_login: TIMESTAMPTZ
```

**RLS Policies:**
- Todos pueden ver perfiles
- Solo admins pueden crear/editar/eliminar

#### **2. `saved_alerts` (Alertas Guardadas)**
```sql
- id: UUID (PK)
- vehicle_id: TEXT
- plate: TEXT
- alert_type: TEXT
- severity: TEXT
- details: TEXT
- location: TEXT
- timestamp: TIMESTAMPTZ
- saved_at: TIMESTAMPTZ
- action_plan: TEXT
- status: TEXT
```

#### **3. `audit_log` (Auditoría)**
```sql
- id: UUID (PK)
- user_id: UUID (FK → auth.users)
- action: TEXT
- resource_type: TEXT
- resource_id: TEXT
- details: JSONB
- ip_address: TEXT
- created_at: TIMESTAMPTZ
```

### **Funciones SQL**

- `log_audit()` - Registrar eventos de auditoría
- `sync_user_profile()` - Sincronizar auth.users ↔ user_profiles
- `update_user_metadata()` - Actualizar metadata de usuarios

---

## 👥 Sistema de Usuarios

### **Roles y Permisos**

| Rol | Dashboard | Alertas | Gestión | Admin |
|-----|-----------|---------|---------|-------|
| **Visor** | ✅ Ver | ✅ Ver | ❌ | ❌ |
| **Operador** | ✅ Ver | ✅ Gestionar | ✅ Editar | ❌ |
| **Admin** | ✅ Ver | ✅ Gestionar | ✅ Gestionar | ✅ Full |

### **Crear Usuario Admin Inicial**

Ejecutar en Supabase SQL Editor:

```sql
-- 1. Registrar usuario en Supabase Auth (o usar UI de Auth)

-- 2. Actualizar rol a admin
UPDATE public.user_profiles
SET role = 'admin'
WHERE email = 'admin@magnex.com';
```

### **Gestión de Usuarios desde la UI**

1. Iniciar sesión como **admin**
2. Ir a **Sidebar → Administración → Usuarios**
3. Operaciones disponibles:
   - ➕ Crear usuario
   - ✏️ Editar usuario
   - 🔑 Resetear contraseña
   - ✅ Activar/Desactivar
   - 🗑️ Eliminar usuario

---

## 🚀 Despliegue

### **Opción 1: Vercel (Recomendado)**

```bash
# 1. Instalar Vercel CLI
npm i -g vercel

# 2. Deploy
vercel

# 3. Configurar variables de entorno en Vercel Dashboard
```

### **Opción 2: Netlify**

```bash
# 1. Build
npm run build

# 2. Deploy carpeta dist/
netlify deploy --prod --dir=dist
```

### **Opción 3: Docker**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "preview"]
```

---

## 📚 Documentación

- **Guía Torre de Control**: `docs/GUIA_TORRE_CONTROL.md` (317 líneas)
  - Flujos de trabajo
  - Protocolos de alertas
  - Casos de estudio
  - Mejores prácticas

- **Arquitectura de Usuarios**: `docs/SISTEMA_USUARIOS_ARQUITECTURA.md`
  - Diseño del sistema RBAC
  - Políticas RLS
  - Flujos de autenticación

- **Resumen de Implementación**: `docs/IMPLEMENTATION_SUMMARY.md`
  - Historial de features
  - Decisiones técnicas
  - Changelog

---

## 📝 Scripts Disponibles

```bash
# Desarrollo
npm run dev          # Inicia servidor de desarrollo

# Build
npm run build        # Compila para producción
npm run preview      # Preview del build

# Linting
npm run lint         # Ejecuta ESLint

# TypeScript
tsc --noEmit         # Verificar tipos
```

---

## 🤝 Contribuir

1. Fork el proyecto
2. Crear rama feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

---

## 📄 Licencia

Este proyecto es propiedad de **Magnex** y está bajo licencia privada.

---

## 📧 Soporte

Para soporte técnico o preguntas:
- **Email**: soporte@magnex.com
- **Issues**: https://github.com/tu-usuario/magnex-torre/issues

---

## 🎉 Créditos

Desarrollado con ❤️ por el equipo de Magnex

**Stack Principal:**
- React + TypeScript
- Supabase (PostgreSQL + Auth + RLS)
- TailwindCSS + Lucide Icons
- Leaflet (Mapas)
- Vite (Build tool)

---

<div align="center">
  <strong>Magnex Torre v2.0.0</strong>
  <br>
  Sistema de Gestión de Flotas en Tiempo Real
</div>
