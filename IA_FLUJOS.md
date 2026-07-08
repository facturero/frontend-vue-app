# Frontend — Flujos de Procesos y Arquitectura

> Documento para que la IA (o cualquier desarrollador) entienda rápido cómo funciona el frontend sin tener que leer todo el código.

---

## 1. Stack

| Capa          | Tecnología            |
|---------------|-----------------------|
| Framework     | Vue 3 (Composition API, `<script setup>`) |
| UI            | Vuetify 3 + MDI icons |
| Estado        | Pinia (stores)        |
| Router        | vue-router 4          |
| HTTP          | Axios con interceptors |
| i18n          | vue-i18n (es/en/fr)   |
| Build         | Vite                  |

---

## 2. Estructura de `src/`

```
src/
  api/            → Llamadas HTTP (auth, employees, roles, files)
  components/     → Componentes reutilizables
  composable/     → Composables (useLocale, useThemeToggle)
  i18n/           → Traducciones (es.json, en.json, fr.json)
  layouts/        → Layouts del shell (AppNavigationDrawer, AppTopBar)
  menus/          → Definición de ítems del menú de navegación
  plugins/        → Registro de plugins (Pinia, Router, Vuetify, i18n)
  router/         → Configuración de rutas y guard
  stores/         → Stores Pinia (auth, employees, roles, ui)
  styles/         → Variables y settings de Vuetify
  types/          → Interfaces TypeScript
  utils/          → http.ts (Axios config + interceptors), error.ts
  views/          → Páginas (auth, home, profile, employees/, roles/)
  App.vue         → Raíz: renderiza shell o layout limpio según ruta
  main.ts         → Entry point: crea app, registra plugins, monta
```

---

## 3. Flujo de Inicio (App.vue)

```
index.html → main.ts → App.vue
                          │
                          ├─ ¿La ruta tiene meta.requiresAuth?
                          │     ├─ Sí → renderiza shell (drawer + topbar + router-view)
                          │     └─ No → renderiza solo router-view (login)
                          │
                          └─ Cada vez que el usuario navega...
                               → router.beforeEach (ver abajo)
```

---

## 4. Router y Guard (`router/index.ts`)

### Rutas

| Ruta                | Vista                | Meta                                      |
|---------------------|----------------------|-------------------------------------------|
| `/login`            | AuthView             | —                                         |
| `/profile`          | ProfileView          | `requiresAuth: true`                      |
| `/`                 | HomeView             | `requiresAuth: true`                      |
| `/employees`        | EmployeesListView    | `requiresAuth, requiredPermission`        |
| `/employees/invite` | EmployeesListView (dialog) | `requiresAuth, requiredPermission` |
| `/employees/:id`    | EmployeeDetailView   | `requiresAuth, requiredPermission`        |
| `/roles`            | RolesListView        | `requiresAuth, requiredPermission`        |
| `/roles/new`        | RoleCreateView       | `requiresAuth, requiredPermission`        |
| `/roles/:id/edit`   | RoleEditView         | `requiresAuth, requiredPermission`        |

### Guard (`beforeEach`)

```
1. ¿La ruta requiere auth y NO hay token?
   → Redirigir a /login

2. ¿El usuario está en /login y YA tiene token?
   → Redirigir a /home

3. ¿Está autenticado y la ruta requiere auth?
   → Llamar auth.fetchMe() si auth.user es null
     ├─ Éxito → continuar navegación
     └─ Error → redirigir a /login

4. Si nada de lo anterior → permitir navegación
```

**IMPORTANTE:** El `beforeEach` es async. Espera a que `fetchMe()` resuelva antes de dejar pasar. Esto asegura que cuando cualquier vista monte, `auth.user` ya tenga los datos del usuario (incluyendo `permissions`).

El meta `requiredPermission` solo es decorativo — la validación de permisos se hace dentro de cada vista con `auth.can()`.

---

## 5. Flujo de Autenticación

### Login (AuthView.vue)

```
Usuario ingresa email
  → Si el email existe, pide password
  → Si no existe, muestra formulario de registro

Submit:
  → authStore.login(email, password)
  → API POST /auth/login
  → Guarda tokens en localStorage
  → Si needsOrg → redirige a /profile
  → Si no → redirige a /home
```

