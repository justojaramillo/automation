// Generación de los DATOS de las facturas (sin dibujar nada todavía).
// Todo es determinista a partir de la semilla y NO usa ningún LLM: cero tokens.
// Los nombres y NIT son ficticios; los NIT llevan dígito de verificación válido.

import { fakerES as faker } from "@faker-js/faker";
import { createHash } from "node:crypto";
import { calcularDv } from "../../src/lib/ocr/nit";

// ── Reglas tributarias (parametrizadas; verifícalas con un contador si cambian) ──
export const IVA_TARIFA = 0.19; // tarifa general de IVA
// Impuesto nacional al consumo (INC) de telefonía móvil, datos e internet móvil.
// Se liquida sobre el valor del servicio SIN IVA y convive con el IVA (concepto DIAN).
// Nota: para datos/internet móvil el 4 % aplica sobre lo que exceda 1,5 UVT mensuales;
// aquí se simplifica aplicándolo sobre todo el servicio. Ver CLAUDE.md.
export const INC_TARIFA = 0.04;

export type Sector = "tecnologia" | "papeleria" | "ferreteria" | "servicios" | "movil";
export type Calidad = "limpia" | "media" | "mala";
export type FormatoFecha = "dmy" | "iso" | "largo";

/**
 * Facturas con un problema DELIBERADO para que siempre necesiten a una persona (revisión manual):
 *  - total-no-cuadra: el emisor imprimió un total distinto de subtotal + IVA + impoconsumo.
 *  - iva-tarifa: ítems con IVA al 5 % o exentos (algo real en Colombia): el IVA no es el 19 %.
 *  - dv-cliente: el NIT del cliente trae un dígito de verificación equivocado.
 *  - girada: la imagen está girada 90°, 180° o 270° (el OCR no lee texto girado; una persona la gira y la lee).
 */
export type Problema = "total-no-cuadra" | "iva-tarifa" | "dv-cliente" | "girada";
export const TIPOS_PROBLEMA: readonly Problema[] = ["total-no-cuadra", "iva-tarifa", "dv-cliente", "girada"];

export interface Persona {
  documento: string; // 9 dígitos, sin DV
  dv: number;
  nombre: string; // razón social o nombre
}

export interface Resolucion {
  numero: string;
  fecha: string; // yyyy-mm-dd
  prefijo: string;
  desde: number;
  hasta: number;
}

export interface Proveedor extends Persona {
  sector: Sector;
  direccion: string;
  ciudad: string;
  telefono: string;
  responsabilidad: string;
  resolucion: Resolucion;
}

export interface Item {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  tarifaIva: number; // 0.19
  tarifaInc: number; // 0.04 solo en móvil, si no 0
}

export interface Factura {
  archivo: string; // se asigna al final (factura_0001.png)
  numero: string; // FE-000123
  fecha: string; // yyyy-mm-dd
  hora: string; // HH:mm:ss
  fechaVencimiento: string; // yyyy-mm-dd
  formaPago: string;
  medioPago: string;
  proveedor: Proveedor;
  cliente: Persona;
  items: Item[];
  subtotal: number; // valor antes de IVA
  iva: number;
  impoconsumo: number; // 0 si no es móvil
  total: number;
  cufe: string;
  esMovil: boolean;
  diseno: number; // 0..3
  formatoFecha: FormatoFecha;
  calidad: Calidad;
  /** `null` en las facturas normales. */
  problema: Problema | null;
  /** Grados que se gira la imagen al guardarla (solo en las «giradas»). */
  rotacion: 0 | 90 | 180 | 270;
  /** Total aritméticamente correcto (solo en «total-no-cuadra»; `total` es el IMPRESO, equivocado). */
  totalCorrecto?: number;
  /** Dígito de verificación correcto del cliente (solo en «dv-cliente»; `cliente.dv` es el IMPRESO, equivocado). */
  dvCorrecto?: number;
}

// ── Catálogos: [descripción, precio mínimo, precio máximo, cantidad máxima] ──
type Producto = readonly [string, number, number, number];

