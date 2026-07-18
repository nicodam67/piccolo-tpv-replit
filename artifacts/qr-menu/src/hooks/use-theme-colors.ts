import { useEffect } from "react";
import { applyThemeColors, removeThemeColors, applyThemeFonts } from "@/lib/theme.ts";

type Colors = {
  primary?: string;
  background?: string;
  accent?: string;
  heroTitleColor?: string;
  heroTaglineColor?: string;
  heroEstablishedColor?: string;
  callButtonBg?: string;
  callButtonText?: string;
  scheduleButtonBg?: string;
  scheduleButtonText?: string;
  tapDetailsColor?: string;
};

type Fonts = {
  heading?: string;
  body?: string;
  headingColor?: string;
  bodyColor?: string;
};

export function useThemeColors(colors: Colors | null | undefined) {
  useEffect(() => {
    if (!colors) {
      // Still inject the price color rule even with no custom colors
      applyThemeColors({});
      return () => { removeThemeColors(); };
    }
    applyThemeColors(colors);
    return () => {
      removeThemeColors();
    };
  }, [colors?.primary, colors?.background, colors?.accent, colors?.heroTitleColor, colors?.heroTaglineColor, colors?.heroEstablishedColor, colors?.callButtonBg, colors?.callButtonText, colors?.scheduleButtonBg, colors?.scheduleButtonText, colors?.tapDetailsColor]);
}

export function useThemeFonts(fonts: Fonts | null | undefined) {
  useEffect(() => {
    if (!fonts) return;
    if (fonts.heading || fonts.body || fonts.headingColor || fonts.bodyColor) {
      applyThemeFonts(fonts);
    }
  }, [fonts?.heading, fonts?.body, fonts?.headingColor, fonts?.bodyColor]);
}