### Google OAuth

```
GoogleSignIn.vue carga Google Identity Services
  → Usuario hace clic en botón de Google
  → Recibe idToken
  → authStore.loginWithGoogle(idToken)
  → API POST /auth/google
  → Mismo flujo que login
```

### Token Refresh (automático)

```
Cada request va con interceptor que agrega Bearer token.

Si la respuesta es 401 (y no es una llamada de auth):
  → Se intenta refresh con POST /auth/refresh
  → Si funciona → se reemplazan tokens y se reintenta la request original
  → Si falla → se limpian tokens y redirige a /login

El refresh está deduplicado: si múltiples llamadas fallan 401 al mismo tiempo,
solo una hace el refresh y las demás esperan.
```

### Logout

```
authStore.logout()
  → clearTokens() (elimina accessToken y refreshToken de localStorage)
  → user.value = null
  → needsOrg = false
```

---

## 6. Flujo de Permisos

### Carga de permisos

```
router.beforeEach (si hay token y ruta protegida)
  → auth.fetchMe()
  → GET /auth/me
  → auth.user.permissions = string[] (ej: ["user:read", "user:assign_role"])
```

### Verificación en vistas

```ts
const canAssign = computed(() => auth.can('user:assign_role'));
```

`auth.can()` internamente hace:

```ts
function can(permission: string): boolean {
  const perms = (user.value as Record<string, unknown>)?.permissions;
  return Array.isArray(perms) ? perms.includes(permission) : false;
}
```

**REGLAS:**
- `canAssign` debe ser SIEMPRE `computed()`, nunca un valor plano.
- No llamar `auth.fetchMe()` en vistas individuales — el router ya lo hace.
- El store de auth es Singleton: cualquier cambio en `auth.user` reactive todas las vistas que usen `can()` dentro de un `computed`.

### Dónde se usa `can()`:

| Componente/Vista              | Permiso chequeado      |
|-------------------------------|------------------------|
| AppNavigationDrawer           | Filtra ítems del menú  |
| EmployeesListView             | `user:invite`, `user:assign_role` |
| EmployeeDetailView            | `user:assign_role`     |
| RolesListView                 | `user:assign_role`     |

---

## 7. Flujo de Empleados

### Listar empleados (EmployeesListView.vue)

```
onMounted:
  1. Si emp.list está vacío → emp.fetch() (GET /users)
  2. rolesStore.fetch() (GET /roles) — para mostrar badges de roles

Template:
  - Tabla con email, nombre, roles (RoleBadge), estado
  - Botón "Invitar" si canInvite
  - Botón de gestión de roles si canAssignRole
```

### Invitar empleado (InviteEmployeeDialog.vue + EmployeesListView.vue)

```
Botón "Invitar" en EmployeesListView
  → Navega a /employees/invite (misma vista, abre v-dialog)
  → Diálogo con Email + RoleSelect (excluye system roles)
  → Submit → emp.invite(email, roleId) → POST /users/invite
  → Éxito → alerta → cierra diálogo → vuelve a /employees
```

### Detalle y asignar roles (EmployeeDetailView.vue)

```
onMounted:
  1. Si emp.list vacío → emp.fetch()
  2. rolesStore.fetch()
  3. Sincroniza selectedRoleIds con los roles actuales del empleado

Template:
  - Info del empleado (email, nombre, estado, roles actuales)
  - Si canAssign → v-card con v-select multiple de roles + botón "Actualizar roles"

Asignar:
  - emp.assignRole(props.id, selectedRoleIds) → POST /users/:userId/roles
```

---

## 8. Flujo de Roles

### Listar roles (RolesListView.vue)

```
onMounted:
  - rolesStore.fetch()

Template:
  - Grid de tarjetas con nombre, descripción, permisos (chips)
  - Si canAssign → botón "Nuevo rol"
  - Click en rol → navega a edición si canAssign
```

### Crear rol (RoleCreateView.vue)