const CATALOGO: Record<Exclude<Sector, "movil">, readonly Producto[]> = {
  tecnologia: [
    ['Portátil 14" Core i5 16 GB RAM 512 GB SSD', 2_400_000, 4_200_000, 5],
    ["Monitor LED 24 pulgadas Full HD", 550_000, 950_000, 8],
    ["Teclado mecánico inalámbrico español", 120_000, 380_000, 10],
    ["Mouse óptico inalámbrico ergonómico", 35_000, 120_000, 20],
    ["Impresora multifuncional láser monocromática con red", 780_000, 1_650_000, 3],
    ["Disco de estado sólido SSD 1 TB", 280_000, 520_000, 10],
    ["Switch de red gestionable 24 puertos Gigabit", 650_000, 1_400_000, 3],
    ["Router Wi-Fi 6 doble banda", 220_000, 480_000, 6],
    ["UPS interactiva 1000 VA", 380_000, 720_000, 4],
    ["Cable HDMI 2.0 de 2 metros", 18_000, 45_000, 30],
  ],
  papeleria: [
    ["Resma de papel carta 75 g, 500 hojas", 14_000, 22_000, 100],
    ["Caja de bolígrafos tinta negra x 12 unidades", 9_000, 18_000, 40],
    ["Carpeta archivadora A-Z oficio lomo ancho", 7_500, 14_000, 60],
    ["Tóner negro compatible para impresora láser", 95_000, 210_000, 8],
    ["Block de notas adhesivas x 12 paquetes de colores", 16_000, 32_000, 30],
    ["Marcadores borrables para tablero x 4 colores", 8_000, 15_000, 40],
    ["Cuaderno argollado cuadriculado 100 hojas", 4_500, 9_000, 80],
    ["Archivador de palanca tamaño oficio", 11_000, 19_000, 50],
  ],
  ferreteria: [
    ["Cemento gris uso general bolsa x 50 kg", 28_000, 36_000, 200],
    ["Taladro percutor 650 W con maletín y brocas", 160_000, 340_000, 6],
    ["Caja de tornillos autoperforantes x 100 unidades", 8_000, 17_000, 50],
    ["Pintura vinilo tipo 1 blanco galón", 58_000, 96_000, 30],
    ["Varilla corrugada 3/8 pulgada x 6 metros", 22_000, 34_000, 150],
    ["Guantes de seguridad de carnaza par", 9_000, 16_000, 40],
    ["Casco de seguridad con suspensión de 4 puntos", 18_000, 38_000, 25],
    ["Cinta métrica 8 metros con freno", 12_000, 26_000, 20],
  ],
  servicios: [
    ["Mantenimiento preventivo de equipos de cómputo", 85_000, 160_000, 30],
    ["Soporte técnico remoto, plan mensual", 450_000, 1_200_000, 3],
    ["Asesoría contable por horas", 120_000, 260_000, 40],
    ["Instalación y configuración de red estructurada, por punto", 90_000, 170_000, 24],
    ["Licencia anual de software de oficina por usuario", 380_000, 720_000, 25],
    ["Capacitación en herramientas ofimáticas, sesión de 4 horas", 300_000, 650_000, 6],
  ],
};

const CATALOGO_MOVIL: readonly Producto[] = [
  ["Plan postpago móvil 25 GB y voz ilimitada, línea corporativa", 55_000, 110_000, 40],
  ["Plan corporativo móvil 50 GB redes sociales ilimitadas", 85_000, 150_000, 25],
  ["Paquete adicional de datos móviles 10 GB", 20_000, 38_000, 30],
  ["Minutos adicionales a todo destino nacional", 12_000, 30_000, 20],
  ["Paquete de roaming internacional semanal", 60_000, 120_000, 10],
];

const PREFIJOS_PROVEEDOR: Record<Sector, readonly string[]> = {
  tecnologia: ["Tecnosistemas", "Compuredes", "Digitalware", "Infotec", "Soluciones TI"],
  papeleria: ["Papelería", "Distribuciones Escolares", "Suministros de Oficina", "Útiles y Papeles"],
  ferreteria: ["Ferretería", "Materiales y Construcciones", "Distribuidora de Acabados", "Ferrosuministros"],
  servicios: ["Consultores", "Asesorías Integrales", "Servicios Profesionales", "Gestión Empresarial"],
  movil: ["Comunicaciones Móviles", "Telefonía Celular", "Redes Móviles", "Operadora de Telecomunicaciones"],
};

const CIUDADES = ["Bogotá D.C.", "Medellín", "Cali", "Barranquilla", "Bucaramanga", "Cartagena", "Pereira", "Manizales"] as const;
const SUFIJOS = ["S.A.S.", "S.A.S.", "S.A.S.", "S.A.", "Ltda."] as const;
const PALABRAS_CLIENTE = ["Inversiones", "Comercializadora", "Grupo", "Corporación", "Distribuciones", "Servicios", "Constructora", "Agroindustrias"] as const;
const MEDIOS_PAGO = ["Transferencia débito bancaria", "Tarjeta de crédito", "Efectivo", "Consignación bancaria"] as const;

