import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extraer, extraerFecha, extraerNumero, normalizarTexto } from "./extractor";
import { validar } from "./validador";

const dir = path.join(__dirname, "__fixtures__");
const esperado = JSON.parse(readFileSync(path.join(dir, "esperado.json"), "utf8")) as Record<
  string,
  { numero: string; fecha: string; nitProveedor: string; clienteDocumento: string; subtotal: number; iva: number; impoconsumo: number; total: number; nItems: number }
>;

describe("facturas reales (texto del OCR de los 4 diseños)", () => {
  for (const [nombre, e] of Object.entries(esperado)) {
    it(`${nombre}: campos y totales correctos, sin motivos de revisión`, () => {
      const p = extraer(readFileSync(path.join(dir, `${nombre}.txt`), "utf8"));
      expect(p.numero).toBe(e.numero);
      expect(p.fecha).toBe(e.fecha);
      expect(p.nitProveedor).toBe(e.nitProveedor);
      expect(p.clienteDocumento).toBe(e.clienteDocumento);
      expect(p.subtotal).toBe(e.subtotal);
      expect(p.iva).toBe(e.iva);
      expect(p.impoconsumo ?? 0).toBe(e.impoconsumo);
      expect(p.total).toBe(e.total);
      expect(p.items).toHaveLength(e.nItems);
      expect(validar(p)).toEqual([]);
    });
  }
});

describe("razón social partida con el título de la factura (textos reales de otra semilla)", () => {
  it('"…FACTURA ELECTRÓNICA DE / S.A.S. VENTA": une las dos líneas y quita el título', () => {
    const p = extraer(readFileSync(path.join(dir, "nuevo_0001.txt"), "utf8"));
    expect(p.proveedor).toBe("Suministros de Oficina Velázquez Santana S.A.S.");
  });
  it('"S.A.S. q" (ruido del título detrás del sufijo): antepone la línea anterior', () => {
    const p = extraer(readFileSync(path.join(dir, "nuevo_0007.txt"), "utf8"));
    expect(p.proveedor).toBe("Suministros de Oficina Velázquez Santana S.A.S.");
  });
});

describe("lección: normalizar el texto del OCR", () => {
  it("une `$496 .000` en `$496.000`", () => {
    expect(normalizarTexto("Total $496 .000")).toBe("Total $496.000");
  });
  it("separa `3$146.500` en `3 $146.500`", () => {
    expect(normalizarTexto("Cable 3$146.500")).toBe("Cable 3 $146.500");
  });
  it("separa cantidad, precio y subtotal pegados (11 × 426.500 = 4.691.500)", () => {
    expect(normalizarTexto("Servidor 119426.500$4.691.500")).toBe("Servidor 11 $426.500 $4.691.500");
  });
  it("no toca cifras pegadas que no cuadran aritméticamente", () => {
    expect(normalizarTexto("Dato 129426.500$4.691.500")).toBe("Dato 129426.500 $4.691.500");
  });
});

describe("lección: fechas y número, sin confundir otras cifras", () => {
  it("toma la fecha de EMISIÓN y no vencimiento ni resolución DIAN (tres formatos)", () => {
    const base = (emision: string) =>
      `Resolución DIAN No. 18764968293943 del 18 de febrero de 2026\nFecha de emisión: ${emision} Fecha de vencimiento: 18 de marzo de 2026`;
    expect(extraerFecha(base("16/02/2026"))).toBe("2026-02-16");
    expect(extraerFecha(base("2026-02-16"))).toBe("2026-02-16");
    expect(extraerFecha(base("16 de febrero de 2026"))).toBe("2026-02-16");
  });
  it("ignora la fecha de la resolución aunque esté sola en su línea (ticket)", () => {
    expect(extraerFecha("Res. DIAN 18764280109817\n17 de febrero de 2026 Pref. FE\nFecha: 9 de julio de 2026 09:19:37")).toBe("2026-07-09");
  });
  it("rechaza fechas imposibles", () => {
    expect(extraerFecha("Fecha de emisión: 31/02/2026")).toBeNull();
  });
  it("el número de factura no es el rango de numeración", () => {
    expect(extraerNumero("Prefijo FE, rango del FE-000001 al FE-050000.\nNo. FE-000123")).toBe("FE-000123");
  });
});

