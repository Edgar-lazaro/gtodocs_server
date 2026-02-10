import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);

  const gerenciaId = Number(args[0] ?? 2);
  const nombreClave = args[1] ?? 'TICS_DUMMY_001';
  const placas = args[2] ?? 'DUMMY-001';
  const marca = args[3] ?? 'DUMMY';
  const modelo = args[4] ?? 'DUMMY';

  if (!Number.isFinite(gerenciaId)) {
    console.error('Uso: npx ts-node scripts/seed-vehiculo-tics-dummy.ts [gerenciaId=2] [nombre_clave] [placas] [marca] [modelo]');
    process.exit(1);
  }

  const ger = await prisma.gerencias.findUnique({
    where: { id: gerenciaId },
    select: { id: true, nombre: true },
  });

  if (!ger) {
    console.error(`No existe gerencia id=${gerenciaId} en la tabla gerencias`);
    process.exit(1);
  }

  const vehiculo = await prisma.vehiculos.upsert({
    where: { nombre_clave: nombreClave },
    create: {
      marca,
      modelo,
      placas,
      gerencia: ger.nombre,
      nombre_clave: nombreClave,
    },
    update: {
      marca,
      modelo,
      placas,
      gerencia: ger.nombre,
    },
    select: { id: true, nombre_clave: true, placas: true, gerencia: true },
  });

  console.log('OK vehiculo dummy:', { vehiculo, gerencia: ger });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
