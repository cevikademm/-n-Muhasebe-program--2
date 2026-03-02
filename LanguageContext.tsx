import { createContext, useContext } from "react";
import { Translations, Language } from "./types";

interface LangContextType {
  t: Translations;
  lang: Language;
  setLang: (lang: Language) => void;
}

export const LangContext = createContext<LangContextType | undefined>(undefined);

export const useLang = () => {
  const context = useContext(LangContext);
  if (!context) throw new Error("useLang must be used within a LangProvider");
  return context;
};