describe("lección: proveedor, NIT y falsos positivos", () => {
  const cabecera = (nitLinea: string) =>
    `Soluciones TI Delafuente Caldera S.A.S. FACTURA ELECTRÓNICA DE VENTA\n${nitLinea}\nAdquirente: Cliente Uno S.A.S. NIT/CC: 894.183.544-3\nFecha de emisión: 16/02/2026\nValor antes de IVA $100.000\nIVA 19% $19.000\nTOTAL $119.000`;
  it("corta la razón social en S.A.S. cuando comparte línea con FACTURA", () => {
    expect(extraer(cabecera("NIT: 883.800.871-5 No. FE-000002")).proveedor).toBe("Soluciones TI Delafuente Caldera S.A.S.");
  });
  it("lee el NIT con y sin puntos", () => {
    expect(extraer(cabecera("NIT: 883.800.871-5")).nitProveedor).toBe("883800871");
    expect(extraer(cabecera("NIT 883800871-5")).nitProveedor).toBe("883800871");
  });
  it("une una razón social partida en dos líneas (LTDA. aparte)", () => {
    const t = "COMUNICACIONES MÓVILES ZÚÑIGA ORTEGA\nLTDA.\nNIT: 821361310-5\nCLIENTE: Otro S.A.S.\nNIT: 845990123-1";
    expect(extraer(t).proveedor).toBe("COMUNICACIONES MÓVILES ZÚÑIGA ORTEGA LTDA.");
  });
  it('"Monitor" no se confunde con la palabra NIT', () => {
    const t = `${cabecera("NIT: 883.800.871-5")}\nMonitor LED 24 pulgadas 2 $350.000 $700.000`;
    const p = extraer(t);
    expect(p.nitProveedor).toBe("883800871");
    expect(p.clienteDocumento).toBe("894183544");
  });
  it("no toma el CUFE ni la resolución (cifras largas) por NIT", () => {
    const t = `${cabecera("NIT: 883.800.871-5")}\nResolución DIAN No. 18764968293943\nCUFE: 17064012ef103205f58510670a23fdd56a21613d8caf`;
    expect(extraer(t).nitProveedor).toBe("883800871");
  });
});

describe("lección: etiquetas de totales pegadas por el OCR", () => {
  it("lee `IVA19%` (sin espacio) y `Imp. consumo 4 %`", () => {
    const t = "Base gravable $100.000\nIVA19% $19.000\nImp. consumo 4 % $4.000\nVALOR TOTAL $123.000";
    const p = extraer(t);
    expect(p.iva).toBe(19000);
    expect(p.impoconsumo).toBe(4000);
    expect(p.total).toBe(123000);
  });
  it('"Responsable de IVA" no se toma como línea de IVA', () => {
    expect(extraer("NIT: 883.800.871-5 - Responsable de IVA\nBase gravable $100.000\nIVA 19% $19.000").iva).toBe(19000);
  });
});

