# Caja web (`pos.noahsolution.com`)

Vender y facturar desde el navegador de una laptop. **No es el POS de escritorio** (`pos/`, con base local, sincronización y
emparejamiento): no lo reemplaza ni lo toca. Aquí hay internet siempre, así que no hay modo sin conexión.

## Cómo funciona con varias organizaciones

No hay nada que configurar por organización. Cada cajero entra con su correo y contraseña; su JWT trae la organización y el gateway
filtra todo por ella (catálogo, clientes, puntos de emisión, facturas). Un mismo dominio sirve a todas las empresas.

Hoy un usuario pertenece a **una** organización. Que una misma persona maneje varias (un contador) exigiría membresías y cambio de
organización con un token nuevo: no existe y no se hizo aquí.

## Piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| Pantalla de caja | `src/views/pos/PosView.vue` + `src/components/pos/` | Cabecera, catálogo con categorías, carrito, cobro, barra de estado |
| Aspecto | `src/styles/pos-kiosk.css`, `src/utils/pos-theme.ts`, `src/stores/posCashierTheme.ts` | Mismo diseño y mismo tema que la caja de escritorio (ver «Aspecto») |
| Estado de la venta | `src/stores/pos.ts` | Carrito, id de venta, borrador, cobro |
| Totales | `src/utils/pos-totals.ts` | Mismo cálculo que billing (ver abajo) |
| Modo por dominio | `src/utils/host-mode.ts` + `router/index.ts` | En `pos.` solo existe la caja |
| Facturar | `POST /invoices/from-pos` (billing-service) | Crea y emite la factura en una transacción |

El mismo bundle se sirve en `crm.` y `pos.`. En `pos.` el router lleva cualquier ruta a `/pos` (el CRM no existe allí) y la caja se
muestra sin menú lateral. En `crm.` la caja es la ruta `/pos`, con su ítem en el menú (módulo `pos.core`, permiso `invoice:create`).

## Aspecto: igual que la caja de escritorio

La pantalla replica la de `pos/frontend` (cabecera con la marca «POS KIOSKO», buscador con botón de imágenes, categorías en píldoras,
tarjetas de producto, carrito con cliente, líneas con − cantidad +, IVA por tarifa y «Cobrar», modal «Confirmar cobro», barra de estado).
Cambios que son de la web y no de la caja instalada: el descuento es **por línea** (billing lo guarda así; en escritorio es global), el
chip de la cabecera muestra el punto de emisión en lugar del estado de sincronización, y no hay «Historial» ni apagar el equipo.

Se pinta con el **tema de la organización**: `GET /establishments/:e/billing-points/:p/theme` (el mismo endpoint de la caja de
escritorio). Cada punto recibe el override que tenga o, si no, el tema predeterminado de la organización o el integrado. Para que un punto
`web` pueda pedirlo, `organization-service` dejó de exigir que el punto sea de tipo `pos` al **leer** el tema (asignar un override sigue
siendo solo para puntos `pos`). El cajero necesita `organization:read`; sin él se ve con el tema «Clásico». El dólar se escribe `$12.50`,
como en escritorio.

Las fuentes del tema (Inter, Poppins…) no se descargan en la web: si la familia no está en el equipo, se usa la del sistema.

## La venta: idempotencia

`from-pos` es idempotente por (`terminalId`, `posSaleId`). La caja crea el `posSaleId` al agregar el primer producto y **no lo cambia
hasta que la factura sale con éxito**. Si se cae la red justo después de que billing guardó la factura, «Reintentar» manda el mismo
id y billing devuelve la misma factura. El `terminalId` (`web-xxxxxxxx`) identifica el navegador y se guarda en `localStorage`.

El borrador (carrito, cliente, forma de pago, id de venta) se guarda en `localStorage` **por usuario y organización**: recargar a
mitad de una venta no lo pierde, y otra persona en el mismo equipo no ve el de la anterior. Una venta facturada no deja borrador.

## Totales

`lineTotals` replica `add-line-in-transaction.ts` de billing: la línea guarda importes sin impuestos; si el precio incluye IVA se le
quita primero al precio unitario y al descuento (cada uno redondeado) y el impuesto se calcula una vez sobre la base. Si algo
cambia en el CRM entre tanto, la factura vale por lo que calcula el servidor, la diferencia queda en `posTotalsDiffCents` y la caja
lo avisa. Las tarifas salen de `GET /tax-rates` y de los impuestos del producto (`GET /products/:id`); si alguna no se resuelve el
producto no se agrega (el total saldría mal). Un producto sin precio no se puede vender (billing lo rechaza).

## Forma de pago

La caja ofrece los códigos de la Tabla 24 del SRI: `01` efectivo, `16` débito, `19` crédito, `20` transferencia. Viaja en
`paymentMethodCode`; billing la guarda (`invoices.payment_method_code`) y la manda en el evento `billing.invoice.issued`;
`fiscal-ecuador` ya la lee del evento (sin ella usa `01`, así que las facturas del CRM no cambian). En efectivo se calcula el vuelto.

## Permisos del cajero

Para usarla, el rol necesita: `invoice:create` e `invoice:issue` (billing exige ambos en `from-pos`), `product:read`, `customer:read` y
`establishment:read` (para elegir el punto de emisión) y, para ver el tema de su organización, `organization:read`. La organización necesita el módulo `pos.core` activo. Si falta algo, en `pos.` la
persona ve una pantalla que lo explica (`/pos/unavailable`) en vez de rebotar entre rutas.

## Punto de emisión

Cada equipo elige al empezar un establecimiento y un punto de emisión **de tipo `web`** (los `pos` son de las cajas de escritorio emparejadas).
Cada punto tiene su propia numeración, así que lo ideal es uno por computador; dos equipos sobre el mismo punto funcionan pero se
pelean por la secuencia. Se recuerda por usuario y organización.

## Puesta en marcha del dominio (infraestructura)

1. **Cloudflare**: en el túnel, añadir el hostname público `pos.noahsolution.com` → `http://localhost:80` (igual que `crm`).
2. **Ingress** (`k8s/ingress.yaml`, cifrado con SOPS): añadir una regla para el host `pos.noahsolution.com` que apunte al mismo servicio del
   frontend. Se edita con `sops` en el servidor (ahí está la clave age).
3. **Gateway**: `CORS_ORIGIN` ya incluye `https://pos.noahsolution.com` en `api-gateway-node/k8s/deployment.yaml`.

Orden de despliegue: `billing-service` (migración que añade una columna nula), `organization-service` (el tema para puntos web), `api-gateway-node` y por último `frontend`.

## Lo que no hace (todavía)

- **Sin modo sin conexión.** Sin internet no se factura.
- **Sin arqueo de caja** (apertura y cierre de turno): vive solo en el POS de escritorio.
- **Sin RIDE ni impresión**: la autorización del SRI es asíncrona y su PDF es de otro servicio (`/fiscal-invoices/:id/ride`); la caja muestra
  el número de factura y el total.
- **Pensada para laptop.** En un teléfono funciona, pero el carrito queda debajo del catálogo.
- **Sin descuento global** (solo por línea) ni «Historial» de ventas.