// ── Utilidades ──
const pad = (n: number, largo: number): string => String(n).padStart(largo, "0");
const redondear = (n: number, paso: number): number => Math.round(n / paso) * paso;

function documentoNuevo(usados: Set<string>): string {
  for (;;) {
    const d = String(faker.number.int({ min: 800_000_000, max: 901_999_999 }));
    if (!usados.has(d)) {
      usados.add(d);
      return d;
    }
  }
}

function persona(nombre: string, usados: Set<string>): Persona {
  const documento = documentoNuevo(usados);
  return { documento, dv: calcularDv(documento), nombre };
}

function nombreProveedor(sector: Sector): string {
  const prefijo = faker.helpers.arrayElement(PREFIJOS_PROVEEDOR[sector]);
  const apellido = faker.person.lastName();
  return `${prefijo} ${apellido} ${faker.helpers.arrayElement(SUFIJOS)}`;
}

function nombreCliente(): string {
  // 25 % personas naturales con NIT (comerciantes), 75 % empresas.
  if (faker.number.int({ min: 1, max: 100 }) <= 25) {
    return `${faker.person.firstName()} ${faker.person.lastName()} ${faker.person.lastName()}`;
  }
  const palabra = faker.helpers.arrayElement(PALABRAS_CLIENTE);
  return `${palabra} ${faker.person.lastName()} ${faker.helpers.arrayElement(SUFIJOS)}`;
}

function crearProveedor(sector: Sector, usados: Set<string>): Proveedor {
  const base = persona(nombreProveedor(sector), usados);
  const desde = 1;
  const hasta = faker.helpers.arrayElement([5_000, 10_000, 50_000]);
  return {
    ...base,
    sector,
    direccion: `${faker.helpers.arrayElement(["Cra", "Calle", "Av.", "Diag."])} ${faker.number.int({ min: 1, max: 120 })} # ${faker.number.int({ min: 1, max: 99 })}-${faker.number.int({ min: 1, max: 99 })}`,
    ciudad: faker.helpers.arrayElement(CIUDADES),
    telefono: `60${faker.number.int({ min: 1, max: 8 })} ${faker.number.int({ min: 2_000_000, max: 7_999_999 })}`,
    responsabilidad: "Responsable de IVA",
    resolucion: {
      numero: `18764${faker.string.numeric(9)}`,
      fecha: `2026-0${faker.number.int({ min: 1, max: 2 })}-${pad(faker.number.int({ min: 1, max: 28 }), 2)}`,
      prefijo: "FE",
      desde,
      hasta,
    },
  };
}

function crearItems(sector: Sector): Item[] {
  const catalogo = sector === "movil" ? CATALOGO_MOVIL : CATALOGO[sector];
  const cuantos = faker.number.int({ min: 1, max: Math.min(6, catalogo.length) });
  const elegidos = faker.helpers.arrayElements(catalogo, cuantos);
  return elegidos.map(([descripcion, min, max, maxCantidad]) => {
    const precioUnitario = redondear(faker.number.int({ min, max }), 100);
    const cantidad = faker.number.int({ min: 1, max: maxCantidad });
    return {
      descripcion,
      cantidad,
      precioUnitario,
      subtotal: cantidad * precioUnitario,
      tarifaIva: IVA_TARIFA,
      tarifaInc: sector === "movil" ? INC_TARIFA : 0,
    };
  });
}

/** Totales con redondeo al peso: el IVA y el INC se liquidan sobre el valor antes de IVA. */
export function calcularTotales(items: readonly Item[]): { subtotal: number; iva: number; impoconsumo: number; total: number } {
  const subtotal = items.reduce((suma, it) => suma + it.subtotal, 0);
  const iva = Math.round(items.reduce((suma, it) => suma + it.subtotal * it.tarifaIva, 0));
  const impoconsumo = Math.round(items.reduce((suma, it) => suma + it.subtotal * it.tarifaInc, 0));
  return { subtotal, iva, impoconsumo, total: subtotal + iva + impoconsumo };
}

/**
 * CUFE simulado con la misma estructura de la DIAN:
 * SHA-384( NumFac + FecFac + HorFac + ValFac + 01 + ValIVA + 04 + ValINC + 03 + ValICA
 *          + ValTot + NitOFE + NumAdq + ClaveTécnica + TipoAmbiente ).
 * La clave técnica es ficticia, así que NO es un CUFE verificable ante la DIAN.
 */
