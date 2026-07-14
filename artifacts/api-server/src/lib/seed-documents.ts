/**
 * Seeds default business config and document templates on first boot.
 * Safe to call multiple times — uses "upsert-if-empty" logic.
 */
import { db } from "@workspace/db";
import { businessConfigTable, documentTemplatesTable } from "@workspace/db";

const DEFAULT_TEMPLATES = [
  {
    name: "Piccolo Clásico",
    documentType: "ticket",
    printFormat: "thermal_80mm",
    isBuiltIn: true,
    config: {
      fontFamily: "monospace",
      fontSize: 14,
      headerAlign: "center",
      showLogo: true,
      logoSize: "medium",
      showWeb: false,
      showPhone: true,
      showEmail: false,
      marginTop: 4,
      marginBottom: 4,
      separatorChar: "-",
      headerText: "",
      footerText: "¡Gracias por su visita!",
      showQrCommercial: false,
    },
  },
  {
    name: "Piccolo Moderno",
    documentType: "ticket",
    printFormat: "thermal_80mm",
    isBuiltIn: true,
    config: {
      fontFamily: "sans-serif",
      fontSize: 13,
      headerAlign: "center",
      showLogo: true,
      logoSize: "large",
      showWeb: true,
      showPhone: true,
      showEmail: false,
      marginTop: 6,
      marginBottom: 6,
      separatorChar: "=",
      headerText: "",
      footerText: "Síguenos en redes sociales",
      showQrCommercial: true,
    },
  },
  {
    name: "Piccolo Minimalista",
    documentType: "ticket",
    printFormat: "thermal_80mm",
    isBuiltIn: true,
    config: {
      fontFamily: "monospace",
      fontSize: 12,
      headerAlign: "left",
      showLogo: false,
      logoSize: "small",
      showWeb: false,
      showPhone: false,
      showEmail: false,
      marginTop: 2,
      marginBottom: 2,
      separatorChar: " ",
      headerText: "",
      footerText: "",
      showQrCommercial: false,
    },
  },
  {
    name: "Ticket Cocina",
    documentType: "comanda",
    printFormat: "thermal_80mm",
    isBuiltIn: true,
    config: {
      fontFamily: "monospace",
      fontSize: 18,
      headerAlign: "center",
      showLogo: false,
      logoSize: "small",
      showWeb: false,
      showPhone: false,
      showEmail: false,
      marginTop: 2,
      marginBottom: 4,
      separatorChar: "=",
      headerText: "** COCINA **",
      footerText: "",
      showQrCommercial: false,
    },
  },
  {
    name: "Delivery",
    documentType: "recogida",
    printFormat: "thermal_80mm",
    isBuiltIn: true,
    config: {
      fontFamily: "sans-serif",
      fontSize: 14,
      headerAlign: "center",
      showLogo: true,
      logoSize: "medium",
      showWeb: false,
      showPhone: true,
      showEmail: false,
      marginTop: 4,
      marginBottom: 4,
      separatorChar: "-",
      headerText: "PEDIDO PARA RECOGER",
      footerText: "Le avisaremos cuando esté listo",
      showQrCommercial: false,
    },
  },
];

export async function seedDocuments(): Promise<void> {
  // Seed business config
  const existingConfig = await db.select().from(businessConfigTable).limit(1);
  if (existingConfig.length === 0) {
    await db.insert(businessConfigTable).values({
      nombreComercial: "Piccolo La Ràpita",
      razonSocial: "Piccolo La Ràpita S.L.",
      nif: "",
      direccionFiscal: "",
      codigoPostal: "",
      poblacion: "La Ràpita",
      provincia: "Tarragona",
      pais: "España",
      telefono: "",
      email: "",
      web: "",
      logoUrl: "",
    });
    console.log("[seed] business_config created for Piccolo La Ràpita");
  }

  // Seed default templates
  const existingTemplates = await db.select().from(documentTemplatesTable).limit(1);
  if (existingTemplates.length === 0) {
    for (const t of DEFAULT_TEMPLATES) {
      await db.insert(documentTemplatesTable).values({
        ...t,
        isDefault: t.name === "Piccolo Clásico", // first ticket template is default
      });
    }
    console.log(`[seed] ${DEFAULT_TEMPLATES.length} default document templates created`);
  }
}
