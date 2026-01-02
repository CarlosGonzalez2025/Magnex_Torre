# 👥 Sistema de Gestión de Usuarios - Arquitectura

## 🎯 Objetivos

1. **Control de acceso** basado en roles
2. **Gestión de usuarios** por administradores
3. **Permisos granulares** por funcionalidad
4. **Auditoría** de acciones de usuarios

---

## 📊 Roles del Sistema

### 1. **ADMIN** (Administrador)
**Permisos:**
- ✅ Ver TODO
- ✅ Editar TODO
- ✅ Crear/Editar/Eliminar usuarios
- ✅ Asignar roles
- ✅ Exportar reportes
- ✅ Acceso a configuración del sistema
- ✅ Ver logs de auditoría

**Restricciones:**
- ❌ Ninguna

### 2. **USER** (Usuario Regular)
**Permisos:**
- ✅ Ver flota en tiempo real
- ✅ Ver alertas
- ✅ Ver Auto-Guardadas
- ✅ Ver Historial
- ✅ Ver Analytics
- ✅ Exportar a Excel (solo lectura)

**Restricciones:**
- ❌ NO puede crear/editar/eliminar alertas
- ❌ NO puede modificar estado de alertas
- ❌ NO puede guardar en Historial
- ❌ NO puede gestionar usuarios
- ❌ NO puede acceder a configuración
- ❌ NO puede modificar datos

---

## 🗄️ Estructura de Base de Datos

### Tabla: `users`

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  password_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Índices
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);

-- Usuario admin inicial
INSERT INTO users (email, full_name, role, password_hash, is_active) VALUES
('admin@magnex.com', 'Administrador Sistema', 'admin', '$2a$10$...', true);
```

### Tabla: `user_sessions`

```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_token ON user_sessions(token);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);
```

### Tabla: `audit_log`

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at);
```

---

## 🔐 Sistema de Autenticación

### Flujo de Login

```
1. Usuario ingresa email + password
   ↓
2. Sistema valida credenciales
   ↓
3. Si válido: Genera token de sesión
   ↓
4. Almacena token en localStorage
   ↓
5. Redirecciona a dashboard
```

### Flujo de Verificación

```
Cada request:
1. Lee token de localStorage
   ↓
2. Verifica token en backend
   ↓
3. Si válido: Obtiene user data + role
   ↓
4. Renderiza UI según permisos
```

---

## 🎨 Componentes a Crear

### 1. `LoginPage.tsx`
- Formulario de login
- Validación de credenciales
- Manejo de errores
- Redirección según rol

### 2. `UserManagement.tsx` (Solo ADMIN)
- Lista de usuarios
- Crear nuevo usuario
- Editar usuario
- Desactivar/Activar usuario
- Asignar rol
- Ver último login

### 3. `AuthContext.tsx`
- Contexto global de autenticación
- Estado del usuario actual
- Funciones de login/logout
- Verificación de permisos

### 4. `ProtectedRoute.tsx`
- HOC para proteger rutas
- Verificación de autenticación
- Verificación de rol
- Redirección si no autorizado

### 5. `PermissionGate.tsx`
- Componente para ocultar/mostrar según permisos
- Uso: `<PermissionGate require="admin">...</PermissionGate>`

---

## 🔒 Control de Permisos

### Sistema de Permisos

```typescript
// types/permissions.ts

export enum Permission {
  // Usuarios
  USER_VIEW = 'user:view',
  USER_CREATE = 'user:create',
  USER_EDIT = 'user:edit',
  USER_DELETE = 'user:delete',

  // Alertas
  ALERT_VIEW = 'alert:view',
  ALERT_CREATE = 'alert:create',
  ALERT_EDIT = 'alert:edit',
  ALERT_DELETE = 'alert:delete',
  ALERT_EXPORT = 'alert:export',

  // Flota
  FLEET_VIEW = 'fleet:view',
  FLEET_EDIT = 'fleet:edit',

  // Configuración
  CONFIG_VIEW = 'config:view',
  CONFIG_EDIT = 'config:edit',
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    // Todos los permisos
    ...Object.values(Permission)
  ],
  user: [
    // Solo lectura
    Permission.USER_VIEW,
    Permission.ALERT_VIEW,
    Permission.ALERT_EXPORT,
    Permission.FLEET_VIEW,
  ]
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
```

### Aplicación de Permisos en UI

