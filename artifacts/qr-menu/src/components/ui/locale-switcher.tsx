import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  setLocaleInPath,
  SUPPORTED_LOCALES,
  SUPPORTED_LOCALES_ARRAY,
  type SupportedLocale,
} from "@/i18n";
import { cn } from "@/lib/utils.ts";
import { Check, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

type LocaleMeta = (typeof SUPPORTED_LOCALES)[keyof typeof SUPPORTED_LOCALES];

function FlagDisplay({ meta, className }: { meta: LocaleMeta; className?: string }) {
  if ("flagUrl" in meta && meta.flagUrl) {
    return <img src={meta.flagUrl} alt={meta.name} className={cn("inline-block object-cover rounded-sm", className ?? "w-5 h-4")} />;
  }
  return <span>{meta.emoji}</span>;
}

export default function LocaleSwitcher() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const currentMeta = SUPPORTED_LOCALES[i18n.language as keyof typeof SUPPORTED_LOCALES];

  const handleChangeLocale = (newLng: SupportedLocale) => {
    const newPath = setLocaleInPath(newLng, location.pathname, location.search, location.hash);
    navigate(newPath);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="cursor-pointer text-white/70 hover:text-white hover:bg-white/10">
          <Globe className="mr-1.5 h-3.5 w-3.5" />
          <span className="mr-1"><FlagDisplay meta={currentMeta} /></span>
          <span className="text-xs">{currentMeta?.nativeName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {SUPPORTED_LOCALES_ARRAY.map((lng) => {
          const meta = SUPPORTED_LOCALES[lng];
          const isActive = i18n.language === lng;
          return (
            <DropdownMenuItem
              key={lng}
              onClick={() => handleChangeLocale(lng)}
              className="cursor-pointer"
            >
              <Check className={cn("mr-2 h-4 w-4 shrink-0", isActive ? "opacity-100" : "opacity-0")} />
              <span className="mr-2"><FlagDisplay meta={meta} /></span>
              <span className="flex-1">{meta.nativeName}</span>
              <span className="text-muted-foreground ml-2 text-xs">{meta.name}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
