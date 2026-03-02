/**
 * Modül düzeyinde analiz state'i — React component unmount olsa bile kaybolmaz.
 * BankDocumentsPanel başka menüye geçip geri döndüğünde analiz korunur.
 */

import { BankStatement, BankTransaction, MatchResult } from "./bankService";

export interface TxWithMatch {
  tx: BankTransaction;
  match: MatchResult | null;
}

interface AnalysisState {
  statement: BankStatement | null;
  txMatches: TxWithMatch[];
  fileName: string;
  isSaved: boolean;
}

let _state: AnalysisState = {
  statement: null,
  txMatches: [],
  fileName: "",
  isSaved: false,
};

export const bankAnalysisStore = {
  get: (): AnalysisState => ({ ..._state, txMatches: [..._state.txMatches] }),
  set: (updates: Partial<AnalysisState>) => {
    _state = { ..._state, ...updates };
  },
  clear: () => {
    _state = { statement: null, txMatches: [], fileName: "", isSaved: false };
  },
};
