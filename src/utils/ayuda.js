// src/utils/ayuda.js

export function getAyudaUso() {
  return (
`🧾 Cosas que puedo apuntar por ti:

1️⃣ Compra de material (con ticket)
compra nombre apellido concepto precioCliente precioCoste
ej: compra antonio vargas abono cesped 187,50 90,50

💡 También puedes mandarlo con la foto del ticket (en el pie de foto de la foto).

2️⃣ Trabajo / mano de obra
trabajos nombre apellido concepto importe
ej: trabajos antonio vargas cortar setos 80

3️⃣ Limpieza Mari
mari nombre apellido concepto totalCobrado [costeProductos]
ej: mari antonio vargas limpieza septiembre 58,65 9,15
ej: mari antonio vargas limpieza agosto 49,50

4️⃣ Pago del cliente
paga nombre apellido cantidad
ej: paga antonio vargas 200

5️⃣ Ver extracto del mes
extracto nombre apellido 2025-10

🪄 Nota:
- Antes de guardar nada te preguntaré “¿Lo guardo? (sí / no)”.
- Si dices “no”, no se guarda.
- Si dices “sí”, se guarda y te digo el saldo actual del cliente.`
  );
}