```typescript
// Ejemplo en AlertPanel.tsx

import { useAuth } from '../contexts/AuthContext';
import { Permission } from '../types/permissions';

export const AlertPanel = () => {
  const { user, hasPermission } = useAuth();

  return (
    <div>
      <h2>Alertas</h2>

      {/* Solo admin puede crear alertas */}
      {hasPermission(Permission.ALERT_CREATE) && (
        <button onClick={handleCreate}>Crear Alerta</button>
      )}

      {/* Todos pueden ver */}
      <AlertList alerts={alerts} />

      {/* Solo admin puede editar */}
      {hasPermission(Permission.ALERT_EDIT) && (
        <button onClick={handleEdit}>Editar</button>
      )}
    </div>
  );
};
```

---

## 🔄 Flujos de Usuario

### Flujo ADMIN

```
Login → Dashboard
  ├─ Ver Flota (Full access)
  ├─ Ver/Editar Alertas
  ├─ Ver/Editar Auto-Guardadas
  ├─ Ver/Editar Historial
  ├─ Gestionar Usuarios ⭐ (Nuevo módulo)
  ├─ Configuración Sistema
  └─ Ver Logs de Auditoría
```

### Flujo USER

```
Login → Dashboard (Read-only)
  ├─ Ver Flota (Solo lectura)
  ├─ Ver Alertas (Solo lectura)
  ├─ Ver Auto-Guardadas (Solo lectura)
  ├─ Ver Historial (Solo lectura)
  └─ Exportar Excel (Permitido)

❌ NO ve:
  - Botones de Crear/Editar/Eliminar
  - Módulo de Gestión de Usuarios
  - Configuración Sistema
```

---

## 📱 UI del Módulo de Usuarios

### Vista Principal (Solo ADMIN)

```
┌────────────────────────────────────────────────────────┐
│  👥 Gestión de Usuarios                                │
│                                                         │
│  [+ Crear Usuario]         [🔍 Buscar...]              │
│                                                         │
│  ┌────────────────────────────────────────────────┐   │
│  │ Email            │ Nombre    │ Rol   │ Estado  │   │
│  ├────────────────────────────────────────────────┤   │
│  │ admin@magnex.com │ Admin     │ ADMIN │ ✅     │   │
│  │ juan@magnex.com  │ Juan P.   │ USER  │ ✅     │   │
│  │ maria@magnex.com │ María G.  │ USER  │ ❌     │   │
│  └────────────────────────────────────────────────┘   │
│                                                         │
│  Acciones: [✏️ Editar] [🗑️ Desactivar] [🔄 Resetear Password] │
└────────────────────────────────────────────────────────┘
```

### Formulario Crear/Editar Usuario

```
┌──────────────────────────────────────┐
│  Crear Nuevo Usuario                │
│                                       │
│  Email *                             │
│  [____________________________]       │
│                                       │
│  Nombre Completo *                   │
│  [____________________________]       │
│                                       │
│  Rol *                               │
│  (•) Admin  ( ) Usuario              │
│                                       │
│  Password *                          │
│  [____________________________]       │
│                                       │
│  Confirmar Password *                │
│  [____________________________]       │
│                                       │
│  [ Cancelar ]  [ Guardar Usuario ]   │
└──────────────────────────────────────┘
```

---

## 🔧 Implementación Técnica

### Archivos a Crear/Modificar

```
src/
├── contexts/
│   └── AuthContext.tsx          ← NUEVO
├── components/
│   ├── LoginPage.tsx            ← NUEVO
│   ├── UserManagement.tsx       ← NUEVO
│   ├── ProtectedRoute.tsx       ← NUEVO
│   └── PermissionGate.tsx       ← NUEVO
├── services/
│   ├── authService.ts           ← NUEVO
│   └── userService.ts           ← NUEVO
├── types/
│   ├── user.ts                  ← NUEVO
│   └── permissions.ts           ← NUEVO
└── App.tsx                      ← MODIFICAR (agregar auth)
```

### Modificaciones en App.tsx

```typescript
// Antes
function App() {
  return <Dashboard />;
}

// Después
function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
```

---

## 🚀 Plan de Implementación

### Fase 1: Base de Datos (30 min)
1. Crear tablas en Supabase
2. Insertar usuario admin inicial
3. Configurar RLS (Row Level Security)

### Fase 2: Autenticación (1 hora)
1. Crear AuthContext
2. Crear AuthService
3. Crear LoginPage
4. Implementar logout

### Fase 3: Control de Permisos (45 min)
1. Definir tipos y permisos
2. Crear ProtectedRoute
3. Crear PermissionGate
4. Aplicar en componentes existentes

### Fase 4: Gestión de Usuarios (1.5 horas)
1. Crear UserManagement component
2. CRUD de usuarios
3. Cambio de password
4. Activar/Desactivar usuarios

### Fase 5: Auditoría (30 min)
1. Logger de acciones
2. Vista de logs (para admin)

---

**Tiempo Total Estimado:** 4-5 horas

**¿Proceder con la implementación?**