function calcularCufe(f: Omit<Factura, "cufe">): string {
  const dos = (n: number): string => n.toFixed(2);
  const cadena =
    f.numero + f.fecha + f.hora + dos(f.subtotal) +
    "01" + dos(f.iva) + "04" + dos(f.impoconsumo) + "03" + dos(0) +
    dos(f.total) + f.proveedor.documento + f.cliente.documento +
    "clave-tecnica-ficticia" + "2";
  return createHash("sha384").update(cadena).digest("hex");
}

function fechaAleatoria(): { fecha: string; hora: string; date: Date } {
  const date = faker.date.between({ from: "2026-01-02T00:00:00Z", to: "2026-10-30T00:00:00Z" });
  const fecha = date.toISOString().slice(0, 10);
  const hora = `${pad(faker.number.int({ min: 7, max: 19 }), 2)}:${pad(faker.number.int({ min: 0, max: 59 }), 2)}:${pad(faker.number.int({ min: 0, max: 59 }), 2)}`;
  return { fecha, hora, date };
}

export interface Opciones {
  cantidad: number;
  semilla: number;
}

export interface ConjuntoDatos {
  facturas: Factura[]; // en orden final (ya mezclado), con `archivo` pendiente de extensión
  clientes: Persona[];
}

const FRACCION_CLIENTES_DISTINTOS = 0.85; // 850 de 1000
const FRACCION_MOVIL = 0.15;
const FRACCION_LIMPIA = 0.6;
const FRACCION_MEDIA = 0.3; // el resto es "mala"