describe("lección: ítems", () => {
  const encabezado = "Soluciones TI S.A.S.\nNIT: 883.800.871-5\nAdquirente: Cliente S.A.S. NIT/CC: 894.183.544-3\n";
  const pie = (sub: number) => `Valor antes de IVA $${sub}\nIVA 19% $0\nTOTAL $${sub}`;
  it("descripción partida: la parte sin cifras viene DESPUÉS de los importes", () => {
    const p = extraer(`${encabezado}Impresora multifuncional láser 3 $1.354.900 $4.064.700\nmonocromática con red\n${pie(4064700)}`);
    expect(p.items).toEqual([{ descripcion: "Impresora multifuncional láser monocromática con red", cantidad: 3, precioUnitario: 1354900, subtotal: 4064700 }]);
  });
  it("descripción partida: la parte sin cifras viene ANTES de los importes", () => {
    const p = extraer(`${encabezado}Paquete adicional de datos móviles 10 GB\n20 x $22.700 $454.000\n${pie(454000)}`);
    expect(p.items).toEqual([{ descripcion: "Paquete adicional de datos móviles 10 GB", cantidad: 20, precioUnitario: 22700, subtotal: 454000 }]);
  });
  it("repara por redundancia aritmética una cantidad mal leída", () => {
    // El OCR leyó "1" en vez de "11": 1 × 426.500 ≠ 4.691.500 pero 4.691.500 / 426.500 = 11.
    const p = extraer(`${encabezado}Servidor rack 1 $426.500 $4.691.500\n${pie(4691500)}`);
    expect(p.items[0].cantidad).toBe(11);
  });
});

describe("validaciones de negocio", () => {
  const ok = {
    numero: "FE-000001", fecha: "2026-01-15", proveedor: "Empresa Uno S.A.S.", nitProveedor: "883800871", dvProveedor: 5,
    clienteDocumento: "894183544", clienteDv: 3, clienteNombre: "Cliente", subtotal: 100000, iva: 19000, impoconsumo: null,
    mencionaImpoconsumo: false, total: 119000,
    items: [{ descripcion: "Cosa", cantidad: 2, precioUnitario: 50000, subtotal: 100000 }],
  };
  it("una factura coherente no tiene motivos", () => expect(validar(ok)).toEqual([]));
  it("detecta ítems que no suman el subtotal", () => {
    expect(validar({ ...ok, subtotal: 90000, iva: 17100, total: 107100 }).join()).toMatch(/ítems suman/);
  });
  it("detecta cantidad × precio ≠ subtotal del ítem", () => {
    expect(validar({ ...ok, items: [{ ...ok.items[0], cantidad: 3 }] }).join()).toMatch(/≠/);
  });
  it("detecta IVA distinto del 19 % (tolerancia de $1)", () => {
    expect(validar({ ...ok, iva: 19001, total: 119001 })).toEqual([]);
    expect(validar({ ...ok, iva: 19500, total: 119500 }).join()).toMatch(/IVA/);
  });
  it("valida impoconsumo = 4 % y total = subtotal + IVA + impoconsumo", () => {
    expect(validar({ ...ok, impoconsumo: 4000, mencionaImpoconsumo: true, total: 123000 })).toEqual([]);
    expect(validar({ ...ok, impoconsumo: 4000, mencionaImpoconsumo: true, total: 119000 }).join()).toMatch(/total/);
    expect(validar({ ...ok, impoconsumo: 5000, mencionaImpoconsumo: true, total: 124000 }).join()).toMatch(/impoconsumo/);
  });
  it("si menciona impoconsumo y no se pudo leer su valor, va a revisión", () => {
    expect(validar({ ...ok, mencionaImpoconsumo: true, total: 123000 }).join()).toMatch(/menciona impoconsumo/);
  });
  it("campos obligatorios ausentes", () => {
    const motivos = validar({ ...ok, numero: null, fecha: null, total: null });
    expect(motivos).toContain("Falta el número de factura");
    expect(motivos).toContain("Falta la fecha de emisión");
    expect(motivos).toContain("Falta el total");
  });
  it("dígito de verificación inválido del cliente y del proveedor", () => {
    expect(validar({ ...ok, clienteDv: 4 }).join()).toMatch(/cliente.*dígito/);
    expect(validar({ ...ok, dvProveedor: 0 }).join()).toMatch(/proveedor.*dígito/);
  });
  it("razón social ilegible", () => {
    expect(validar({ ...ok, proveedor: "S . A . Ss ." }).join()).toMatch(/ilegible/);
  });
});
