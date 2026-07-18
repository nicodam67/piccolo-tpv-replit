import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Copy, Download, Check, Printer, Share2, Link } from "lucide-react";

export default function QRShare() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  // Build the public menu URL from the current origin
  const menuUrl = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    if (!canvasRef.current || !menuUrl) return;
    QRCode.toCanvas(canvasRef.current, menuUrl, {
      width: 260,
      margin: 2,
      color: {
        dark: "#1a1a1a",
        light: "#fafaf9",
      },
    }).catch(() => {
      toast.error("Error al generar el código QR");
    });
  }, [menuUrl]);

  function handleCopy() {
    navigator.clipboard.writeText(menuUrl).then(() => {
      setCopied(true);
      toast.success("URL de la carta copiada");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.error("Error al copiar la URL");
    });
  }

  function handleDownloadQR() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "qr-carta.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("Código QR descargado");
  }

  function handleDownloadUrl() {
    const blob = new Blob([menuUrl], { type: "text/plain" });
    const link = document.createElement("a");
    link.download = "url-carta.txt";
    link.href = URL.createObjectURL(blob);
    link.click();
    toast.success("URL descargada como archivo");
  }

  function handlePrint() {
    // Include current locale so print page translates correctly (e.g. /es/imprimir)
    const segments = window.location.pathname.split("/").filter(Boolean);
    const lng = segments[0] && segments[0].length === 2 ? segments[0] : "es";
    const printUrl = `${window.location.origin}/${lng}/imprimir`;
    const win = window.open(printUrl, "_blank");
    if (!win) {
      toast.error("No se pudo abrir la ventana de impresión. Permite las ventanas emergentes.");
    }
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Nuestra Carta",
          url: menuUrl,
        });
      } catch {
        // user cancelled – no error needed
      }
    } else {
      // Fallback: copy to clipboard
      handleCopy();
      toast.info("Compartir no disponible en este navegador. URL copiada al portapapeles.");
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={handlePrint}
          variant="secondary"
          className="cursor-pointer gap-2 h-14 flex-col text-sm"
        >
          <Printer className="w-5 h-5" />
          Imprimir carta
        </Button>
        <Button
          onClick={handleShare}
          variant="secondary"
          className="cursor-pointer gap-2 h-14 flex-col text-sm"
        >
          <Share2 className="w-5 h-5" />
          Compartir
        </Button>
        <Button
          onClick={handleDownloadQR}
          variant="secondary"
          className="cursor-pointer gap-2 h-14 flex-col text-sm"
        >
          <Download className="w-5 h-5" />
          Descargar QR
        </Button>
        <Button
          onClick={handleDownloadUrl}
          variant="secondary"
          className="cursor-pointer gap-2 h-14 flex-col text-sm"
        >
          <Link className="w-5 h-5" />
          Descargar URL
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle style={{ fontFamily: "var(--font-serif)" }}>Código QR de la carta</CardTitle>
          <CardDescription>
            Tus clientes pueden escanear el QR o acceder directamente con el enlace.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          {/* QR Code canvas */}
          <div className="rounded-xl overflow-hidden border border-border/60 p-3 bg-[#fafaf9]">
            <canvas ref={canvasRef} className="block" />
          </div>

          {/* URL row */}
          <div className="w-full flex gap-2">
            <Input
              readOnly
              value={menuUrl}
              className="text-sm text-muted-foreground font-mono"
            />
            <Button
              variant="secondary"
              size="icon"
              onClick={handleCopy}
              className="shrink-0 cursor-pointer"
              title="Copiar URL"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