export function generarDatos({ cantidad, semilla }: Opciones): ConjuntoDatos {
  faker.seed(semilla);
  const usados = new Set<string>();

  // 1. Clientes: un pool de únicos; las facturas restantes reutilizan clientes ya usados.
  const distintos = Math.max(1, Math.round(cantidad * FRACCION_CLIENTES_DISTINTOS));
  const clientes = Array.from({ length: distintos }, () => persona(nombreCliente(), usados));
  const asignacionClientes: Persona[] = [
    ...clientes,
    ...Array.from({ length: cantidad - distintos }, () => faker.helpers.arrayElement(clientes)),
  ];

  // 2. Proveedores: unos pocos por sector (un proveedor emite muchas facturas).
  const sectoresGenerales: Sector[] = ["tecnologia", "papeleria", "ferreteria", "servicios"];
  const porSector = Math.max(1, Math.round(cantidad / 100));
  const proveedores = new Map<Sector, Proveedor[]>();
  for (const sector of [...sectoresGenerales, "movil" as const]) {
    proveedores.set(sector, Array.from({ length: porSector }, () => crearProveedor(sector, usados)));
  }

  // 3. Sectores por factura: móvil garantizado (al menos 1) y el resto repartido.
  const nMovil = Math.max(1, Math.round(cantidad * FRACCION_MOVIL));
  const sectores: Sector[] = faker.helpers.shuffle(
    Array.from({ length: cantidad }, (_, i): Sector =>
      i < nMovil ? "movil" : faker.helpers.arrayElement(sectoresGenerales),
    ),
  );

  // 4. Calidad y diseño por cuotas (no al azar puro) para que 10 facturas ya cubran todo.
  const nLimpia = Math.round(cantidad * FRACCION_LIMPIA);
  const nMedia = Math.round(cantidad * FRACCION_MEDIA);
  const calidades: Calidad[] = faker.helpers.shuffle([
    ...Array<Calidad>(nLimpia).fill("limpia"),
    ...Array<Calidad>(nMedia).fill("media"),
    ...Array<Calidad>(Math.max(0, cantidad - nLimpia - nMedia)).fill("mala"),
  ]);
  const disenos = faker.helpers.shuffle(Array.from({ length: cantidad }, (_, i) => i % 4));
  const formatos = faker.helpers.shuffle(
    Array.from({ length: cantidad }, (_, i): FormatoFecha => (["dmy", "iso", "largo"] as const)[i % 3]),
  );

  // 5. Números de factura únicos, sin relación con el orden del archivo.
  const numeros = faker.helpers.shuffle(Array.from({ length: cantidad }, (_, i) => i + 1));

  const facturas: Factura[] = sectores.map((sector, i) => {
    const proveedor = faker.helpers.arrayElement(proveedores.get(sector) ?? []);
    const items = crearItems(sector);
    const totales = calcularTotales(items);
    const { fecha, hora, date } = fechaAleatoria();
    const credito = faker.datatype.boolean();
    const vence = new Date(date.getTime() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const parcial: Omit<Factura, "cufe"> = {
      archivo: "",
      numero: `FE-${pad(numeros[i], 6)}`,
      fecha,
      hora,
      fechaVencimiento: credito ? vence : fecha,
      formaPago: credito ? "Crédito 30 días" : "Contado",
      medioPago: faker.helpers.arrayElement(MEDIOS_PAGO),
      proveedor,
      cliente: asignacionClientes[i],
      items,
      ...totales,
      esMovil: sector === "movil",
      diseno: disenos[i],
      formatoFecha: formatos[i],
      calidad: calidades[i],
      problema: null,
      rotacion: 0,
    };
    return { ...parcial, cufe: calcularCufe(parcial) };
  });

  // 6. Orden final mezclado y nombres de archivo sin pistas.
  const mezcladas = faker.helpers.shuffle(facturas);
  mezcladas.forEach((f, i) => {
    f.archivo = `factura_${pad(i + 1, 4)}`; // la extensión depende de la calidad
  });
  asignarProblemas(mezcladas);
  return { facturas: mezcladas, clientes };
}

/**
 * Convierte el 4 % de las facturas (10 de cada tipo con 1000) en casos que SIEMPRE requieren revisión manual.
 * Es DETERMINISTA y no usa el generador aleatorio: así las demás facturas quedan idénticas a las de un conjunto
 * sin problemas. Se eligen repartidas por todo el conjunto y solo entre las de calidad legible (una factura
 * destruida a propósito no la podría leer ni una persona). Las de «dv-cliente» se eligen entre clientes que
 * aparecen en más de una factura, para que ese cliente exista igual (y los 850 clientes distintos se mantengan).
 */
export function asignarProblemas(facturas: Factura[]): void {
  const n = facturas.length;
  if (n < 20) return; // el conjunto pequeño de desarrollo (10 facturas) no lleva problemas
  const porTipo = Math.max(1, Math.round(n * 0.01));
  const usosCliente = new Map<string, number>();
  for (const f of facturas) usosCliente.set(f.cliente.documento, (usosCliente.get(f.cliente.documento) ?? 0) + 1);
  const elegidas = new Set<number>();
  const clientesTocados = new Set<string>();

  const valida = (i: number, tipo: Problema): boolean => {
    const f = facturas[i];
    if (elegidas.has(i) || f.calidad === "mala") return false;
    if (tipo === "dv-cliente") return (usosCliente.get(f.cliente.documento) ?? 0) > 1 && !clientesTocados.has(f.cliente.documento);
    return true;
  };

  let orden = 0;
  for (let k = 0; k < porTipo; k++) {
    for (const tipo of TIPOS_PROBLEMA) {
      const objetivo = Math.floor(((k * TIPOS_PROBLEMA.length + TIPOS_PROBLEMA.indexOf(tipo) + 0.5) * n) / (porTipo * TIPOS_PROBLEMA.length));
      let i = objetivo;
      for (let paso = 0; paso < n && !valida(i, tipo); paso++) i = (i + 1) % n;
      const f = facturas[i];
      elegidas.add(i);
      f.problema = tipo;
      if (tipo === "total-no-cuadra") {
        f.totalCorrecto = f.total;
        f.total += (((orden * 7919) % 40) + 10) * 1000; // entre $10.000 y $49.000 de más, siempre distinto del correcto
      } else if (tipo === "iva-tarifa") {
        // Pares: el primer ítem al 5 %, los demás al 19 % (mixto). Impares: todos exentos (0 %).
        f.items = f.items.map((it, j) => ({ ...it, tarifaIva: orden % 2 === 0 ? (j === 0 ? 0.05 : it.tarifaIva) : 0 }));
        Object.assign(f, calcularTotales(f.items));
      } else if (tipo === "dv-cliente") {
        f.dvCorrecto = f.cliente.dv;
        f.cliente = { ...f.cliente, dv: (f.cliente.dv + 1 + (orden % 8)) % 10 }; // desplazamiento 1..8: nunca coincide con el correcto
        clientesTocados.add(f.cliente.documento);
      } else {
        f.rotacion = ([90, 270, 180] as const)[orden % 3];
      }
      f.cufe = calcularCufe(f); // el CUFE depende de los totales y del cliente impresos
      orden++;
    }
  }
}
