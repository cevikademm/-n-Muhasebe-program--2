export interface LearningRule {
  id: string;
  supplierName: string;
  accountCode: string;
  oldAccountCode?: string;
  itemDescription?: string;
  createdAt: string;
}

const storageKey = (userId?: string) => userId ? `fibu_learning_rules_${userId}` : "fibu_learning_rules";

export const getLearningRules = (userId?: string): LearningRule[] => {
  try {
    // User-specific key
    if (userId) {
      const data = localStorage.getItem(storageKey(userId));
      if (data) return JSON.parse(data);
    }
    // Fallback: eski global key (migration)
    const old = localStorage.getItem("fibu_learning_rules");
    if (old) {
      const parsed = JSON.parse(old);
      if (userId) {
        localStorage.setItem(storageKey(userId), old);
        localStorage.removeItem("fibu_learning_rules");
      }
      return parsed;
    }
    return [];
  } catch (err) {
    console.error("Error reading learning rules", err);
    return [];
  }
};

export const saveLearningRule = (rule: Omit<LearningRule, "id" | "createdAt">, userId?: string): LearningRule => {
  const rules = getLearningRules(userId);
  const newRule: LearningRule = {
    ...rule,
    id: "rule-" + Date.now(),
    createdAt: new Date().toISOString()
  };

  // Overwrite existing rule for same supplier & same description
  const existingIndex = rules.findIndex(r =>
    r.supplierName.toLowerCase() === rule.supplierName.toLowerCase() &&
    (r.itemDescription || "").toLowerCase() === (rule.itemDescription || "").toLowerCase()
  );

  if (existingIndex >= 0) {
    rules[existingIndex] = newRule;
  } else {
    rules.push(newRule);
  }

  localStorage.setItem(storageKey(userId), JSON.stringify(rules));
  return newRule;
};
