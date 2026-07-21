import { listarReportesConductores, getContratos } from './services/reportService.ts';

async function testCall() {
  console.log("=== INICIANDO PRUEBA DE LLAMADO AL SERVICIO ===");
  try {
    const contratos = await getContratos();
    console.log("Contratos disponibles:");
    contratos.forEach(c => {
      console.log(`- ID: ${c.id} | Nombre: "${c.nombre}"`);
    });

    const targetContrato = contratos.find(c => c.nombre.toUpperCase().includes('TIBU') || c.nombre.toUpperCase().includes('VRC'));
    if (!targetContrato) {
      console.log("❌ No se encontró el contrato objetivo.");
      return;
    }

    console.log(`\nContrato objetivo: ID = ${targetContrato.id}, Nombre = "${targetContrato.nombre}"`);

    // Llamar al servicio con el contratoId y el período
    const filtro = {
      contratoId: targetContrato.id,
      fechaInicio: '2026-04-29',
      fechaFin: '2026-05-28'
    };

    console.log(`\nLlamando a listarReportesConductores con:`, filtro);
    const data = await listarReportesConductores(filtro);
    
    console.log(`\nResultado de listarReportesConductores: Total registros devueltos = ${data.length}`);
    if (data.length > 0) {
      console.log("Ejemplo de registro devuelto:");
      console.log(JSON.stringify(data[0], null, 2));
      
      const sumKms = data.reduce((acc, curr) => acc + Number(curr.kms ?? 0), 0);
      console.log(`\nSuma total de Kms devueltos por el servicio para este contrato: ${sumKms}`);
    } else {
      console.log("❌ El servicio devolvió una lista vacía.");
    }

  } catch (err) {
    console.error("❌ Error en la prueba:", err);
  }
}

testCall();