```
onMounted:
  - rolesStore.fetchPermissions() → GET /permissions

Formulario:
  - Nombre, descripción, PermissionSelector (tree de permisos agrupados por resource)
  - Submit → rolesStore.create(name, description, permissionCodes) → POST /roles
  - Éxito → redirige a /roles/:id/edit
```

### Editar rol (RoleEditView.vue)

```
Props: id

onMounted:
  - rolesStore.fetch() (para encontrar el rol por ID)
  - rolesStore.fetchPermissions()

Template:
  - Muestra nombre, descripción, isSystem
  - PermissionSelector con permisos actuales precargados
  - Botón "Guardar" → rolesStore.updatePermissions(id, codes) → PATCH /roles/:id/permissions
```

---

## 9. Flujo de Subida de Archivos (presigned URL)

```
1. ImageUploader recibe archivo por drag-and-drop o click
2. Llama a POST /files/presigned con resourceType, resourceId, category, etc.
3. Recibe presignedUrl + fields
4. Sube el archivo directamente con PUT a presignedUrl
5. Calcula SHA-256 del archivo
6. Confirma con PATCH /files/:fileId/confirm enviando el checksum
7. Emite upload-success con los fileIds
```

Usado actualmente solo para avatares en `ProfileView.vue` y `AppTopBar.vue`.

---

## 10. Stores — Responsabilidades Clave

### authStore
- `user: UserSummary | null` — datos del usuario autenticado
- `fetchMe()` — obtiene perfil + permisos desde GET /auth/me
- `can(perm)` — chequea si el usuario tiene un permiso
- `needsOrg` — si el usuario necesita completar perfil (organización)

### employeeStore
- `list: EmployeeSummary[]` — lista de empleados
- `fetch()` — GET /users
- `invite(email, roleId)` — POST /users/invite
- `assignRole(userId, roleIds)` — POST /users/:userId/roles

### roleStore
- `list: RoleSummary[]` — lista de roles
- `permissions: PermissionItem[]` — lista de permisos disponibles
- `fetch()` — GET /roles
- `fetchPermissions()` — GET /permissions
- `create(name, description, codes)` — POST /roles
- `updatePermissions(roleId, codes)` — PATCH /roles/:id/permissions

### uiStore
- `drawer: boolean` — estado del drawer
- `rail: boolean` — modo rail (colapsado/expandido)

---

## 11. Convenciones para la IA

### Al crear una vista nueva:

1. Definir ruta en `router/index.ts` con `meta: { requiresAuth: true }`
2. El `beforeEach` ya carga `auth.user` automáticamente
3. Usar `computed()` para cualquier valor basado en `auth.can()`
4. NO llamar `auth.fetchMe()` — ya lo hace el router guard
5. NO hacer fetching en `onMounted` de datos que no se necesiten inmediatamente (revisar stores)

### Al usar `can()`:

```ts
// ✅ Correcto
const canDoX = computed(() => auth.can('permiso'));

// ❌ Incorrecto — no es reactivo
const canDoX = auth.can('permiso');
```

### Al modificar stores:

- Los stores son singletons de Pinia — cualquier cambio es reactivo en todos los componentes que lo usen
- No resetear el estado manualmente a menos que sea necesario (ej: logout)

### Traducciones:

- Usar `$t()` en templates o `t()` del composable `useI18n` en script
- Agregar keys en `i18n/es.json`, `en.json`, `fr.json`

### Errores:

- Capturar con `extractError(e)` de `utils/error.ts`
- Mostrar con `v-alert` y `emp.error` / variable local

---

## 12. Errores Comunes a Evitar

| Error | Solución |
|-------|----------|
| `canAssign` evaluado como valor plano, no reactive | Usar `computed()` |
| Llamar `fetchMe()` en cada vista | Ya lo hace el router guard |
| Olvidar que `auth.user` es `null` al inicio | El guard espera a que cargue |
| No limpiar errores del store entre operaciones | Setear `store.error = null` |
| Importaciones con ruta relativa larga | Usar alias `@/` |
| Poner lógica de permisos en el template | Usar `computed` en script |
| Hacer fetch de datos que otro store ya tiene | Revisar stores primero |
