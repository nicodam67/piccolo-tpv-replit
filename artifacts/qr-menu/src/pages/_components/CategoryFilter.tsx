import { motion } from "motion/react";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import { localizeCategory } from "@/lib/translations.ts";
import { useParams } from "react-router-dom";
import { isSupportedLocale } from "@/i18n.ts";

type Props = {
  categories: Doc<"categories">[];
  activeId: Id<"categories"> | undefined;
  onSelect: (id: Id<"categories">) => void;
};

export default function CategoryFilter({ categories, activeId, onSelect }: Props) {
  const { lng } = useParams<{ lng: string }>();
  const locale = isSupportedLocale(lng) ? lng : "en";

  return (
    <div className="flex gap-1 px-6 py-3 overflow-x-auto scrollbar-none">
      {categories.map((cat) => {
        const isActive = cat._id === activeId;
        const { name } = localizeCategory(cat, locale);
        return (
          <button
            key={cat._id}
            onClick={() => onSelect(cat._id)}
            className="relative shrink-0 px-5 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer"
            style={{
              color: isActive ? "var(--primary-foreground)" : "var(--muted-foreground)",
              background: isActive ? "var(--primary)" : "transparent",
            }}
          >
            {isActive && (
              <motion.span
                layoutId="category-pill"
                className="absolute inset-0 rounded-full"
                style={{ background: "var(--primary)" }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
              />
            )}
            <span className="relative z-10">{name}</span>
          </button>
        );
      })}
    </div>
  );
}
