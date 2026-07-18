/**
 * Placeholder genérico para secciones del módulo Fichaje pendientes de desarrollo completo.
 * Muestra el nombre de la sección y permite navegar al panel principal.
 */
import { Construction } from "lucide-react";

interface Props {
  title: string;
  description?: string;
}

export default function FichajePlaceholder({ title, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <Construction size={48} className="text-teal-500/40 mb-4" />
      <h2 className="text-xl font-bold text-foreground mb-2">{title}</h2>
      <p className="text-muted-foreground text-sm max-w-sm">
        {description ?? "Esta sección está en desarrollo. Las funcionalidades estarán disponibles próximamente."}
      </p>
    </div>
  );
}
